// Bakes a venue's 3D scenery for the Race Simulator's bank view (src/components/race-simulator/scenery3d).
//
// Runs in a browser page (any https page: every source below allows cross-origin requests). Paste
// this file into the console, then `await bake('lmryc')`. The results land in `window.BAKE`, a map of
// file name -> data URL (or JSON text); save each into public/sim-venues/<id>/.
//
// Sources, all open:
// - Imagery and elevation: NSW Spatial Services (NSW_Imagery, NSW_5M_Elevation). © Spatial Services,
//   Department of Customer Service NSW, Creative Commons.
// - Roads, buildings, jetties, power lines: OpenStreetMap (the editing API's map calls, in small
//   tiles). © OpenStreetMap contributors, ODbL.
// - Houses: NSW Geocoded Addressing (address points): one house per address, sized and turned to its
//   street. © Spatial Services NSW, Creative Commons.
//
// Coordinates are metres from the club's saved location (x east, y north), as in src/sim/venues.

const VENUES = {
  lmryc: {
    origin: { lat: -32.9731483, lon: 151.6152096 },
    near: 3200, wide: 16000, // half-widths of the detailed and the far boxes, m
    nearImg: 2048, wideImg: 1536, nearDem: 640, wideDem: 400,
    treesFar: 9000, // trees on the far terrain only this far out
    // Marinas: boats on moorings along their jetties.
    marinas: [{ name: 'Marmong Point Marina', x: 331, y: -498, r: 230 }],
    // What people know the place by. Kinds: pines (a row along a shore), club (a sailing club's shed,
    // boat park and flagpole), sculpture, flag.
    landmarks: [
      { kind: 'pines', name: 'Speers Point foreshore pines', shore: [[324, 1077], [842, 824]], back: 7, every: 13, h: [22, 30] },
      { kind: 'club', name: 'Speers Point sailing club', x: 452, y: 992, yaw: 22, shed: [16, 9, 4.2], roof: '#5d6b6a', wall: '#d9d4c7', boats: [3, 7], flag: '#1f4fa3' },
      { kind: 'sculpture', name: 'Chimera', x: 328, y: 1096, h: 12 },
    ],
  },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function bake(id) {
  const C = VENUES[id];
  const O = C.origin;
  const KX = 111320 * Math.cos(O.lat * Math.PI / 180), KY = 110940;
  const toXY = (lon, lat) => [(lon - O.lon) * KX, (lat - O.lat) * KY];
  const toLL = (x, y) => [O.lon + x / KX, O.lat + y / KY];
  const r1 = v => Math.round(v * 10) / 10;
  const out = {};
  const log = (...a) => console.log('[bake]', ...a);

  // ── Elevation ──
  const ELEV = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_5M_Elevation/ImageServer/exportImage';
  async function dem(half, n) {
    const a = toLL(-half, -half), b = toLL(half, half);
    const u = ELEV + '?' + new URLSearchParams({ bbox: [a[0], a[1], b[0], b[1]].join(','), bboxSR: '4326', imageSR: '4326', size: `${n},${n}`, format: 'bsq', pixelType: 'F32', noData: '-9999', interpolation: 'RSP_BilinearInterpolation', f: 'image' });
    const buf = await (await fetch(u)).arrayBuffer();
    const f = new Float32Array(buf.slice(0, n * n * 4));
    for (let i = 0; i < f.length; i++) if (!(f[i] > -50 && f[i] < 2000)) f[i] = 0; // the sea and gaps
    return f; // row 0 is the north edge
  }
  const demN = await dem(C.near, C.nearDem), demW = await dem(C.wide, C.wideDem);
  const sample = (f, n, half, x, y) => {
    const fx = (x + half) / (2 * half) * (n - 1), fy = (half - y) / (2 * half) * (n - 1);
    const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fy)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fy - j));
    const k = j * n + i;
    return f[k] * (1 - u) * (1 - v) + f[k + 1] * u * (1 - v) + f[k + n] * (1 - u) * v + f[k + n + 1] * u * v;
  };
  const height = (x, y) => (Math.abs(x) < C.near && Math.abs(y) < C.near ? sample(demN, C.nearDem, C.near, x, y) : sample(demW, C.wideDem, C.wide, x, y));
  // Heights into a PNG: (h + 20) * 100 as a 16-bit number in red (high) and green (low).
  const demPng = (f, n) => {
    const c = document.createElement('canvas'); c.width = n; c.height = n;
    const g = c.getContext('2d'), im = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = Math.max(0, Math.min(65535, Math.round((f[i] + 20) * 100))); im.data[i * 4] = v >> 8; im.data[i * 4 + 1] = v & 255; im.data[i * 4 + 2] = 0; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/png');
  };
  out['dem-near.png'] = demPng(demN, C.nearDem);
  out['dem-wide.png'] = demPng(demW, C.wideDem);
  log('elevation done');

  // ── Imagery ──
  const IMG = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/export';
  async function imagery(half, n) {
    const a = toLL(-half, -half), b = toLL(half, half);
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.src = IMG + '?' + new URLSearchParams({ bbox: [a[0], a[1], b[0], b[1]].join(','), bboxSR: '4326', imageSR: '4326', size: `${n},${n}`, format: 'jpg', f: 'image' });
    await im.decode();
    const c = document.createElement('canvas'); c.width = n; c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, n, n);
    return { c, g, px: g.getImageData(0, 0, n, n).data, n, half };
  }
  const imN = await imagery(C.near, C.nearImg), imW = await imagery(C.wide, C.wideImg);
  out['near.webp'] = imN.c.toDataURL('image/webp', 0.72);
  out['wide.webp'] = imW.c.toDataURL('image/webp', 0.7);
  log('imagery done');
  const pixAt = (im, x, y) => { const i = Math.round((x + im.half) / (2 * im.half) * im.n), j = Math.round((im.half - y) / (2 * im.half) * im.n); if (i < 0 || j < 0 || i >= im.n || j >= im.n) return null; const k = (j * im.n + i) * 4; return [im.px[k], im.px[k + 1], im.px[k + 2]]; };

  // ── OpenStreetMap, in tiles of 0.02° ──
  const nodes = new Map(), ways = new Map();
  const a0 = toLL(-C.near, -C.near), b0 = toLL(C.near, C.near);
  for (let lat = a0[1]; lat < b0[1]; lat += 0.02) for (let lon = a0[0]; lon < b0[0]; lon += 0.02) {
    const u = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${lon.toFixed(4)},${lat.toFixed(4)},${Math.min(b0[0], lon + 0.02).toFixed(4)},${Math.min(b0[1], lat + 0.02).toFixed(4)}`;
    const j = await (await fetch(u)).json();
    for (const e of j.elements) { if (e.type === 'node') nodes.set(e.id, e); else if (e.type === 'way') ways.set(e.id, e); }
    await sleep(300);
  }
  log('osm', nodes.size, ways.size);
  const nxy = id => { const n = nodes.get(id); return n ? toXY(n.lon, n.lat) : null; };
  const wayPts = w => w.nodes.map(nxy).filter(Boolean);
  const inNear = p => Math.abs(p[0]) < C.near && Math.abs(p[1]) < C.near;
  const closed = w => w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];
  const pip = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

  // Roads with traffic, and every street (to turn houses to face it).
  const MAJOR = { motorway: 4, trunk: 4, primary: 3, secondary: 2, tertiary: 1, motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1 };
  const STREET = new Set(['residential', 'unclassified', 'living_street', 'tertiary', 'secondary', 'primary', 'trunk', 'service']);
  const roads = [], streets = [];
  for (const w of ways.values()) {
    const t = w.tags || {};
    if (!t.highway || t.area === 'yes' || t.tunnel) continue;
    const p = wayPts(w); if (p.length < 2 || !p.some(inNear)) continue;
    if (MAJOR[t.highway] != null) roads.push({ c: MAJOR[t.highway], n: t.name || t.ref || '', one: t.oneway === 'yes' ? 1 : 0, p: p.flatMap(q => [r1(q[0]), r1(q[1]), r1(Math.max(0.3, height(q[0], q[1])) + 0.15)]) });
    if (STREET.has(t.highway)) streets.push({ p, w: t.highway === 'service' ? 4 : MAJOR[t.highway] != null ? 9 : 7 });
  }
  // Buildings mapped in OSM (the notable ones: clubs, schools, shops).
  const blds = [];
  for (const w of ways.values()) {
    const t = w.tags || {};
    if (!t.building || !closed(w)) continue;
    const p = wayPts(w).slice(0, -1); if (p.length < 3 || !p.some(inNear)) continue;
    const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length;
    const lv = +t['building:levels'] || (t.building === 'apartments' ? 3 : t.building === 'commercial' || t.building === 'industrial' || t.building === 'school' ? 2 : 1);
    const ht = +String(t.height || '').replace(/[^\d.]/g, '') || lv * 3.3 + 1;
    const z = Math.min(...p.map(q => height(q[0], q[1])));
    const roof = roofColour(cx, cy, 3);
    blds.push({ n: t.name || '', h: r1(ht), z: r1(z), roof, p: p.flatMap(q => [r1(q[0]), r1(q[1])]) });
  }
  // A roof's colour: the commonest non-green colour round a point on the photo.
  function roofColour(x, y, r) {
    const cols = [];
    for (let dx = -r; dx <= r; dx += 1.5) for (let dy = -r; dy <= r; dy += 1.5) { const c = pixAt(imN, x + dx, y + dy); if (c && !(c[1] > c[0] + 4 && c[1] > c[2])) cols.push(c); }
    if (cols.length < 3) return null;
    cols.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
    const m = cols[Math.floor(cols.length / 2)];
    return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  // Jetties and pontoons.
  const piers = [];
  for (const w of ways.values()) {
    const t = w.tags || {};
    if (t.man_made !== 'pier' && t.man_made !== 'jetty' && t.leisure !== 'slipway' && t.man_made !== 'breakwater') continue;
    if (t.leisure === 'slipway') continue;
    const p = wayPts(w); if (p.length < 2 || !p.some(inNear)) continue;
    piers.push({ n: t.name || '', a: closed(w) ? 1 : 0, w: +t.width || 2.2, p: p.flatMap(q => [r1(q[0]), r1(q[1])]) });
  }
  // Power lines on towers, and masts.
  const power = [], masts = [];
  for (const w of ways.values()) {
    const t = w.tags || {};
    if (t.power !== 'line') continue;
    const p = wayPts(w); if (p.length < 2 || !p.some(inNear)) continue;
    power.push(p.flatMap(q => [r1(q[0]), r1(q[1]), r1(Math.max(0, height(q[0], q[1])))]));
  }
  for (const n of nodes.values()) {
    const t = n.tags; if (!t) continue;
    if (t.man_made === 'mast' || t.man_made === 'tower' && t['tower:type'] === 'communication') { const q = toXY(n.lon, n.lat); if (inNear(q)) masts.push([r1(q[0]), r1(q[1]), r1(height(q[0], q[1])), +String(t.height || '').replace(/[^\d.]/g, '') || 35]); }
  }
  // Fields, car parks and water: no trees there.
  const open = [];
  for (const w of ways.values()) {
    const t = w.tags || {};
    if (!closed(w)) continue;
    if (t.leisure === 'pitch' || t.amenity === 'parking' || t.landuse === 'industrial' || t.landuse === 'commercial' || t.landuse === 'retail' || t.leisure === 'swimming_pool' || t.natural === 'water' || t.landuse === 'cemetery' || t.leisure === 'golf_course' && false) open.push(wayPts(w));
  }
  log('features', roads.length, blds.length, piers.length, power.length);

  // ── Houses: one per address, turned to its street ──
  const ADR = 'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Geocoded_Addressing_Theme/MapServer/1/query';
  const env = { xmin: a0[0], ymin: a0[1], xmax: b0[0], ymax: b0[1], spatialReference: { wkid: 4326 } };
  const at = new Map();
  for (let off = 0; ; off += 2000) {
    const u = ADR + '?' + new URLSearchParams({ f: 'json', geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', where: '1=1', outFields: 'gurasid', returnGeometry: 'true', resultOffset: String(off), resultRecordCount: '2000', orderByFields: 'gurasid' });
    const j = await (await fetch(u)).json();
    const fs = j.features || [];
    for (const f of fs) { const q = toXY(f.geometry.x, f.geometry.y); const k = Math.round(q[0] / 3) + ',' + Math.round(q[1] / 3); const e = at.get(k); if (e) e[2]++; else at.set(k, [q[0], q[1], 1]); }
    if (fs.length < 2000) break;
  }
  // Streets on a grid, to find the nearest quickly.
  const G = 100, sg = new Map();
  const segs = [];
  for (const s of streets) for (let i = 0; i + 1 < s.p.length; i++) segs.push([s.p[i], s.p[i + 1], s.w]);
  segs.forEach((s, i) => { const x0 = Math.floor(Math.min(s[0][0], s[1][0]) / G), x1 = Math.floor(Math.max(s[0][0], s[1][0]) / G), y0 = Math.floor(Math.min(s[0][1], s[1][1]) / G), y1 = Math.floor(Math.max(s[0][1], s[1][1]) / G); for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) { const k = gx + ',' + gy; (sg.get(k) || sg.set(k, []).get(k)).push(i); } });
  const nearestSeg = (x, y) => {
    let best = null, bd = 1e9;
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of sg.get((gx + dx) + ',' + (gy + dy)) || []) {
      const [a, b] = segs[i]; const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L2)); const px = a[0] + ex * t, py = a[1] + ey * t;
      const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = { d, ang: Math.atan2(ex, ey) * 180 / Math.PI, px, py, w: segs[i][2] }; }
    }
    return best;
  };
  const bldIndex = blds.map(b => { const p = []; for (let i = 0; i < b.p.length; i += 2) p.push([b.p[i], b.p[i + 1]]); return p; });
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const houses = [];
  const ROOFS = ['#7a3f2c', '#8a4a33', '#5b5f63', '#3f4448', '#6d7174', '#9a9b97', '#b9b7ae', '#4a3a33'];
  for (const [x, y, units] of at.values()) {
    const z = height(x, y); if (z < 0.6) continue;
    if (bldIndex.some(p => Math.abs(p[0][0] - x) < 120 && pip(p, x, y))) continue;
    const s = nearestSeg(x, y);
    const block = units >= 4;
    const w = block ? 18 + rnd() * 10 : 10 + rnd() * 5, d = block ? 16 + units * 0.8 : 12 + rnd() * 6;
    const lv = block ? Math.min(5, 2 + Math.floor(units / 10)) : rnd() < 0.12 ? 2 : 1;
    let yaw = s && s.d < 70 ? s.ang : rnd() * 180;
    // Back from the street a little, square to it.
    let hx = x, hy = y;
    if (s && s.d < 70 && s.d < s.w / 2 + d / 2 + 4) { const k = (s.w / 2 + d / 2 + 4) / Math.max(0.1, s.d); hx = s.px + (x - s.px) * k; hy = s.py + (y - s.py) * k; }
    let roof = roofColour(hx, hy, 4);
    if (!roof || rnd() < 0.15) roof = ROOFS[Math.floor(rnd() * ROOFS.length)];
    houses.push([r1(hx), r1(hy), r1(Math.min(z, height(hx, hy))), Math.round(yaw), r1(w), r1(d), lv, roof, Math.floor(rnd() * 6), block ? 1 : 0]);
  }
  log('houses', houses.length);

  // ── Landmarks ──
  const lms = [], dinghies = [], flags = [], pines = [];
  for (const L of C.landmarks) {
    if (L.kind === 'pines') {
      // Along the lake's shore between the two points, set back onto the land.
      const [A, B] = L.shore;
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      for (let s = 0; s <= len; s += L.every) {
        let x = A[0] + (B[0] - A[0]) * s / len, y = A[1] + (B[1] - A[1]) * s / len;
        // Walk towards the land until it's dry, then the setback.
        const nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len;
        const dirS = height(x + nx * 40, y + ny * 40) > height(x - nx * 40, y - ny * 40) ? 1 : -1;
        let k = -40; while (k < 80 && height(x + nx * dirS * k, y + ny * dirS * k) < 0.5) k += 2;
        x += nx * dirS * (k + L.back); y += ny * dirS * (k + L.back);
        const h = L.h[0] + rnd() * (L.h[1] - L.h[0]);
        pines.push([r1(x), r1(y), r1(height(x, y)), r1(h)]);
      }
    } else if (L.kind === 'club') {
      const z = height(L.x, L.y);
      lms.push({ k: 'shed', x: L.x, y: L.y, z: r1(z), yaw: L.yaw, s: L.shed, roof: L.roof, wall: L.wall });
      const yr = L.yaw * Math.PI / 180, fx = Math.sin(yr), fy = Math.cos(yr), rx = Math.cos(yr), ry = -Math.sin(yr);
      for (let r = 0; r < L.boats[0]; r++) for (let c = 0; c < L.boats[1]; c++) {
        if (rnd() < 0.18) continue;
        const ox = L.shed[0] / 2 + 6 + c * 2.6, oy = -L.shed[1] / 2 - 4 - r * 5.2;
        const x = L.x + rx * ox + fx * oy, y = L.y + ry * ox + fy * oy;
        dinghies.push([r1(x), r1(y), r1(height(x, y)), L.yaw + 90 + Math.round((rnd() - 0.5) * 8)]);
      }
      const fx2 = L.x - rx * (L.shed[0] / 2 + 4), fy2 = L.y - ry * (L.shed[0] / 2 + 4);
      flags.push([r1(fx2), r1(fy2), r1(height(fx2, fy2)), 9, L.flag]);
    } else if (L.kind === 'sculpture') {
      lms.push({ k: 'chimera', x: L.x, y: L.y, z: r1(height(L.x, L.y)), h: L.h });
    } else if (L.kind === 'flag') {
      flags.push([L.x, L.y, r1(height(L.x, L.y)), L.h, L.color]);
    }
  }
  // Boats on moorings along the marinas' jetties.
  const boats = [];
  for (const M of C.marinas) for (const pr of piers) {
    for (let i = 0; i + 3 < pr.p.length; i += 2) {
      const ax = pr.p[i], ay = pr.p[i + 1], bx = pr.p[i + 2], by = pr.p[i + 3];
      if (Math.hypot((ax + bx) / 2 - M.x, (ay + by) / 2 - M.y) > M.r) continue;
      const len = Math.hypot(bx - ax, by - ay); if (len < 6) continue;
      const ang = Math.atan2(bx - ax, by - ay) * 180 / Math.PI, nx = (by - ay) / len, ny = -(bx - ax) / len;
      for (let s = 4; s < len - 2; s += 5.5) for (const side of [-1, 1]) {
        if (rnd() < 0.35) continue;
        const L = 7 + rnd() * 6, off = 1.6 + L * 0.5;
        const x = ax + (bx - ax) * s / len + nx * side * off, y = ay + (by - ay) * s / len + ny * side * off;
        if (height(x, y) > 0.3) continue;
        boats.push([r1(x), r1(y), Math.round(ang + 90 * side + (rnd() - 0.5) * 6), r1(L), rnd() < 0.45 ? 1 : 0]);
      }
    }
  }

  // ── Trees, from the photo: dark green where nothing's built ──
  // A mask of where trees can't stand, on the near photo's pixels.
  const mk = document.createElement('canvas'); mk.width = mk.height = C.nearImg;
  const mg = mk.getContext('2d', { willReadFrequently: true });
  const P = (x, y) => [(x + C.near) / (2 * C.near) * C.nearImg, (C.near - y) / (2 * C.near) * C.nearImg];
  const mpp = C.nearImg / (2 * C.near);
  mg.fillStyle = '#000'; mg.fillRect(0, 0, C.nearImg, C.nearImg);
  mg.strokeStyle = mg.fillStyle = '#fff'; mg.lineCap = 'round'; mg.lineJoin = 'round';
  for (const s of streets) { mg.lineWidth = (s.w + 2) * mpp; mg.beginPath(); s.p.forEach((q, i) => { const [u, v] = P(q[0], q[1]); i ? mg.lineTo(u, v) : mg.moveTo(u, v); }); mg.stroke(); }
  const polyFill = p => { mg.beginPath(); p.forEach((q, i) => { const [u, v] = P(q[0], q[1]); i ? mg.lineTo(u, v) : mg.moveTo(u, v); }); mg.closePath(); mg.fill(); };
  bldIndex.forEach(polyFill); open.forEach(polyFill);
  for (const h of houses) { const yr = h[3] * Math.PI / 180, cw = h[4] / 2 + 1.5, cd = h[5] / 2 + 1.5; const c = Math.cos(yr), s = Math.sin(yr); polyFill([[-cw, -cd], [cw, -cd], [cw, cd], [-cw, cd]].map(([a, b]) => [h[0] + a * c + b * s, h[1] - a * s + b * c])); }
  for (const l of lms) if (l.k === 'shed') polyFill([[-15, -15], [25, -15], [25, 15], [-15, 15]].map(([a, b]) => [l.x + a, l.y + b]));
  for (const p of pines) { mg.beginPath(); const [u, v] = P(p[0], p[1]); mg.arc(u, v, 6 * mpp, 0, 7); mg.fill(); }
  const mask = mg.getImageData(0, 0, C.nearImg, C.nearImg).data;
  const isTree = (c) => { const [r, g, b] = c; const lum = 0.3 * r + 0.59 * g + 0.11 * b; return g >= r - 3 && g > b + 3 && lum < 112 && lum > 16; };
  const trees = [];
  const addTree = (x, y, c, h, kind) => { const z = height(x, y); if (z < 0.5) return; trees.push([x, y, z, h, kind, c]); };
  // The near box: cells of 3 pixels near the club, 4 further out.
  const NI = C.nearImg;
  for (let j = 0; j < NI; j += 1) {
    for (let i = 0; i < NI; i += 1) {
      const x = -C.near + (i + 0.5) / mpp, y = C.near - (j + 0.5) / mpp;
      const cell = Math.hypot(x, y) < 1600 ? 3 : 4;
      if (i % cell || j % cell) continue;
      let n = 0, best = null, bl = 1e9;
      for (let b = 0; b < cell && j + b < NI; b++) for (let a = 0; a < cell && i + a < NI; a++) {
        const k = ((j + b) * NI + i + a) * 4;
        if (mask[k] > 128) continue;
        const c = [imN.px[k], imN.px[k + 1], imN.px[k + 2]];
        if (!isTree(c)) continue;
        n++; const l = c[0] + c[1] + c[2]; if (l < bl) { bl = l; best = [i + a, j + b, c]; }
      }
      if (n < cell * cell * 0.45 || !best) continue;
      const tx = -C.near + (best[0] + rnd()) / mpp, ty = C.near - (best[1] + rnd()) / mpp;
      // The crown's colour: lighter than its darkest pixel.
      const k0 = (best[1] * NI + best[0]) * 4; let cr = 0, cg = 0, cb = 0, cn = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const k = k0 + (b * NI + a) * 4; if (k >= 0 && k < imN.px.length) { cr += imN.px[k]; cg += imN.px[k + 1]; cb += imN.px[k + 2]; cn++; } }
      addTree(tx, ty, [cr / cn, cg / cn, cb / cn], 9 + rnd() * 11 + (n === cell * cell ? 3 : 0), Math.floor(rnd() * 4));
    }
  }
  const nearCount = trees.length;
  // The far box, outside the near one: clumps.
  const fm = C.wideImg / (2 * C.wide);
  for (let j = 0; j < C.wideImg; j += 3) for (let i = 0; i < C.wideImg; i += 3) {
    const x = -C.wide + (i + 1.5) / fm, y = C.wide - (j + 1.5) / fm;
    if (Math.abs(x) < C.near - 40 && Math.abs(y) < C.near - 40) continue;
    if (Math.hypot(x, y) > C.treesFar) continue;
    let n = 0, cr = 0, cg = 0, cb = 0;
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) { const k = ((j + b) * C.wideImg + i + a) * 4; const c = [imW.px[k], imW.px[k + 1], imW.px[k + 2]]; if (isTree(c)) { n++; cr += c[0]; cg += c[1]; cb += c[2]; } }
    if (n < 4) continue;
    addTree(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40, [cr / n, cg / n, cb / n], 16 + rnd() * 10, 4);
  }
  for (const p of pines) trees.push([p[0], p[1], p[2], p[3], 5, [52, 70, 48]]);
  log('trees', nearCount, trees.length);
  // Binary: per tree int16 x, int16 y (m), int16 z (dm), uint8 h (×4), uint8 kind, uint8 r, g, b, pad.
  const TB = new ArrayBuffer(trees.length * 12), dv = new DataView(TB);
  trees.forEach((t, i) => { const o = i * 12; dv.setInt16(o, Math.round(t[0]), true); dv.setInt16(o + 2, Math.round(t[1]), true); dv.setInt16(o + 4, Math.round(t[2] * 10), true); dv.setUint8(o + 6, Math.min(255, Math.round(t[3] * 4))); dv.setUint8(o + 7, t[4]); dv.setUint8(o + 8, Math.round(t[5][0])); dv.setUint8(o + 9, Math.round(t[5][1])); dv.setUint8(o + 10, Math.round(t[5][2])); });
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  out['trees.bin'] = 'data:application/octet-stream;base64,' + b64(TB);

  const scene = {
    v: 1, id, origin: O, near: C.near, wide: C.wide,
    credit: 'Imagery, elevation & addresses © Spatial Services NSW · Map data © OpenStreetMap contributors',
    roads, blds, piers, power, masts, houses, boats, dinghies, flags, landmarks: lms, trees: trees.length,
  };
  out['scene.json'] = JSON.stringify(scene);
  window.BAKE = out;
  log('done', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));
}
window.bake = bake;

// Saves every baked file through the browser's downloads (then move them into public/sim-venues/<id>/).
async function saveAll() {
  for (const [name, v] of Object.entries(window.BAKE || {})) {
    const a = document.createElement('a');
    a.download = name;
    a.href = v.startsWith('data:') ? v : URL.createObjectURL(new Blob([v], { type: 'application/json' }));
    a.click();
    await sleep(400);
  }
}
window.saveAll = saveAll;
