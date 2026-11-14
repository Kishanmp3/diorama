// Diorama renderer: turns flat local-meter features into a tabletop model on a turntable plinth.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

export const STYLES = {
  clay: { label: 'Clay', bg: ['#E3E7E0', '#A9B3A6'], ground: '#E6E5DE', wall: '#FBFBF7', roof: '#F6F6F1', road: '#CAC9C1', rail: '#B5B4AC', water: '#AFC3CA', park: '#D3DDC9', sand: '#EAE3D0', parking: '#D8D7D0', tree: '#E4EBDB', trunk: '#CFCBC0', plinth: '#B48A62', vary: .05, sun: 3.2, amb: .72, exposure: 1 },
  blueprint: { label: 'Blueprint', bg: ['#2558A0', '#143565'], ground: '#1F4E8E', wall: '#2B62AA', roof: '#3270BD', road: '#3A78C2', rail: '#5B8FD0', water: '#173F75', park: '#25599B', sand: '#2A5C9C', parking: '#2A5C9E', tree: '#7FAFEA', trunk: '#5B8FD0', plinth: '#0F2A52', edges: '#D8E8FF', vary: .02, sun: 1.4, amb: 1.4, exposure: 1 },
  night: { label: 'Night', bg: ['#141A2E', '#05070E'], ground: '#191D27', wall: '#262B38', roof: '#2E3444', road: '#2B2A2A', rail: '#3A3A44', water: '#0D2238', park: '#17241D', sand: '#2A2620', parking: '#22252E', tree: '#1F3328', trunk: '#2A2420', plinth: '#2A1F17', windows: '#FFC772', streets: '#FFB25A', vary: .03, sun: .35, amb: .35, exposure: 1.15, night: true, bloom: .9 },
  toy: { label: 'Toy town', bg: ['#BFE6FF', '#7FC4F0'], ground: '#97D36F', wall: '#FFFFFF', roof: '#FF6B6B', road: '#5D6170', rail: '#8A5A3C', water: '#4FC3F7', park: '#6CC24A', sand: '#FFE08A', parking: '#9A9EAA', tree: '#2F9E58', trunk: '#8A5A3C', plinth: '#FFFFFF', palette: ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#F7A8D8', '#FF9F45', '#9B7BFF'], vary: 0, sun: 2.8, amb: 1, exposure: 1.02 },
  snow: { label: 'First snow', bg: ['#EEF3F8', '#B9C7D6'], ground: '#F5F8FB', wall: '#E3E9F0', roof: '#FFFFFF', road: '#C3CDD7', rail: '#9AA6B2', water: '#8EB0C8', park: '#F0F4F7', sand: '#EEF1F4', parking: '#D6DDE4', tree: '#FFFFFF', trunk: '#6F6259', plinth: '#8C6A50', vary: .03, sun: 2.2, amb: 1.25, exposure: 1.02 },
  wire: { label: 'Wireframe', bg: ['#10131A', '#05060A'], ground: '#0B0D12', wall: '#0B0D12', roof: '#0B0D12', road: '#1E2A44', rail: '#2A2A3A', water: '#0D1A2E', park: '#0F1A14', sand: '#141414', parking: '#141820', tree: '#123A2A', trunk: '#123A2A', plinth: '#05060A', edges: '#7DF9FF', vary: 0, sun: .8, amb: 1, exposure: 1, bloom: .6 },
};

const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class Diorama {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.opts = opts;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.capture });
    r.setPixelRatio(Math.min(devicePixelRatio, opts.lowPower ? 1.5 : 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(32, 1, 1, 50000);
    this.controls = new OrbitControls(this.camera, canvas); Object.assign(this.controls, { enableDamping: true, dampingFactor: .07, maxPolarAngle: Math.PI * .47, minPolarAngle: .08, autoRotate: true, autoRotateSpeed: .55, screenSpacePanning: false });
    this.controls.addEventListener('start', () => { this.userTouched = true; this.cancelFly?.(); });
    this.composer = new EffectComposer(r); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, .5, .75); this.composer.addPass(this.bloom);
    this.hts = new ShaderPass(HorizontalTiltShiftShader); this.vts = new ShaderPass(VerticalTiltShiftShader); this.composer.addPass(this.hts); this.composer.addPass(this.vts);
    this.composer.addPass(new OutputPass());
    this.sun = new THREE.DirectionalLight('#fff4e6', 2.5); this.sun.castShadow = true; this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#b8b0a0', 1); this.scene.add(this.hemi);
    this.tilt = opts.tilt ?? true; this.timeOfDay = .38; this.styleName = 'clay'; this.R = 400; this.F = null;
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this._resize = () => this.resize(); addEventListener('resize', this._resize); new ResizeObserver(this._resize).observe(canvas);
    this.resize();
    r.setAnimationLoop(() => { this.controls.update(); this._fly?.(); this.onFrame?.(); this.composer.render(); });
    if (opts.onHover) canvas.addEventListener('pointermove', (e) => { const b = this.pick(e.clientX, e.clientY); opts.onHover(b, e); });
  }
  resize() { const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight; if (!w || !h) return; this.renderer.setSize(w, h, false); this.composer.setSize(w, h); this.camera.aspect = w / h; if (this.offsetX != null) { const ox = typeof this.offsetX === 'function' ? this.offsetX(w, h) : this.offsetX; if (ox) this.camera.setViewOffset(w, h, ox[0], ox[1], w, h); else this.camera.clearViewOffset(); } this.camera.updateProjectionMatrix(); this._tiltUniforms(); }
  _tiltUniforms() { const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1; const amt = this.tilt ? 1.7 : 0; this.hts.uniforms.h.value = amt / w; this.vts.uniforms.v.value = amt / h; this.hts.uniforms.r.value = this.vts.uniforms.r.value = .52; }
  setTilt(on) { this.tilt = on; this._tiltUniforms(); }

  build(F, R, styleName = this.styleName) {
    this.F = F; this.R = R; this.styleName = styleName; const S = STYLES[styleName] || STYLES.clay; this.style = S;
    if (this.group) { this.group.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }); }); this.scene.remove(this.group); }
    const G = this.group = new THREE.Group(); this.scene.add(G);
    const lift = (k) => k * Math.max(.6, R / 500);
    // background
    const bc = document.createElement('canvas'); bc.width = 2; bc.height = 512; const bx = bc.getContext('2d'); const gr = bx.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, S.bg[0]); gr.addColorStop(1, S.bg[1]); bx.fillStyle = gr; bx.fillRect(0, 0, 2, 512);
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace; this.scene.background = bt;
    // plinth
    const pr = R * 1.035, ph = R * .075;
    const wood = this._woodTex(S.plinth);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr * 1.01, ph, 160, 1), [new THREE.MeshStandardMaterial({ map: wood, roughness: .7 }), new THREE.MeshStandardMaterial({ color: S.ground, roughness: .95 }), new THREE.MeshStandardMaterial({ color: S.plinth })]);
    plinth.position.y = -ph / 2; plinth.receiveShadow = true; G.add(plinth);
    const catcher = new THREE.Mesh(new THREE.CircleGeometry(R * 3, 64), new THREE.ShadowMaterial({ opacity: S.night ? .5 : .18 })); catcher.rotation.x = -Math.PI / 2; catcher.position.y = -ph - .5; catcher.receiveShadow = true; G.add(catcher);
    // flat layers
    const flat = (polys, color, y, extra = {}) => { if (!polys.length) return; const geos = polys.map(p => { const sh = new THREE.Shape(p.ring.map(([x, z]) => new THREE.Vector2(x, -z))); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; }); const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color, roughness: extra.rough ?? .95, metalness: extra.metal ?? 0, polygonOffset: true, polygonOffsetFactor: -1 - y, polygonOffsetUnits: -1 })); m.receiveShadow = true; G.add(m); return m; };
    flat(F.parking, S.parking, lift(.15)); flat(F.sand, S.sand, lift(.2)); flat(F.parks, S.park, lift(.3)); this.waterMesh = flat(F.water, S.water, lift(.12), { rough: .25, metal: .1 });
    // lines
    const ribbon = (lines, color, y, wmul = 1, emissive) => { if (!lines.length) return; const pos = []; for (const l of lines) { const w = l.width * wmul / 2; for (let i = 0; i < l.pts.length - 1; i++) { const [x1, z1] = l.pts[i], [x2, z2] = l.pts[i + 1]; const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w, nz = dx / L * w; pos.push(x1 + nx, y, z1 + nz, x2 + nx, y, z2 + nz, x1 - nx, y, z1 - nz, x1 - nx, y, z1 - nz, x2 + nx, y, z2 + nz, x2 - nx, y, z2 - nz); } for (const [x, z] of l.pts) { const seg = 8; for (let k = 0; k < seg; k++) { const a = k / seg * Math.PI * 2, b = (k + 1) / seg * Math.PI * 2; pos.push(x, y, z, x + Math.cos(b) * w, y, z + Math.sin(b) * w, x + Math.cos(a) * w, y, z + Math.sin(a) * w); } } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: .9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide, ...(emissive ? { emissive, emissiveIntensity: .05 } : {}) })); m.receiveShadow = true; G.add(m); return m; };
    ribbon(F.waterLines, S.water, lift(.14));
    const major = F.roads.filter(r => r.width >= 5 && !r.tunnel), minor = F.roads.filter(r => r.width < 5 && !r.tunnel);
    ribbon(minor, new THREE.Color(S.road).lerp(new THREE.Color(S.ground), .45), lift(.4));
    ribbon(major, S.road, lift(.5), 1, S.night ? S.streets : null);
    ribbon(F.rails.map(r => ({ ...r, width: 3 })), S.rail, lift(.55));
    // buildings
    this._buildings(F.buildings, S, R);
    // trees
    this._trees(F, S, R);
    // edges for blueprint/wire
    if (S.edges && this.wallMesh) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(this.wallMesh.geometry, 30), new THREE.LineBasicMaterial({ color: S.edges, transparent: true, opacity: styleName === 'wire' ? .9 : .55 })); G.add(e); if (styleName === 'wire') { this.wallMesh.material.transparent = true; this.wallMesh.material.opacity = .25; this.roofMesh && (this.roofMesh.material.visible = false); } }
    // light
    this.renderer.toneMappingExposure = S.exposure; this.bloom.strength = S.bloom || 0; this.hemi.intensity = S.amb; this.hemi.color.set(S.night ? '#6a7cff' : '#ffffff'); this.hemi.groundColor.set(S.ground);
    const sc = this.sun.shadow.camera; Object.assign(sc, { left: -R * 1.15, right: R * 1.15, top: R * 1.15, bottom: -R * 1.15, near: 1, far: R * 6 }); sc.updateProjectionMatrix(); this.sun.shadow.mapSize.set(this.opts.lowPower ? 2048 : 4096, this.opts.lowPower ? 2048 : 4096); this.sun.shadow.bias = -.0004; this.sun.shadow.normalBias = R / 900; this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    this.setTime(this.timeOfDay);
    if (!this.framed) this.frame();
    return this;
  }
  _woodTex(base) { const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 1024, 64); const col = new THREE.Color(base); for (let i = 0; i < 90; i++) { const l = (Math.random() - .5) * .14; x.strokeStyle = `rgba(${l > 0 ? 255 : 0},${l > 0 ? 240 : 0},${l > 0 ? 220 : 0},${Math.abs(l)})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const y0 = Math.random() * 64; x.moveTo(0, y0); for (let k = 0; k <= 1024; k += 32) x.lineTo(k, y0 + Math.sin(k * .01 + i) * 3); x.stroke(); } void col; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); return t; }
  _windowsTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { if (Math.random() < .42) { const a = .45 + Math.random() * .55; x.fillStyle = `rgba(255,${200 + Math.random() * 40 | 0},${120 + Math.random() * 60 | 0},${a})`; x.fillRect(i * 16 + 4, j * 16 + 5, 8, 7); } } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 24, 1 / 24); t.colorSpace = THREE.SRGBColorSpace; return t; }
  _buildings(list, S, R) {
    const wp = [], wn = [], wu = [], wc = [], rp = [], rc = []; const owners = [], rOwners = []; const tmp = new THREE.Color();
    list.forEach((b, bi) => {
      const ring = b.ring; const h = b.height, y0 = b.minH || 0;
      const base = S.palette ? S.palette[(Math.abs(b.id || bi) * 7) % S.palette.length] : S.wall;
      tmp.set(base).offsetHSL(0, 0, (((b.id || bi) * 9301 + 49297) % 233280 / 233280 - .5) * (S.vary || 0) * 2);
      let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length]; const L = Math.hypot(x2 - x1, z2 - z1); if (L < .01) continue;
        const nx = (z2 - z1) / L, nz = -(x2 - x1) / L; // outward for CCW in x/-z space
        const v = [[x1, y0, z1, u, y0], [x2, y0, z2, u + L, y0], [x2, h, z2, u + L, h], [x1, y0, z1, u, y0], [x2, h, z2, u + L, h], [x1, h, z1, u, h]];
        for (const [x, y, z, uu, vv] of v) { wp.push(x, y, z); wn.push(-nx, 0, -nz); wu.push(uu, vv); wc.push(tmp.r, tmp.g, tmp.b); }
        owners.push(bi, bi); u += L;
      }
      const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, -z)), []);
      const rcol = S.palette ? tmp : new THREE.Color(S.roof).offsetHSL(0, 0, (((b.id || bi) * 13) % 100 / 100 - .5) * (S.vary || 0) * 2);
      for (const t of tris) { for (const k of [t[0], t[2], t[1]]) { const [x, z] = ring[k]; rp.push(x, h, z); rc.push(rcol.r, rcol.g, rcol.b); } rOwners.push(bi); }
    });
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2)); wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    const wm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, side: THREE.DoubleSide, ...(S.night ? { emissive: S.windows, emissiveMap: this._windowsTex(), emissiveIntensity: 1.6 } : {}) });
    // fix normals orientation: compute and keep flat
    wg.computeVertexNormals();
    this.wallMesh = new THREE.Mesh(wg, wm); this.wallMesh.castShadow = this.wallMesh.receiveShadow = true; this.group.add(this.wallMesh);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3)); rg.computeVertexNormals();
    this.roofMesh = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: THREE.DoubleSide })); this.roofMesh.castShadow = this.roofMesh.receiveShadow = true; this.group.add(this.roofMesh);
    this.wallOwners = owners; this.roofOwners = rOwners; this.buildings = list;
  }
  _trees(F, S, R) {
    const pts = [...F.trees]; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const p of F.parks) { const a = Math.abs(polyArea(p.ring)); const n = Math.min(400, Math.round(a / (p.wooded ? 70 : 260))); const [minx, maxx, minz, maxz] = bbox(p.ring); for (let i = 0, t = 0; i < n && t < n * 6; t++) { const q = [minx + rnd() * (maxx - minx), minz + rnd() * (maxz - minz)]; if (inPoly(q, p.ring) && !F.buildings.some(b => Math.abs(b.ring[0][0] - q[0]) < 40 && inPoly(q, b.ring))) { pts.push(q); i++; } } }
    if (!pts.length) return; const n = Math.min(pts.length, 6000);
    const crown = new THREE.IcosahedronGeometry(3.2, 0); crown.translate(0, 6.4, 0); const trunk = new THREE.CylinderGeometry(.45, .6, 3.8, 5); trunk.translate(0, 1.9, 0);
    const paint = (g, c) => { const col = new THREE.Color(c); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.index ? g.toNonIndexed() : g; };
    const geo = mergeGeometries([paint(crown, S.tree), paint(trunk.toNonIndexed(), S.trunk)].map(g => { g.deleteAttribute('uv'); return g; }));
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .9 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(); const scale = Math.max(1.3, R / 380);
    for (let i = 0; i < n; i++) { const [x, z] = pts[i]; const k = (.75 + rnd() * .55) * scale; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6); m.compose(new THREE.Vector3(x, 0, z), q, s.set(k, k * (.9 + rnd() * .3), k)); mesh.setMatrixAt(i, m); }
    mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh);
  }
  setTime(t) { // 0 = dawn, .5 = noon, 1 = dusk
    this.timeOfDay = t; const S = this.style || STYLES.clay; const R = this.R;
    const el = Math.sin(t * Math.PI) * 62 + 6, az = 200 + t * 140; const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az);
    this.sun.position.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).multiplyScalar(R * 2.5);
    const warm = 1 - Math.sin(t * Math.PI); this.sun.color.setHSL(.09, .5 * warm + .1, .92 - warm * .12); this.sun.intensity = S.sun * (.65 + Math.sin(t * Math.PI) * .45);
  }
  frame(dist = 2.35) { const R = this.R; this.camera.position.set(R * dist * .72, R * dist * .62, R * dist * .72); this.controls.target.set(0, 0, 0); this.controls.minDistance = R * .12; this.controls.maxDistance = R * 6; this.framed = true; }
  flyTo(x, z, h = 40, dist) {
    const R = this.R; dist = dist || Math.min(R * 1.1, Math.max(R * .32, h * 2.6)); const from = { p: this.camera.position.clone(), t: this.controls.target.clone() };
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).setY(0).normalize(); if (!dir.lengthSq()) dir.set(1, 0, 1).normalize();
    const to = { t: new THREE.Vector3(x, h * .4, z), p: new THREE.Vector3(x + dir.x * dist * .8, h * .4 + dist * .55, z + dir.z * dist * .8) };
    const t0 = performance.now(), D = 1700; this.controls.autoRotate = false;
    return new Promise(res => { this.cancelFly = () => { this._fly = null; res(); }; this._fly = () => { const k = ease(Math.min(1, (performance.now() - t0) / D)); this.camera.position.lerpVectors(from.p, to.p, k); this.controls.target.lerpVectors(from.t, to.t, k); if (k >= 1) { this._fly = null; res(); } }; });
  }
  home() { const R = this.R; const p = this.camera.position.clone(), t = this.controls.target.clone(); const tp = new THREE.Vector3(R * 1.7, R * 1.45, R * 1.7); const t0 = performance.now(); this._fly = () => { const k = ease(Math.min(1, (performance.now() - t0) / 1400)); this.camera.position.lerpVectors(p, tp, k); this.controls.target.lerpVectors(t, new THREE.Vector3(), k); if (k >= 1) this._fly = null; }; }
  pick(cx, cy) {
    if (!this.wallMesh) return null; const r = this.canvas.getBoundingClientRect(); this.mouse.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera); const hits = this.ray.intersectObjects([this.wallMesh, this.roofMesh], false); if (!hits.length) return null;
    const h = hits[0]; const idx = h.object === this.wallMesh ? this.wallOwners[h.faceIndex] : this.roofOwners[h.faceIndex]; return idx != null ? { ...this.buildings[idx], index: idx, point: h.point } : null;
  }
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.camera); const r = this.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height, behind: v.z > 1 }; }
  snapshot(w = 2400) { this.composer.render(); const c = this.canvas; const o = document.createElement('canvas'); o.width = w; o.height = Math.round(w * c.height / c.width); o.getContext('2d').drawImage(c, 0, 0, o.width, o.height); return o; }
  async exportGLB() { const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js'); return new Promise((res, rej) => new GLTFExporter().parse(this.group, (buf) => res(new Blob([buf], { type: 'model/gltf-binary' })), rej, { binary: true })); }
}
function polyArea(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; }
function bbox(r) { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const [x, z] of r) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); } return [a, b, c, d]; }
function inPoly(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; }
