import { Diorama, STYLES } from './engine.js';
import { locate, fetchOSM, toFeatures, stats, reverseName, centroid, area } from './osm.js';
import { sampleCity } from './city.js';
import { claude, aiStatus, settings, textOf, extractJSON } from './ai-client.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); };
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const dark = (n) => ['night', 'wire', 'blueprint'].includes(n) || STYLES[n]?.night;

let hoverOn = true;
const tip = $('#tip');
const d = new Diorama($('#c'), { capture: true, onHover: (b, e) => {
  if (!hoverOn || !b || touring) { tip.hidden = true; return; }
  tip.hidden = false; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px';
  tip.innerHTML = `<b>${esc(b.name || kindLabel(b.kind))}</b><span>${Math.round(b.height)} m${b.estimated ? ' (estimated)' : ''}${b.levels ? `, ${b.levels} floors` : ''}${b.name ? `, ${esc(kindLabel(b.kind)).toLowerCase()}` : ''}</span>`;
} });
const kindLabel = (k) => ({ yes: 'Building', apartments: 'Apartments', house: 'House', commercial: 'Commercial', retail: 'Shops', office: 'Offices', industrial: 'Industrial', church: 'Church', cathedral: 'Cathedral', school: 'School', university: 'University', hospital: 'Hospital', hotel: 'Hotel', residential: 'Homes', garage: 'Garage', train_station: 'Station' }[k] || (k ? k[0].toUpperCase() + k.slice(1).replace(/_/g, ' ') : 'Building'));
$('#c').addEventListener('pointerleave', () => tip.hidden = true);
d.offsetX = (w) => w > 900 ? [-190, 0] : [0, Math.round(innerHeight * .2)]; d.resize();

const state = { F: null, R: 400, style: LS.get('dio.style', 'clay'), loc: null, name: '', tour: null, stop: -1 };

/* ---------- chips & controls ---------- */
function renderChips() { $('#chips').innerHTML = Object.entries(STYLES).map(([k, s]) => `<button data-style="${k}" aria-pressed="${k === state.style}">${esc(s.label)}</button>`).join(''); $$('[data-style]').forEach(b => b.onclick = () => setStyle(b.dataset.style)); }
function setStyle(n) { state.style = n; LS.set('dio.style', n); document.body.classList.toggle('dark', dark(n)); if (state.F) d.build(state.F, state.R, n); renderChips(); }
$('#tod').oninput = (e) => d.setTime(+e.target.value);
const tog = (id, fn) => $(id).onclick = () => { const v = $(id).getAttribute('aria-checked') !== 'true'; $(id).setAttribute('aria-checked', v); fn(v); };
tog('#tTilt', v => d.setTilt(v)); tog('#tSpin', v => d.controls.autoRotate = v); tog('#tHover', v => { hoverOn = v; tip.hidden = true; });
$('#home').onclick = () => { d.home(); };
$('#radius').oninput = (e) => $('#rOut').textContent = `${e.target.value} m`;

