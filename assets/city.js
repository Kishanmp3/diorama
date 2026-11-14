// Procedural sample city in the same feature format as real OpenStreetMap data.
// Used for the landing page turntable and for offline demos.
export function sampleCity(R = 420, seed = 11) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const F = { buildings: [], roads: [], rails: [], water: [], waterLines: [], parks: [], trees: [], parking: [], sand: [] };
  const inC = (x, z, m = 0) => x * x + z * z < (R - m) ** 2;
  const ang = .38, ca = Math.cos(ang), sa = Math.sin(ang); const rot = ([x, z]) => [x * ca - z * sa, x * sa + z * ca];
  // river: a gentle curve across the plinth
  const riverZ = (x) => R * .52 + Math.sin(x / R * 2.2) * R * .1;
  const bank = []; for (let x = -R * 1.2; x <= R * 1.2; x += 20) bank.push([x, riverZ(x) - 34]); for (let x = R * 1.2; x >= -R * 1.2; x -= 20) bank.push([x, riverZ(x) + 34]);
  F.water.push({ ring: clipToCircle(bank, R), name: 'Silver River' });
  // promenade + bridge roads
  const prom = []; for (let x = -R; x <= R; x += 15) if (inC(x, riverZ(x) - 44, 2)) prom.push([x, riverZ(x) - 44]); if (prom.length > 1) F.roads.push({ pts: prom, width: 6, kind: 'pedestrian', name: 'River Walk' });
  // grid
  const step = 62, half = Math.ceil(R / step) + 2; const park = { cx: -1, cz: -2 };
  for (let i = -half; i <= half; i++) {
    const a = [], b = [];
    for (let k = -half * step; k <= half * step; k += 10) { const p1 = rot([i * step, k]), p2 = rot([k, i * step]); if (inC(...p1, 1) && p1[1] < riverZ(p1[0]) - 40) a.push(p1); else if (a.length) { if (a.length > 1) F.roads.push({ pts: a.splice(0), width: i % 3 ? 7 : 11, kind: i % 3 ? 'residential' : 'primary', name: i % 3 ? null : `${['North', 'Market', 'Grand', 'Union', 'Harbor'][Math.abs(i) % 5]} Avenue` }); else a.length = 0; } if (inC(...p2, 1) && p2[1] < riverZ(p2[0]) - 40) b.push(p2); else if (b.length) { if (b.length > 1) F.roads.push({ pts: b.splice(0), width: i % 3 ? 7 : 11, kind: i % 3 ? 'residential' : 'secondary', name: i % 3 ? null : `${i * 2 + 20}th Street` }); else b.length = 0; } }
    if (a.length > 1) F.roads.push({ pts: a, width: i % 3 ? 7 : 11, kind: i % 3 ? 'residential' : 'primary' }); if (b.length > 1) F.roads.push({ pts: b, width: i % 3 ? 7 : 11, kind: 'residential' });
  }
  // bridge
  const bx = R * .08; F.roads.push({ pts: [rot([bx, -10]).map((v, i) => v), [bx, riverZ(bx) - 40], [bx, riverZ(bx) + 40], [bx, R * .95]].filter(p => inC(...p)), width: 12, kind: 'primary', name: 'Lantern Bridge', bridge: true });
  // blocks
  let id = 1;
  for (let i = -half; i < half; i++) for (let j = -half; j < half; j++) {
    const x0 = i * step + 7, z0 = j * step + 7, w = step - 14;
    const c = rot([x0 + w / 2, z0 + w / 2]); if (!inC(...c, 30) || c[1] > riverZ(c[0]) - 60) continue;
    if (i === park.cx && j === park.cz || (i === park.cx + 1 && j === park.cz)) { if (i === park.cx) F.parks.push({ ring: [[x0, z0], [x0 + w * 2 + 14, z0], [x0 + w * 2 + 14, z0 + w], [x0, z0 + w]].map(rot), name: 'Juniper Park', kind: 'park', wooded: false }); continue; }
    const d = Math.hypot(...c) / R; const cbd = Math.max(0, 1 - d * 1.5);
    const split = rnd() < .5 ? 2 : 3; const lot = w / split;
    for (let a = 0; a < split; a++) for (let b2 = 0; b2 < split; b2++) {
      if (rnd() < .08) continue; const inset = 2 + rnd() * 3;
      const lx = x0 + a * lot + inset, lz = z0 + b2 * lot + inset, lw = lot - inset * 2 - rnd() * 4, ld = lot - inset * 2 - rnd() * 4;
      let h = 8 + rnd() * 14 + cbd * cbd * (60 + rnd() * 160); if (rnd() < .05 && cbd > .5) h += 120;
      const ring = [[lx, lz], [lx + lw, lz], [lx + lw, lz + ld], [lx, lz + ld]].map(rot);
      const cc = rot([lx + lw / 2, lz + ld / 2]); if (!inC(...cc, 6)) continue;
      F.buildings.push({ ring: ensureCCW(ring), height: h, minH: 0, name: h > 160 ? ['Meridian Tower', 'The Lantern', 'Halcyon One', 'Copperline'][id % 4] : null, kind: h > 60 ? 'office' : h > 20 ? 'apartments' : 'house', levels: Math.round(h / 3.2), id: id++ });
      if (h > 90 && rnd() < .6) { const t = .25; F.buildings.push({ ring: ensureCCW([[lx + lw * t, lz + ld * t], [lx + lw * (1 - t), lz + ld * t], [lx + lw * (1 - t), lz + ld * (1 - t)], [lx + lw * t, lz + ld * (1 - t)]].map(rot)), height: h + 14 + rnd() * 30, minH: h, kind: 'office', id: id++ }); }
    }
  }
  // south bank: low houses and trees
  for (let k = 0; k < 160; k++) { const x = (rnd() - .5) * R * 2, z = riverZ(x) + 50 + rnd() * R * .5; if (!inC(x, z, 12)) continue; if (rnd() < .55) F.trees.push([x, z]); else { const w = 8 + rnd() * 8, d = 7 + rnd() * 7, a = rnd() * 3; const ca2 = Math.cos(a), sa2 = Math.sin(a); const ring = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([u, v]) => [x + u * ca2 - v * sa2, z + u * sa2 + v * ca2]); F.buildings.push({ ring: ensureCCW(ring), height: 6 + rnd() * 5, minH: 0, kind: 'house', id: id++ }); } }
  // street trees
  for (const r of F.roads.filter(r => r.kind === 'primary')) for (let i = 0; i < r.pts.length; i += 2) { const [x, z] = r.pts[i]; if (rnd() < .5 && inC(x + 9, z, 4)) F.trees.push([x + 9 * Math.cos(ang), z + 9 * Math.sin(ang)]); }
  return F;
}
function ensureCCW(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s < 0 ? [...r].reverse() : r; }
function clipToCircle(poly, R) { const n = 72; const clip = [...Array(n)].map((_, i) => [Math.cos(i / n * Math.PI * 2) * R, Math.sin(i / n * Math.PI * 2) * R]); let out = ensureCCW(poly);
  for (let i = 0; i < clip.length && out.length; i++) { const A = clip[i], B = clip[(i + 1) % n]; const ins = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= 0; const X = (p, q) => { const a1 = B[1] - A[1], b1 = A[0] - B[0], c1 = a1 * A[0] + b1 * A[1], a2 = q[1] - p[1], b2 = p[0] - q[0], c2 = a2 * p[0] + b2 * p[1], d = a1 * b2 - a2 * b1; return [(b2 * c1 - b1 * c2) / d, (a1 * c2 - a2 * c1) / d]; }; const inp = out; out = []; for (let k = 0; k < inp.length; k++) { const P = inp[k], Q = inp[(k + 1) % inp.length]; if (ins(P)) { out.push(P); if (!ins(Q)) out.push(X(P, Q)); } else if (ins(Q)) out.push(X(P, Q)); } }
  return out; }

