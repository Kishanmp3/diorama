// Location parsing, OpenStreetMap fetching and conversion to flat local-meter features.

/** Pull coordinates out of anything a person might paste. Returns {lat,lng,zoom?} or null. */
export function parseCoords(input) {
  const s = String(input).trim(); let m;
  if ((m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/))) return { lat: +m[1], lng: +m[2] };
  if ((m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)(?:,(\d+(?:\.\d+)?)z)?/))) return { lat: +m[1], lng: +m[2], zoom: m[3] ? +m[3] : undefined };
  if ((m = s.match(/[?&](?:q|query|ll|center|destination|daddr)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i))) return { lat: +m[1], lng: +m[2] };
  if ((m = s.match(/^\s*(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)\s*$/))) return { lat: +m[1], lng: +m[2] };
  if ((m = s.match(/(\d+)°\s*(\d+)['′]\s*([\d.]+)["″]?\s*([NS])[\s,]+(\d+)°\s*(\d+)['′]\s*([\d.]+)["″]?\s*([EW])/i))) {
    const lat = (+m[1] + m[2] / 60 + m[3] / 3600) * (/s/i.test(m[4]) ? -1 : 1), lng = (+m[5] + m[6] / 60 + m[7] / 3600) * (/w/i.test(m[8]) ? -1 : 1); return { lat, lng };
  }
  return null;
}
export const isShortLink = (s) => /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(String(s).trim());
const placeFromUrl = (s) => { const m = String(s).match(/\/maps\/place\/([^/@?]+)/); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null; };

/** Resolve any input (link, coordinates, address) to {lat,lng,label}. */
export async function locate(input) {
  let s = String(input).trim(); if (!s) throw new Error('Paste a Google Maps link or type a place.');
  if (isShortLink(s)) {
    const r = await fetch('/api/resolve?url=' + encodeURIComponent(s.startsWith('http') ? s : 'https://' + s)).then(r => r.json()).catch(() => ({}));
    if (r.url) s = r.url; else throw new Error("Couldn't open that short link. Open it in Google Maps and paste the full address-bar URL instead.");
  }
  const c = parseCoords(s); const label = placeFromUrl(s);
  if (c) return { ...c, label: label || null };
  const q = label || s;
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { 'accept-language': 'en' } }).then(r => r.json()).catch(() => []);
  if (!res?.length) throw new Error(`Couldn't find "${q}". Try a fuller address, or paste a Google Maps link.`);
  return { lat: +res[0].lat, lng: +res[0].lon, label: res[0].display_name.split(',').slice(0, 3).join(',') };
}
export async function reverseName(lat, lng) {
  try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lng}`, { headers: { 'accept-language': 'en' } }).then(r => r.json()); const a = r.address || {}; return [a.neighbourhood || a.suburb || a.quarter || a.road, a.city || a.town || a.village || a.county, a.country].filter(Boolean).join(', ') || r.display_name; } catch { return null; }
}

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
export async function fetchOSM(lat, lng, radius, onStatus = () => {}) {
  const a = `(around:${Math.round(radius * 1.08)},${lat.toFixed(6)},${lng.toFixed(6)})`;
  const q = `[out:json][timeout:40];(
    way["building"]${a};relation["building"]${a};way["building:part"]${a};
    way["highway"]${a};way["railway"~"rail|light_rail|subway|tram"]${a};
    way["natural"~"water|wood|scrub|grassland|beach|sand"]${a};relation["natural"="water"]${a};way["waterway"~"riverbank|river|canal|stream"]${a};relation["waterway"="riverbank"]${a};
    way["leisure"~"park|garden|pitch|playground|golf_course|nature_reserve|stadium"]${a};relation["leisure"="park"]${a};
    way["landuse"~"grass|forest|meadow|park|recreation_ground|village_green|cemetery"]${a};
    way["amenity"="parking"]${a};node["natural"="tree"]${a};
  );out geom qt;`;
  let lastErr;
  for (const [i, url] of ENDPOINTS.entries()) {
    try {
      onStatus(i ? `Main map server is busy, trying mirror ${i}` : 'Asking OpenStreetMap for every building');
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
      if (r.status === 429 || r.status >= 500) throw new Error(`busy (${r.status})`);
      const j = await r.json(); if (!j.elements) throw new Error('empty response'); return j;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`OpenStreetMap didn't answer (${lastErr?.message}). Wait a few seconds and try again.`);
}