/* ---------- build ---------- */
function loading(on, t, p) { $('#loading').hidden = !on; if (t) $('#lT').textContent = t; if (p) $('#lP').textContent = p; }
function showErr(t) { $('#err').hidden = !t; $('#err').textContent = t || ''; }
async function build(input, R = +$('#radius').value, opts = {}) {
  showErr(''); endTour(); loading(true, 'Building your model', 'Finding the place');
  try {
    const loc = opts.loc || await locate(input);
    loading(true, 'Building your model', 'Asking OpenStreetMap for every building');
    const osm = await fetchOSM(loc.lat, loc.lng, R, (m) => $('#lP').textContent = m);
    $('#lP').textContent = `Shaping ${fmt(osm.elements.length)} map features`;
    await new Promise(r => setTimeout(r, 20));
    const F = toFeatures(osm, loc.lat, loc.lng, R);
    if (!F.buildings.length && !F.roads.length) throw new Error("OpenStreetMap has nothing mapped here yet. Try a busier spot or a bigger radius.");
    state.F = F; state.R = R; state.loc = loc;
    d.framed = false; d.build(F, R, state.style); d.controls.autoRotate = $('#tSpin').getAttribute('aria-checked') === 'true';
    state.name = loc.label || await reverseName(loc.lat, loc.lng) || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
    renderPlace(); remember(input, state.name);
    history.replaceState(null, '', `#at=${loc.lat.toFixed(5)},${loc.lng.toFixed(5)},${R},${state.style}`);
  } catch (e) { showErr(e.message); }
  loading(false);
}
function renderPlace() {
  const S = stats(state.F); state.stats = S;
  $('#placeBlk').hidden = false; $('#tourBlk').hidden = false;
  $('#pName').textContent = state.name; $('#pCoords').textContent = state.loc ? `${state.loc.lat.toFixed(5)}, ${state.loc.lng.toFixed(5)}, ${state.R} m radius` : 'Sample city';
  $('#stats').innerHTML = `<div><b>${fmt(S.buildings)}</b><span>Buildings</span></div><div><b>${S.tallest ? Math.round(S.tallest.height) + ' m' : 'n/a'}</b><span>Tallest${S.tallest?.name ? ': ' + esc(S.tallest.name) : ''}</span></div>
    <div><b>${fmt(S.avgHeight, 0)} m</b><span>Average height</span></div><div><b>${fmt(S.roadKm, 1)} km</b><span>Roads</span></div>
    <div><b>${fmt(S.parkArea / 1e4, 1)} ha</b><span>Green space</span></div><div><b>${fmt(S.waterArea / 1e4, 1)} ha</b><span>Water</span></div>`;
  $('#stops').innerHTML = ''; $('#tourIntro').textContent = ''; $('#tourHint').textContent = '';
  document.title = `${state.name.split(',')[0]} in Diorama`;
}
function remember(q, name) { if (!q) return; const r = LS.get('dio.recent', []).filter(x => x.q !== q); r.unshift({ q, name: name.split(',')[0] }); LS.set('dio.recent', r.slice(0, 6)); renderRecent(); }
function renderRecent() { const r = LS.get('dio.recent', []); $('#recent').innerHTML = (r.length ? r : [{ q: 'Flatiron Building, New York', name: 'Flatiron' }, { q: 'Shibuya Crossing, Tokyo', name: 'Shibuya' }, { q: 'Piazza San Marco, Venice', name: 'Venice' }, { q: 'Golden Gate Park, San Francisco', name: 'Golden Gate Park' }]).map(x => `<button type="button" data-q="${esc(x.q)}">${esc(x.name)}</button>`).join(''); $$('#recent button').forEach(b => b.onclick = () => { $('#q').value = b.dataset.q; build(b.dataset.q); }); }
$('#locForm').onsubmit = (e) => { e.preventDefault(); const v = $('#q').value.trim(); if (!v) { $('#q').focus(); return; } build(v); };