/** Convert features back to Overpass-style JSON (used for offline tests of the real pipeline). */
export function toOverpass(F, lat0, lng0) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), kz = 110540; const g = (r) => r.map(([x, z]) => ({ lat: lat0 - z / kz, lon: lng0 + x / kx }));
  const close = (r) => [...r, r[0]]; let id = 1; const el = [];
  for (const b of F.buildings) el.push({ type: 'way', id: id++, tags: { building: b.kind, height: String(b.height.toFixed(1)), ...(b.minH ? { min_height: String(b.minH), 'building:part': 'yes' } : {}), ...(b.name ? { name: b.name } : {}) }, geometry: g(close(b.ring)) });
  for (const r of F.roads) el.push({ type: 'way', id: id++, tags: { highway: r.kind, ...(r.name ? { name: r.name } : {}) }, geometry: g(r.pts) });
  for (const w of F.water) el.push({ type: 'way', id: id++, tags: { natural: 'water', name: w.name }, geometry: g(close(w.ring)) });
  for (const p of F.parks) el.push({ type: 'way', id: id++, tags: { leisure: 'park', name: p.name }, geometry: g(close(p.ring)) });
  for (const [x, z] of F.trees) el.push({ type: 'node', id: id++, lat: lat0 - z / kz, lon: lng0 + x / kx, tags: { natural: 'tree' } });
  return { elements: el };
}