/* ---------- geometry helpers ---------- */
export function projector(lat0, lng0) { const kx = 111320 * Math.cos(lat0 * Math.PI / 180), kz = 110540; return { to: (lat, lng) => [(lng - lng0) * kx, -(lat - lat0) * kz], from: (x, z) => [lat0 - z / kz, lng0 + x / kx] }; }
export const area = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; };
export const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
function circlePoly(R, n = 72) { return [...Array(n)].map((_, i) => [Math.cos(i / n * Math.PI * 2) * R, Math.sin(i / n * Math.PI * 2) * R]); }
/** Sutherland–Hodgman: clip any polygon to a convex clip polygon (counter-clockwise). */
export function clipPoly(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const A = clip[i], B = clip[(i + 1) % clip.length]; const inside = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= 0;
    const inter = (p, q) => { const a1 = B[1] - A[1], b1 = A[0] - B[0], c1 = a1 * A[0] + b1 * A[1], a2 = q[1] - p[1], b2 = p[0] - q[0], c2 = a2 * p[0] + b2 * p[1], d = a1 * b2 - a2 * b1; return d ? [(b2 * c1 - b1 * c2) / d, (a1 * c2 - a2 * c1) / d] : p; };
    const input = out; out = [];
    for (let k = 0; k < input.length; k++) { const P = input[k], Q = input[(k + 1) % input.length]; const pi = inside(P), qi = inside(Q); if (pi) { out.push(P); if (!qi) out.push(inter(P, Q)); } else if (qi) out.push(inter(P, Q)); }
  }
  return out;
}
function clipLine(pts, R) {
  const segs = []; let cur = [];
  const inC = (p) => p[0] * p[0] + p[1] * p[1] <= R * R;
  const hit = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const A = dx * dx + dz * dz, B = 2 * (a[0] * dx + a[1] * dz), C = a[0] * a[0] + a[1] * a[1] - R * R; const D = Math.sqrt(Math.max(0, B * B - 4 * A * C)); const ts = [(-B - D) / (2 * A), (-B + D) / (2 * A)].filter(t => t >= 0 && t <= 1); return ts.map(t => [a[0] + dx * t, a[1] + dz * t]); };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) { if (inC(p)) cur.push(p); continue; }
    const q = pts[i - 1], pin = inC(p), qin = inC(q), h = hit(q, p);
    if (qin && pin) cur.push(p);
    else if (qin && !pin) { cur.push(h.at(-1) || p); segs.push(cur); cur = []; }
    else if (!qin && pin) { cur = [h[0] || q, p]; }
    else if (h.length === 2) segs.push([h[0], h[1]]);
  }
  if (cur.length > 1) segs.push(cur);
  return segs.filter(s => s.length > 1);
}