/* ---------- tour ---------- */
let touring = false;
function candidates() {
  const F = state.F; const out = [];
  [...F.buildings].sort((a, b) => b.height - a.height).slice(0, 6).forEach((b, i) => { const [x, z] = centroid(b.ring); out.push({ id: `b${i}`, type: 'building', name: b.name, kind: kindLabel(b.kind), height: Math.round(b.height), x, z, h: b.height }); });
  F.buildings.filter(b => b.name).slice(0, 12).forEach((b, i) => { const [x, z] = centroid(b.ring); if (!out.some(o => o.name === b.name)) out.push({ id: `n${i}`, type: 'building', name: b.name, kind: kindLabel(b.kind), height: Math.round(b.height), x, z, h: b.height }); });
  [...F.parks].sort((a, b) => Math.abs(area(b.ring)) - Math.abs(area(a.ring))).slice(0, 3).forEach((p, i) => { const [x, z] = centroid(p.ring); out.push({ id: `p${i}`, type: 'park', name: p.name, kind: p.kind, area_m2: Math.round(Math.abs(area(p.ring))), x, z, h: 10 }); });
  F.water.slice(0, 2).forEach((w, i) => { const [x, z] = centroid(w.ring); out.push({ id: `w${i}`, type: 'water', name: w.name, x, z, h: 5 }); });
  const roads = {}; for (const r of F.roads) if (r.name) { const L = r.pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]) : 0, 0); (roads[r.name] ||= { L: 0, pts: [] }).L += L; roads[r.name].pts.push(...r.pts); }
  Object.entries(roads).sort((a, b) => b[1].L - a[1].L).slice(0, 3).forEach(([n, r], i) => { const m = r.pts[Math.floor(r.pts.length / 2)]; out.push({ id: `r${i}`, type: 'street', name: n, length_m: Math.round(r.L), x: m[0], z: m[1], h: 12 }); });
  return out;
}
function localTour(C) {
  const tall = C.find(c => c.type === 'building'); const park = C.find(c => c.type === 'park'); const water = C.find(c => c.type === 'water'); const street = C.find(c => c.type === 'street');
  const stops = [];
  if (tall) stops.push({ id: tall.id, title: tall.name || 'The tallest building here', text: `${tall.name ? tall.name + ' rises' : 'This rises'} about ${tall.height} meters, the highest point inside the circle.` });
  if (water) stops.push({ id: water.id, title: water.name || 'The water', text: 'Water shapes everything around it: where the streets bend, where the buildings stop.' });
  if (park) stops.push({ id: park.id, title: park.name || 'The biggest green space', text: `About ${fmt(park.area_m2 / 1e4, 1)} hectares where the grid lets go.` });
  if (street) stops.push({ id: street.id, title: street.name, text: `The longest named street on the model, about ${fmt(street.length_m)} meters of it.` });
  return { intro: `${fmt(state.stats.buildings)} buildings in a ${state.R} meter circle. Here are the ones worth a closer look.`, stops };
}
async function startTour() {
  const C = candidates(); if (!C.length) { toast('Nothing to tour here yet.'); return; }
  $('#tourGo').disabled = true; $('#tourHint').textContent = 'Planning the route';
  let plan;
  try {
    const st = await aiStatus();
    if (st.ready) {
      const res = await claude({ system: 'You are a witty, knowledgeable local guide narrating a tour of a 3D tabletop model built from OpenStreetMap. Use real knowledge of the place when you have it (history, architecture, what locals know), and never invent facts about a specific building you do not recognize; describe what the data shows instead. Reply only with JSON: {"intro": string (1-2 sentences), "stops": [{"id": candidate id, "title": short title, "text": 2-3 vivid sentences}]} with 4 or 5 stops ordered as a pleasant route.', messages: [{ role: 'user', content: `Place: ${state.name}\nRadius: ${state.R} m\nStats: ${JSON.stringify({ buildings: state.stats.buildings, avgHeight: Math.round(state.stats.avgHeight), roadKm: +state.stats.roadKm.toFixed(1) })}\nCandidates: ${JSON.stringify(C.map(({ x, z, h, ...c }) => c))}` }], max_tokens: 1500 });
      plan = extractJSON(textOf(res));
    } else { plan = localTour(C); $('#tourHint').textContent = 'Simple tour. Add a Claude key in Settings for real narration.'; }
  } catch (e) { plan = localTour(C); $('#tourHint').textContent = `Guide unavailable (${e.message}). Simple tour instead.`; }
  plan.stops = (plan.stops || []).map(s => ({ ...s, c: C.find(c => c.id === s.id) })).filter(s => s.c);
  if (!plan.stops.length) plan = localTour(C), plan.stops = plan.stops.map(s => ({ ...s, c: C.find(c => c.id === s.id) }));
  state.tour = plan; $('#tourIntro').textContent = plan.intro || '';
  $('#stops').innerHTML = plan.stops.map((s, i) => `<li><button data-stop="${i}"><span class="n">${i + 1}</span><span><b>${esc(s.title)}</b><p>${esc(s.text)}</p></span></button></li>`).join('');
  $$('[data-stop]').forEach(b => b.onclick = () => goStop(+b.dataset.stop));
  $('#tourGo').disabled = false; if (!$('#tourHint').textContent.startsWith('Simple') && !$('#tourHint').textContent.startsWith('Guide')) $('#tourHint').textContent = '';
  touring = true; d.controls.autoRotate = false; goStop(0);
}
function goStop(i) {
  const t = state.tour; if (!t) return; state.stop = Math.max(0, Math.min(t.stops.length - 1, i)); const s = t.stops[state.stop];
  $$('[data-stop]').forEach(b => +b.dataset.stop === state.stop ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'));
  $('#caption').hidden = false; $('#capK').textContent = `Stop ${state.stop + 1} of ${t.stops.length}`; $('#capT').textContent = s.title; $('#capP').textContent = s.text;
  $('#capNext').textContent = state.stop === t.stops.length - 1 ? 'Finish' : 'Next stop'; $('#capPrev').disabled = state.stop === 0;
  d.flyTo(s.c.x, s.c.z, s.c.h, s.c.type === 'park' || s.c.type === 'water' ? state.R * .55 : undefined);
}
function endTour() { touring = false; $('#caption').hidden = true; $$('[data-stop]').forEach(b => b.removeAttribute('aria-current')); }
$('#tourGo').onclick = startTour;
$('#capNext').onclick = () => { if (state.stop >= state.tour.stops.length - 1) { endTour(); d.home(); d.controls.autoRotate = $('#tSpin').getAttribute('aria-checked') === 'true'; } else goStop(state.stop + 1); };
$('#capPrev').onclick = () => goStop(state.stop - 1);
$('#capStop').onclick = () => { endTour(); d.home(); };
addEventListener('keydown', (e) => { if (!touring || e.target.closest('input')) return; if (e.key === 'ArrowRight') $('#capNext').click(); if (e.key === 'ArrowLeft') goStop(state.stop - 1); if (e.key === 'Escape') $('#capStop').click(); });

/* ---------- restyle with words ---------- */
function nearestStyle(q) { q = q.toLowerCase(); if (/night|neon|dark|cyber|noir/.test(q)) return 'night'; if (/snow|winter|ice|frost/.test(q)) return 'snow'; if (/toy|lego|pastel|candy|kids|color/.test(q)) return 'toy'; if (/blue ?print|architect|plan/.test(q)) return 'blueprint'; if (/wire|tron|hologram|matrix/.test(q)) return 'wire'; return 'clay'; }
$('#restyleForm').onsubmit = async (e) => {
  e.preventDefault(); const q = $('#styleQ').value.trim(); if (!q) return; const btn = e.submitter; btn.disabled = true; $('#styleHint').textContent = 'Mixing colors';
  try {
    const st = await aiStatus();
    if (!st.ready) { setStyle(nearestStyle(q)); $('#styleHint').textContent = `Closest built-in style: ${STYLES[state.style].label}. Add a Claude key in Settings for custom styles.`; }
    else {
      const res = await claude({ system: 'You art-direct a 3D tabletop city model. Reply only with JSON for a material style: {"label": 1-3 words, "bg": [top hex, bottom hex], "ground": hex, "wall": hex, "roof": hex, "road": hex, "rail": hex, "water": hex, "park": hex, "sand": hex, "parking": hex, "tree": hex, "trunk": hex, "plinth": hex (wood or base color), "night": bool, "windows": hex (lit window color, used if night), "streets": hex (street glow if night), "palette": optional array of 4-7 hex for colorful buildings, "edges": optional hex for outline lines, "vary": 0..0.08, "sun": 0.2..3, "amb": 0.2..1.6, "exposure": 0.7..1.4, "bloom": 0..1.2}. Make it cohesive and beautiful; keep contrast between ground, roads and buildings.', messages: [{ role: 'user', content: q }], max_tokens: 700 });
      const s = extractJSON(textOf(res)); if (!s.bg || !s.wall) throw new Error('style was incomplete');
      STYLES.custom = { ...STYLES.clay, ...s, label: s.label || 'Custom' }; setStyle('custom'); $('#styleHint').textContent = `Made "${STYLES.custom.label}". It's in the style bar now.`;
    }
  } catch (err) { setStyle(nearestStyle(q)); $('#styleHint').textContent = `Couldn't make a custom style (${err.message}). Used ${STYLES[state.style].label}.`; }
  btn.disabled = false;
};

/* ---------- export ---------- */
const slug = () => (state.name || 'diorama').split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
$('#png').onclick = () => d.snapshot(2400).toBlob(b => { download(b, `${slug()}.png`); toast('Picture saved'); }, 'image/png');
$('#glb').onclick = async () => { $('#glb').disabled = true; try { download(await d.exportGLB(), `${slug()}.glb`); toast('3D model saved. Opens in Blender or any 3D viewer.'); } catch (e) { toast(`Export failed: ${e.message}`); } $('#glb').disabled = false; };
$('#share').onclick = async () => { if (!state.loc) { toast('Build a real place first'); return; } const url = `${new URL("app.html", location.href).href}#at=${state.loc.lat.toFixed(5)},${state.loc.lng.toFixed(5)},${state.R},${state.style === 'custom' ? 'clay' : state.style}`; try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); } };

/* ---------- settings ---------- */
$('#openSettings').onclick = () => { $('#sKey').value = settings.key; $('#sCode').value = settings.code; $('#sModel').value = settings.model; $('#dlgSettings').showModal(); };
$('#sSave').onclick = () => { settings.key = $('#sKey').value.trim(); settings.code = $('#sCode').value.trim(); settings.model = $('#sModel').value.trim(); toast('Settings saved'); };
$('#minPanel').onclick = () => { $('#panel').classList.toggle('min'); $('#minPanel').textContent = $('#panel').classList.contains('min') ? 'Show' : 'Hide'; };

/* ---------- boot ---------- */
renderChips(); renderRecent(); document.body.classList.toggle('dark', dark(state.style));
const at = location.hash.match(/^#at=(-?[\d.]+),(-?[\d.]+),(\d+)(?:,(\w+))?/);
let q = null; try { q = sessionStorage.getItem('dio.q'); sessionStorage.removeItem('dio.q'); } catch {}
if (at) { if (at[4] && STYLES[at[4]]) state.style = at[4]; renderChips(); $('#radius').value = at[3]; $('#rOut').textContent = `${at[3]} m`; build(null, +at[3], { loc: { lat: +at[1], lng: +at[2] } }); }
else if (q) { $('#q').value = q; build(q); }
else { state.F = sampleCity(420); state.R = 420; state.name = 'Sample city'; d.build(state.F, 420, state.style); renderPlace(); $('#pCoords').textContent = 'Generated for practice. Paste a place to build a real one.'; }
window.__dio = { d, build, state, startTour };