/* ---------- OSM → features ---------- */
const num = (v) => { if (v == null) return null; const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/); if (!m) return null; let n = +m[0]; if (/ft|'/.test(v)) n *= .3048; return n; };
const ROAD_W = { motorway: 14, trunk: 12, primary: 11, secondary: 9, tertiary: 8, unclassified: 6, residential: 6, living_street: 5, service: 4, pedestrian: 5, footway: 2.2, path: 2, cycleway: 2.2, steps: 2, track: 3, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 6, tertiary_link: 5 };
const DEFAULT_H = { house: 7, detached: 7, residential: 12, apartments: 18, commercial: 14, retail: 8, office: 30, industrial: 9, warehouse: 9, church: 18, cathedral: 34, school: 12, university: 16, hospital: 22, hotel: 28, garage: 3.5, garages: 3.5, shed: 3, roof: 4, train_station: 14, stadium: 22, yes: 10 };

export function toFeatures(osm, lat0, lng0, R) {
  const P = projector(lat0, lng0); const clipC = circlePoly(R);
  const F = { buildings: [], roads: [], rails: [], water: [], waterLines: [], parks: [], trees: [], parking: [], sand: [] };
  const ring = (geom) => geom?.map(g => P.to(g.lat, g.lon));
  const inside = (r) => { const c = centroid(r); return c[0] * c[0] + c[1] * c[1] <= R * R; };
  const pushPoly = (list, rings, extra = {}) => { for (let r of rings) { if (r.length < 3) continue; if (area(r) < 0) r = [...r].reverse(); const c = clipPoly(r, clipC); if (c.length >= 3 && Math.abs(area(c)) > 2) list.push({ ring: c, ...extra }); } };
  const relRings = (el, role = 'outer') => (el.members || []).filter(m => m.type === 'way' && (m.role || 'outer') === role && m.geometry).map(m => ring(m.geometry));
  const stitch = (rings) => { // join open way segments of a multipolygon into closed rings
    const out = []; const open = rings.map(r => [...r]);
    while (open.length) { let cur = open.shift(); let grew = true;
      while (grew && !(cur.length > 3 && cur[0][0] === cur.at(-1)[0] && cur[0][1] === cur.at(-1)[1])) { grew = false;
        for (let i = 0; i < open.length; i++) { const o = open[i]; const eq = (a, b) => Math.abs(a[0] - b[0]) < .01 && Math.abs(a[1] - b[1]) < .01;
          if (eq(cur.at(-1), o[0])) { cur = cur.concat(o.slice(1)); } else if (eq(cur.at(-1), o.at(-1))) { cur = cur.concat([...o].reverse().slice(1)); } else continue; open.splice(i, 1); grew = true; break; } }
      out.push(cur); }
    return out;
  };
  const hasPart = new Set();
  for (const el of osm.elements) if (el.tags?.['building:part']) hasPart.add('p');
  for (const el of osm.elements) {
    const t = el.tags || {};
    if (el.type === 'node') { if (t.natural === 'tree') { const p = P.to(el.lat, el.lon); if (p[0] ** 2 + p[1] ** 2 < R * R) F.trees.push(p); } continue; }
    const isRel = el.type === 'relation';
    const outers = isRel ? stitch(relRings(el)) : [ring(el.geometry)];
    if (!outers[0]?.length) continue;
    if (t.building || t['building:part']) {
      if (t.building === 'roof' && !t.height) continue;
      const kind = t.building && t.building !== 'yes' ? t.building : (t.amenity || t.shop || t.office ? 'commercial' : 'yes');
      let h = num(t.height) ?? (num(t['building:levels']) != null ? num(t['building:levels']) * 3.2 + (num(t['roof:levels']) || 0) * 2.5 : null);
      const estimated = h == null; if (h == null) h = DEFAULT_H[kind] ?? 10;
      const minH = num(t.min_height) ?? (num(t['building:min_level']) != null ? num(t['building:min_level']) * 3.2 : 0);
      for (const r of outers) if (r.length > 2 && inside(r)) pushPoly(F.buildings, [r], { height: Math.max(2, Math.min(h, 900)), minH: Math.max(0, minH), name: t.name || null, kind, levels: num(t['building:levels']), estimated, id: el.id, part: !!t['building:part'] });
      continue;
    }
    if (t.highway && !isRel) { const w = num(t.width) || ROAD_W[t.highway]; if (!w || t.area === 'yes') continue; for (const seg of clipLine(outers[0], R)) F.roads.push({ pts: seg, width: w, kind: t.highway, name: t.name || null, bridge: t.bridge === 'yes', tunnel: t.tunnel === 'yes' }); continue; }
    if (t.railway && !isRel) { if (t.tunnel === 'yes') continue; for (const seg of clipLine(outers[0], R)) F.rails.push({ pts: seg, name: t.name || null }); continue; }
    if (t.natural === 'water' || t.waterway === 'riverbank' || (t.landuse === 'reservoir')) { pushPoly(F.water, outers, { name: t.name || null }); continue; }
    if (t.waterway && !isRel) { const w = t.waterway === 'river' ? 18 : t.waterway === 'canal' ? 12 : 4; for (const seg of clipLine(outers[0], R)) F.waterLines.push({ pts: seg, width: w, name: t.name || null }); continue; }
    if (t.leisure || ['grass', 'forest', 'meadow', 'park', 'recreation_ground', 'village_green', 'cemetery'].includes(t.landuse) || ['wood', 'scrub', 'grassland'].includes(t.natural)) { pushPoly(F.parks, outers, { name: t.name || null, kind: t.leisure || t.landuse || t.natural, wooded: t.landuse === 'forest' || t.natural === 'wood' }); continue; }
    if (t.natural === 'beach' || t.natural === 'sand') { pushPoly(F.sand, outers); continue; }
    if (t.amenity === 'parking') { pushPoly(F.parking, outers); continue; }
  }
  // drop building outlines fully covered by building:parts (avoid z-fighting)
  if (hasPart.size) { const parts = F.buildings.filter(b => b.part); F.buildings = F.buildings.filter(b => b.part || !parts.some(p => { const c = centroid(p.ring); return pointIn(c, b.ring); }) || b.height > Math.max(...parts.filter(p => pointIn(centroid(p.ring), b.ring)).map(p => p.height), 0)); }
  return F;
}
export function pointIn(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; }

export function stats(F) {
  const tall = [...F.buildings].sort((a, b) => b.height - a.height);
  const len = (pts) => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
  return { buildings: F.buildings.length, tallest: tall[0] || null, roadKm: F.roads.reduce((s, r) => s + len(r.pts), 0) / 1000, parkArea: F.parks.reduce((s, p) => s + Math.abs(area(p.ring)), 0), waterArea: F.water.reduce((s, p) => s + Math.abs(area(p.ring)), 0), trees: F.trees.length, avgHeight: F.buildings.reduce((s, b) => s + b.height, 0) / Math.max(1, F.buildings.length) };
}
