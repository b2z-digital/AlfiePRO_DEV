// Bakes a venue's 3D scenery for the Race Simulator's bank view (src/components/race-simulator/scenery3d).
//
// Runs in a browser page (any https page: every source below allows cross-origin requests). Paste
// this file into the console, then `await bake('lmryc')` and `await saveAll()`. The results land in
// `window.BAKE`, a map of file name -> data URL (or JSON text); save each into public/sim-venues/<id>/.
//
// Sources, all open (see IMAGERY for each state's photo):
// - NSW: imagery, 5 m elevation and address points from NSW Spatial Services. One house per address,
//   sized and turned to its street.
// - Elsewhere: the state's aerial photo service (or none: a ground drawn from OpenStreetMap's land
//   use), elevation from the AWS Terrain Tiles (Mapzen's Terrarium, global), and houses placed along
//   the residential streets wherever the photo shows something built.
// - Everywhere: roads, buildings, jetties, marinas, bridges, power lines, masts and chimneys from
//   OpenStreetMap (the editing API's map calls, in small tiles). © OpenStreetMap contributors, ODbL.
//
// Coordinates are metres from the club's saved location (x east, y north), as in src/sim/venues.

// Each state's aerial photo: an ArcGIS export (fetched in tiles and stitched), or WMTS tiles.
const IMAGERY = {
  nsw: { kind: 'arcgis', url: 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/export', credit: 'Spatial Services NSW' },
  qld: { kind: 'arcgis', url: 'https://spatial-img.information.qld.gov.au/arcgis/rest/services/Basemaps/LatestStateProgram_AllUsers/ImageServer/exportImage', credit: 'State of Queensland' },
  wa: { kind: 'arcgis', url: 'https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Locate/MapServer/export', credit: 'Landgate WA' },
  tas: { kind: 'arcgis', url: 'https://services.thelist.tas.gov.au/arcgis/rest/services/Basemaps/Orthophoto/MapServer/export', credit: 'Tasmanian Government, theLIST' },
  vic: { kind: 'wmts', tile: (z, x, y) => `https://base.maps.vic.gov.au/service?service=WMTS&request=GetTile&version=1.0.0&layer=AERIAL_WM_256&style=default&format=image/png&TileMatrixSet=EPSG:3857:256&TileMatrix=${z}&TileRow=${y}&TileCol=${x}`, credit: 'Vicmap, State of Victoria' },
  boprc: { kind: 'arcgis', url: 'https://gis.boprc.govt.nz/image/rest/services/aerial/AerialPhoto_2020_2021_TaurangaOmokoroa/ImageServer/exportImage', wideUrl: 'https://gis.boprc.govt.nz/image/rest/services/aerial/AerialPhoto_2018_2019/ImageServer/exportImage', credit: 'Bay of Plenty Regional Council' },
  osm: { kind: 'drawn', credit: '' },
};

const VENUES = {
  lmryc: {
    origin: { lat: -32.9731483, lon: 151.6152096 }, state: 'nsw',
    near: 3200, wide: 16000, // half-widths of the detailed and the far boxes, m
    nearImg: 2048, wideImg: 1536, nearDem: 640, wideDem: 400,
    treesFar: 9000, // trees on the far terrain only this far out
    // Marinas (as well as OSM's): boats on moorings along their jetties.
    marinas: [{ name: 'Marmong Point Marina', x: 331, y: -498, r: 230 }],
    // What people know the place by. Kinds: pines (a row along a shore), club (a sailing club's shed,
    // boat park and flagpole), sculpture, flag.
    landmarks: [
      { kind: 'pines', name: 'Speers Point foreshore pines', shore: [[324, 1077], [842, 824]], back: 7, every: 13, h: [22, 30] },
      { kind: 'club', name: 'Speers Point sailing club', x: 452, y: 992, yaw: 22, shed: [16, 9, 4.2], roof: '#5d6b6a', wall: '#d9d4c7', boats: [3, 7], flag: '#1f4fa3' },
      { kind: 'sculpture', name: 'Chimera', x: 328, y: 1096, h: 12 },
    ],
  },
  kbryc: {
    origin: { lat: -33.995977, lon: 151.1174658 }, state: 'nsw',
    // Tidal water: the survey caught its surface up to about half a metre.
    water: 0.75,
    near: 3200, wide: 16000, nearImg: 2048, wideImg: 1536, nearDem: 640, wideDem: 400, treesFar: 9000,
    marinas: [
      { name: 'St George Motor Boat Club', x: 450, y: -500, r: 230 },
      { name: "Tom Ugly's Bridge and Sylvania marinas", x: -690, y: -1050, r: 200 },
    ],
    // Road bridges over the water: the deck's height above it, and an old steel truss over the
    // carriageway that runs this way (compass degrees, roughly). Other bridges get a 7 m deck.
    bridges: [
      { road: 'Princes Highway', deck: 9, truss: { heading: 20 } },
      { road: 'Rocky Point Road', deck: 13 },
    ],
    landmarks: [{ kind: 'flag', name: 'St George Motor Boat Club', x: 560, y: -470, h: 10, color: '#1f3f8f' }],
  },
  // Outside NSW: `waterPts` are points out on the venue's water (from its lake polygon), to find the
  // water's height on the elevation model, which then becomes zero. `far` boxes (lon/lat) are where
  // to look for the tall things seen from a long way off: towers, masts, chimneys, high-rises.
  gladstone: { origin: { lat: -23.8370047, lon: 151.2479898 }, state: 'qld', near: 3200, wide: 16000, far: [[151.27, -23.85, 151.33, -23.81]] },
  kawana: { origin: { lat: -26.7431627, lon: 153.1240768 }, state: 'qld', near: 3200, wide: 24000, wideDem: 480 },
  paradise: { origin: { lat: -28.0203876, lon: 153.3785188 }, state: 'qld', near: 3200, wide: 16000, far: [[153.415, -28.045, 153.44, -27.985]] },
  lillydale: { origin: { lat: -37.7662587, lon: 145.355084 }, state: 'vic', near: 3200, wide: 16000, far: [[145.335, -37.85, 145.37, -37.82]] },
  plrmyc: { origin: { lat: -38.0561034, lon: 145.1484613 }, state: 'vic', near: 3200, wide: 16000 },
  jackadder: { origin: { lat: -31.908571, lon: 115.7941966 }, state: 'wa', near: 3200, wide: 16000, far: [[115.85, -31.962, 115.875, -31.945]] },
  risdon: { origin: { lat: -42.8006234, lon: 147.3316791 }, state: 'tas', near: 3200, wide: 20000, wideDem: 440, far: [[147.225, -42.9, 147.245, -42.888]] },
  taurikura: { origin: { lat: -37.7465228, lon: 176.1019942 }, state: 'boprc', near: 3200, wide: 16000 },
  patawalonga: { origin: { lat: -34.9640355, lon: 138.513059 }, state: 'osm', near: 3200, wide: 16000 },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const loadImg = (src) => new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => no(new Error('image ' + src.slice(0, 120))); im.src = src; });

async function bake(id, extra = {}) {
  const C = { nearImg: 2048, wideImg: 1536, nearDem: 640, wideDem: 400, treesFar: 9000, marinas: [], bridges: [], landmarks: [], far: [], ...VENUES[id], ...extra };
  const SRC = IMAGERY[C.state];
  const O = C.origin;
  const KX = 111320 * Math.cos(O.lat * Math.PI / 180), KY = 110940;
  const toXY = (lon, lat) => [(lon - O.lon) * KX, (lat - O.lat) * KY];
  const toLL = (x, y) => [O.lon + x / KX, O.lat + y / KY];
  const r1 = v => Math.round(v * 10) / 10;
  const out = {};
  const log = (...a) => console.log('[bake ' + id + ']', ...a);

  // ── Elevation ──
  async function demNSW(half, n) {
    const a = toLL(-half, -half), b = toLL(half, half);
    const u = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_5M_Elevation/ImageServer/exportImage?' + new URLSearchParams({ bbox: [a[0], a[1], b[0], b[1]].join(','), bboxSR: '4326', imageSR: '4326', size: `${n},${n}`, format: 'bsq', pixelType: 'F32', noData: '-9999', interpolation: 'RSP_BilinearInterpolation', f: 'image' });
    const buf = await (await fetch(u)).arrayBuffer();
    const f = new Float32Array(buf.slice(0, n * n * 4));
    for (let i = 0; i < f.length; i++) if (!(f[i] > -50 && f[i] < 2000)) f[i] = 0;
    return f;
  }
  // Terrarium tiles: metres = R*256 + G + B/256 - 32768.
  async function demTerrarium(half, n, z) {
    const N = 2 ** z;
    const tx = lon => (lon + 180) / 360 * N, ty = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N; };
    const a = toLL(-half, -half), b = toLL(half, half);
    const x0 = Math.floor(tx(a[0])), x1 = Math.floor(tx(b[0])), y0 = Math.floor(ty(b[1])), y1 = Math.floor(ty(a[1]));
    const W = (x1 - x0 + 1) * 256, H = (y1 - y0 + 1) * 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    const jobs = [];
    for (let X = x0; X <= x1; X++) for (let Y = y0; Y <= y1; Y++) jobs.push(loadImg(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${X}/${Y}.png`).then(im => g.drawImage(im, (X - x0) * 256, (Y - y0) * 256)).catch(() => {}));
    await Promise.all(jobs);
    const d = g.getImageData(0, 0, W, H).data;
    const hAt = (px, py) => { const i = Math.max(0, Math.min(W - 1, px | 0)), j = Math.max(0, Math.min(H - 1, py | 0)); const k = (j * W + i) * 4; return d[k] * 256 + d[k + 1] + d[k + 2] / 256 - 32768; };
    const f = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -half + 2 * half * i / (n - 1), y = half - 2 * half * j / (n - 1);
      const [lon, lat] = toLL(x, y);
      const px = (tx(lon) - x0) * 256 - 0.5, py = (ty(lat) - y0) * 256 - 0.5;
      const i0 = Math.floor(px), j0 = Math.floor(py), u = px - i0, v = py - j0;
      f[j * n + i] = hAt(i0, j0) * (1 - u) * (1 - v) + hAt(i0 + 1, j0) * u * (1 - v) + hAt(i0, j0 + 1) * (1 - u) * v + hAt(i0 + 1, j0 + 1) * u * v;
    }
    return f;
  }
  const demN = C.state === 'nsw' ? await demNSW(C.near, C.nearDem) : await demTerrarium(C.near, C.nearDem, 14);
  const demW = C.state === 'nsw' ? await demNSW(C.wide, C.wideDem) : await demTerrarium(C.wide, C.wideDem, 11);
  const sample = (f, n, half, x, y) => {
    const fx = (x + half) / (2 * half) * (n - 1), fy = (half - y) / (2 * half) * (n - 1);
    const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fy)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fy - j));
    const k = j * n + i;
    return f[k] * (1 - u) * (1 - v) + f[k + 1] * u * (1 - v) + f[k + n] * (1 - u) * v + f[k + n + 1] * u * v;
  };
  // Inland water sits well above sea level: make the venue's water zero.
  let base = 0;
  if (C.waterPts && C.waterPts.length) {
    const hs = C.waterPts.map(([x, y]) => sample(demN, C.nearDem, C.near, x, y)).sort((a, b) => a - b);
    base = hs[Math.floor(hs.length / 2)];
    for (const f of [demN, demW]) for (let i = 0; i < f.length; i++) f[i] -= base;
    log('water level on the elevation model', base.toFixed(2));
  }
  const CUT = C.water ?? (C.state === 'nsw' ? 0.22 : 0.6);
  const height = (x, y) => (Math.abs(x) < C.near && Math.abs(y) < C.near ? sample(demN, C.nearDem, C.near, x, y) : sample(demW, C.wideDem, C.wide, x, y));
  // Heights packed as (h + off) * scale: -20..635 m by default; a venue high above sea or under a
  // mountain (Lillydale, Risdon, Taurikura) needs the wider -100..1538 m (scene.dem tells the renderer).
  let lo = 1e9, hi = -1e9;
  for (const f of [demN, demW]) for (const v of f) if (v > -1000) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const ENC = lo < -19 && C.waterPts && base > 15 || hi > 630 ? { off: 100, scale: 40 } : null;
  const demPng = (f, n) => {
    const c = document.createElement('canvas'); c.width = n; c.height = n;
    const g = c.getContext('2d'), im = g.createImageData(n, n);
    const off = ENC ? ENC.off : 20, sc = ENC ? ENC.scale : 100;
    for (let i = 0; i < n * n; i++) { const v = Math.max(0, Math.min(65535, Math.round((f[i] + off) * sc))); im.data[i * 4] = v >> 8; im.data[i * 4 + 1] = v & 255; im.data[i * 4 + 2] = 0; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/png');
  };
  out['dem-near.png'] = demPng(demN, C.nearDem);
  out['dem-wide.png'] = demPng(demW, C.wideDem);
  log('elevation done');

  // ── OpenStreetMap, in tiles of 0.02° ──
  const nodes = new Map(), ways = new Map();
  async function osmBox(lon0, lat0, lon1, lat1) {
    for (let lat = lat0; lat < lat1; lat += 0.02) for (let lon = lon0; lon < lon1; lon += 0.02) {
      const u = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${lon.toFixed(4)},${lat.toFixed(4)},${Math.min(lon1, lon + 0.02).toFixed(4)},${Math.min(lat1, lat + 0.02).toFixed(4)}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { const j = await (await fetch(u)).json(); for (const e of j.elements) { if (e.type === 'node') nodes.set(e.id, e); else if (e.type === 'way') ways.set(e.id, e); } break; } catch (e) { await sleep(2000); }
      }
      await sleep(300);
    }
  }
  const a0 = toLL(-C.near, -C.near), b0 = toLL(C.near, C.near);
  await osmBox(a0[0], a0[1], b0[0], b0[1]);
  const nearWays = new Set(ways.keys());
  for (const f of C.far) await osmBox(...f);
  log('osm', nodes.size, ways.size);
  const nxy = id => { const n = nodes.get(id); return n ? toXY(n.lon, n.lat) : null; };
  const wayPts = w => w.nodes.map(nxy).filter(Boolean);
  const inNear = p => Math.abs(p[0]) < C.near && Math.abs(p[1]) < C.near;
  const closed = w => w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];
  const pip = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

  // ── Imagery ──
  // Land use, for a drawn ground where there's no photo (and to keep houses and trees off fields).
  const LANDUSE = [
    [t => t.natural === 'water' || t.water || t.waterway === 'riverbank', '#3f6a86'],
    [t => t.landuse === 'residential', '#b9b2a2'],
    [t => t.landuse === 'commercial' || t.landuse === 'retail' || t.landuse === 'industrial' || t.amenity === 'parking', '#a6a49f'],
    [t => t.leisure === 'park' || t.leisure === 'golf_course' || t.leisure === 'pitch' || t.landuse === 'grass' || t.landuse === 'recreation_ground' || t.leisure === 'recreation_ground', '#7f9a5b'],
    [t => t.natural === 'wood' || t.landuse === 'forest' || t.natural === 'scrub' || t.leisure === 'nature_reserve', '#4f6a42'],
    [t => t.natural === 'beach' || t.natural === 'sand', '#d8ccaa'],
  ];
  async function imagery(half, n, wide) {
    const c = document.createElement('canvas'); c.width = n; c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true });
    const a = toLL(-half, -half), b = toLL(half, half);
    if (SRC.kind === 'arcgis') {
      // Asked for in Web Mercator, which every service honours as given (asked for in lat/lon, ArcGIS
      // widens each tile's latitude span to keep its pixels square in degrees), then resampled row by row.
      const url = (wide && SRC.wideUrl) || SRC.url, T = 1024, RE = 6378137;
      const MX = lon => RE * lon * Math.PI / 180, MY = lat => RE * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
      const X0 = MX(a[0]), X1 = MX(b[0]), Y0 = MY(a[1]), Y1 = MY(b[1]);
      const mmp = (X1 - X0) / n, Hm = Math.ceil((Y1 - Y0) / mmp);
      const M = document.createElement('canvas'); M.width = n; M.height = Hm;
      const mg = M.getContext('2d');
      const jobs = [];
      for (let py = 0; py < Hm; py += T) for (let px = 0; px < n; px += T) {
        const pw = Math.min(T, n - px), ph = Math.min(T, Hm - py);
        const bx0 = X0 + px * mmp, by1 = Y1 - py * mmp;
        const u = url + '?' + new URLSearchParams({ bbox: [bx0, by1 - ph * mmp, bx0 + pw * mmp, by1].join(','), bboxSR: '3857', imageSR: '3857', size: `${pw},${ph}`, format: 'jpg', f: 'image' });
        jobs.push((async () => { for (let t = 0; t < 3; t++) { try { const im = await loadImg(u); mg.drawImage(im, px, py, pw, ph); return; } catch (e) { await sleep(1500); } } })());
      }
      await Promise.all(jobs);
      for (let j = 0; j < n; j++) {
        const lat = b[1] - (b[1] - a[1]) * (j + 0.5) / n;
        g.drawImage(M, 0, (Y1 - MY(lat)) / mmp - 0.5, n, 1, 0, j, n, 1);
      }
    } else if (SRC.kind === 'wmts') {
      const mpp = 2 * half / n, z = Math.min(18, Math.max(10, Math.round(Math.log2(156543 * Math.cos(O.lat * Math.PI / 180) / mpp))));
      const N = 2 ** z;
      const mx = lon => (lon + 180) / 360 * N * 256, my = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N * 256; };
      const X0 = Math.floor(mx(a[0]) / 256), X1 = Math.floor(mx(b[0]) / 256), Y0 = Math.floor(my(b[1]) / 256), Y1 = Math.floor(my(a[1]) / 256);
      const M = document.createElement('canvas'); M.width = (X1 - X0 + 1) * 256; M.height = (Y1 - Y0 + 1) * 256;
      const mg = M.getContext('2d');
      const jobs = [];
      for (let X = X0; X <= X1; X++) for (let Y = Y0; Y <= Y1; Y++) jobs.push((async () => { for (let t = 0; t < 3; t++) { try { const im = await loadImg(SRC.tile(z, X, Y)); mg.drawImage(im, (X - X0) * 256, (Y - Y0) * 256); return; } catch (e) { await sleep(1000); } } })());
      for (let i = 0; i < jobs.length; i += 24) await Promise.all(jobs.slice(i, i + 24));
      // Web Mercator rows to our north-up, metre-square rows.
      const sx0 = mx(a[0]) - X0 * 256, sw = mx(b[0]) - mx(a[0]);
      for (let j = 0; j < n; j++) {
        const lat = b[1] - (b[1] - a[1]) * (j + 0.5) / n;
        g.drawImage(M, sx0, my(lat) - Y0 * 256, sw, 1, 0, j, n, 1);
      }
    } else {
      // No photo: the ground drawn from the land use.
      const P = (x, y) => [(x + half) / (2 * half) * n, (half - y) / (2 * half) * n];
      g.fillStyle = '#9c9a78'; g.fillRect(0, 0, n, n);
      for (const [test, col] of LANDUSE) {
        g.fillStyle = col;
        for (const w of ways.values()) { const t = w.tags || {}; if (!closed(w) || !test(t)) continue; const p = wayPts(w); g.beginPath(); p.forEach((q, i) => { const [u, v] = P(q[0], q[1]); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.closePath(); g.fill(); }
      }
      g.strokeStyle = '#77736c'; g.lineCap = 'round';
      for (const w of ways.values()) { const t = w.tags || {}; if (!t.highway || /foot|path|cycle|steps|track/.test(t.highway)) continue; g.lineWidth = Math.max(1, (/primary|secondary|trunk|motorway/.test(t.highway) ? 14 : 8) * n / (2 * half)); const p = wayPts(w); g.beginPath(); p.forEach((q, i) => { const [u, v] = P(q[0], q[1]); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.stroke(); }
      // A little grain, so it doesn't read as flat paint.
      const im = g.getImageData(0, 0, n, n); let s = 9;
      for (let i = 0; i < im.data.length; i += 4) { s = (s * 16807) % 2147483647; const k = 0.88 + (s / 2147483647) * 0.24; im.data[i] *= k; im.data[i + 1] *= k; im.data[i + 2] *= k; }
      g.putImageData(im, 0, 0);
    }
    return { c, px: g.getImageData(0, 0, n, n).data, n, half, real: SRC.kind !== 'drawn' };
  }
  const imN = await imagery(C.near, C.nearImg, false), imW = await imagery(C.wide, C.wideImg, true);
  out['near.webp'] = imN.c.toDataURL('image/webp', 0.72);
  out['wide.webp'] = imW.c.toDataURL('image/webp', 0.7);
  log('imagery done');
  const pixAt = (im, x, y) => { const i = Math.round((x + im.half) / (2 * im.half) * im.n), j = Math.round((im.half - y) / (2 * im.half) * im.n); if (i < 0 || j < 0 || i >= im.n || j >= im.n) return null; const k = (j * im.n + i) * 4; return [im.px[k], im.px[k + 1], im.px[k + 2]]; };

  // ── Roads, bridges and streets ──
  const MAJOR = { motorway: 4, trunk: 4, primary: 3, secondary: 2, tertiary: 1, motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1 };
  const STREET = new Set(['residential', 'unclassified', 'living_street', 'tertiary', 'secondary', 'primary', 'trunk', 'service']);
  const roads = [], streets = [], bridges = [];
  const deckZ = (p, deck) => {
    const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const L = cum[cum.length - 1] || 1, ramp = Math.min(70, L / 3);
    return p.map((q, i) => { const e = Math.min(cum[i], L - cum[i]); const k = Math.min(1, e / ramp); const g = Math.max(0.3, height(q[0], q[1])); return Math.max(g + 0.5, g + (deck - g) * (k * k * (3 - 2 * k))); });
  };
  const densify = (p, step) => { const d = []; for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) d.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } d.push(p[p.length - 1]); return d; };
  for (const id2 of nearWays) {
    const w = ways.get(id2), t = w.tags || {};
    if (!t.highway || t.area === 'yes' || t.tunnel) continue;
    let p = wayPts(w); if (p.length < 2 || !p.some(inNear)) continue;
    // A bridge over the water (named in the config, or any road bridge that crosses water).
    let B = null;
    if (t.bridge && t.bridge !== 'no' && MAJOR[t.highway] != null) {
      const named = C.bridges.find(b => (t.name || '').includes(b.road) || (t.ref || '').includes(b.road));
      const d = densify(p, 10);
      if (named || d.some(q => height(q[0], q[1]) < CUT)) { B = named || { deck: 7 }; p = d; }
    }
    const zs = B ? deckZ(p, B.deck) : p.map(q => Math.max(0.3, height(q[0], q[1])) + 0.15);
    if (B) {
      const lanes = +t.lanes || (t.oneway === 'yes' ? 3 : 4);
      const hd = (Math.atan2(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]) * 180 / Math.PI + 360) % 360;
      const truss = B.truss && Math.abs(((hd - B.truss.heading + 540) % 360) - 180) < 45 ? 1 : 0;
      bridges.push({ n: t.name || t.ref || '', w: r1(lanes * 3.4 + 1.5), truss, p: p.flatMap((q, i) => [r1(q[0]), r1(q[1]), r1(zs[i])]) });
    }
    if (MAJOR[t.highway] != null) roads.push({ c: MAJOR[t.highway], n: t.name || t.ref || '', one: t.oneway === 'yes' ? 1 : 0, p: p.flatMap((q, i) => [r1(q[0]), r1(q[1]), r1(B ? zs[i] + 0.1 : zs[i])]) });
    if (STREET.has(t.highway)) streets.push({ p, w: t.highway === 'service' ? 4 : MAJOR[t.highway] != null ? 9 : 7, res: t.highway === 'residential' || t.highway === 'living_street' || t.highway === 'unclassified' });
  }
  function roofColour(x, y, r) {
    const cols = [];
    for (let dx = -r; dx <= r; dx += 1.5) for (let dy = -r; dy <= r; dy += 1.5) { const c = pixAt(imN, x + dx, y + dy); if (c && !(c[1] > c[0] + 4 && c[1] > c[2])) cols.push(c); }
    if (cols.length < 3) return null;
    cols.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
    const m = cols[Math.floor(cols.length / 2)];
    return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ── Buildings: OSM's near the club, and the tall ones further off ──
  const blds = [];
  for (const w of ways.values()) {
    const t = w.tags || {};
    if (!t.building || !closed(w)) continue;
    const p = wayPts(w).slice(0, -1); if (p.length < 3) continue;
    const lv = +t['building:levels'] || (t.building === 'apartments' ? 3 : t.building === 'commercial' || t.building === 'industrial' || t.building === 'school' ? 2 : 1);
    const ht = +String(t.height || '').replace(/[^\d.]/g, '') || lv * 3.3 + 1;
    const near = nearWays.has(w.id) && p.some(inNear);
    if (!near && ht < 30) continue; // far off, only the high-rises
    const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length;
    const z = Math.min(...p.map(q => height(q[0], q[1])));
    blds.push({ n: t.name || '', h: r1(ht), z: r1(z), roof: near && imN.real ? roofColour(cx, cy, 3) : null, p: p.flatMap(q => [r1(q[0]), r1(q[1])]) });
  }
  // Jetties and pontoons.
  const piers = [];
  for (const id2 of nearWays) {
    const w = ways.get(id2), t = w.tags || {};
    if (t.man_made !== 'pier' && t.man_made !== 'jetty' && t.man_made !== 'breakwater') continue;
    const p = wayPts(w); if (p.length < 2 || !p.some(inNear)) continue;
    piers.push({ n: t.name || '', a: closed(w) ? 1 : 0, w: +t.width || 2.2, p: p.flatMap(q => [r1(q[0]), r1(q[1])]) });
  }
  // Marinas, as OSM maps them, as well as the config's.
  const marinas = [...C.marinas];
  for (const w of ways.values()) {
    const t = w.tags || {};
    if (t.leisure !== 'marina' || !closed(w)) continue;
    const p = wayPts(w); if (!p.some(inNear)) continue;
    const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length;
    marinas.push({ name: t.name || '', x: cx, y: cy, r: Math.max(...p.map(q => Math.hypot(q[0] - cx, q[1] - cy))) + 25 });
  }
  // Power lines; masts, towers and chimneys.
  const power = [], masts = [];
  for (const id2 of nearWays) {
    const w = ways.get(id2), t = w.tags || {};
    if (t.power !== 'line') continue;
    const p = wayPts(w); if (p.length < 2 || !p.some(inNear)) continue;
    power.push(p.flatMap(q => [r1(q[0]), r1(q[1]), r1(Math.max(0, height(q[0], q[1])))]));
  }
  for (const n of nodes.values()) {
    const t = n.tags; if (!t) continue;
    const kind = t.man_made === 'mast' || t.man_made === 'communications_tower' || (t.man_made === 'tower' && /communication|observation|lighting/.test(t['tower:type'] || '')) ? 0 : t.man_made === 'chimney' ? 1 : -1;
    if (kind < 0) continue;
    const q = toXY(n.lon, n.lat); if (Math.abs(q[0]) > C.wide || Math.abs(q[1]) > C.wide) continue;
    const h = +String(t.height || '').replace(/[^\d.]/g, '') || (kind ? 60 : 35);
    masts.push([r1(q[0]), r1(q[1]), r1(height(q[0], q[1])), h, kind]);
  }
  // Fields, car parks, water and parks: no houses there (and no trees on fields and car parks).
  const open = [], parks = [];
  for (const id2 of nearWays) {
    const w = ways.get(id2), t = w.tags || {};
    if (!closed(w)) continue;
    if (t.leisure === 'pitch' || t.amenity === 'parking' || t.landuse === 'industrial' || t.landuse === 'commercial' || t.landuse === 'retail' || t.leisure === 'swimming_pool' || t.natural === 'water' || t.landuse === 'cemetery' || t.leisure === 'golf_course') open.push(wayPts(w));
    if (t.leisure === 'park' || t.leisure === 'nature_reserve' || t.natural === 'wood' || t.landuse === 'forest' || t.landuse === 'recreation_ground' || t.leisure === 'golf_course' || t.natural === 'wetland' || t.natural === 'beach') parks.push(wayPts(w));
  }
  log('features', roads.length, bridges.length, blds.length, piers.length, marinas.length, power.length, masts.length);

  // ── Houses ──
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bldIndex = blds.map(b => { const p = []; for (let i = 0; i < b.p.length; i += 2) p.push([b.p[i], b.p[i + 1]]); return p; });
  const inAny = (polys, x, y) => polys.some(p => p.length > 2 && pip(p, x, y));
  const houses = [];
  const ROOFS = ['#7a3f2c', '#8a4a33', '#5b5f63', '#3f4448', '#6d7174', '#9a9b97', '#b9b7ae', '#4a3a33'];
  const G = 100, sg = new Map(), segs = [];
  for (const s of streets) for (let i = 0; i + 1 < s.p.length; i++) segs.push([s.p[i], s.p[i + 1], s.w, s.res]);
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
  const taken = new Set(), cellKey = (x, y) => Math.round(x / 9) + ',' + Math.round(y / 9);
  const free = (x, y) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (taken.has((Math.round(x / 9) + a) + ',' + (Math.round(y / 9) + b))) return false; return true; };
  const addHouse = (x, y, yaw, w, d, lv, roof, block) => {
    houses.push([r1(x), r1(y), r1(height(x, y)), Math.round(yaw), r1(w), r1(d), lv, roof, Math.floor(rnd() * 6), block ? 1 : 0]);
    taken.add(cellKey(x, y));
  };
  if (C.state === 'nsw') {
    // One per address point.
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
    for (const [x, y, units] of at.values()) {
      const z = height(x, y); if (z < CUT + 0.3) continue;
      if (bldIndex.some(p => Math.abs(p[0][0] - x) < 120 && pip(p, x, y))) continue;
      const s = nearestSeg(x, y), block = units >= 4;
      const w = block ? 18 + rnd() * 10 : 10 + rnd() * 5, d = block ? 16 + units * 0.8 : 12 + rnd() * 6;
      const lv = block ? Math.min(5, 2 + Math.floor(units / 10)) : rnd() < 0.12 ? 2 : 1;
      const yaw = s && s.d < 70 ? s.ang : rnd() * 180;
      let hx = x, hy = y;
      if (s && s.d < 70 && s.d < s.w / 2 + d / 2 + 4) { const k = (s.w / 2 + d / 2 + 4) / Math.max(0.1, s.d); hx = s.px + (x - s.px) * k; hy = s.py + (y - s.py) * k; }
      let roof = roofColour(hx, hy, 4);
      if (!roof || rnd() < 0.15) roof = ROOFS[Math.floor(rnd() * ROOFS.length)];
      addHouse(hx, hy, yaw, w, d, lv, roof, block);
    }
  } else {
    // Along the residential streets, a lot every 15–20 m each side, wherever the photo shows something built.
    for (const b of bldIndex) for (const q of b) taken.add(cellKey(q[0], q[1]));
    const built = (x, y) => {
      if (!imN.real) return true;
      let n = 0, k = 0;
      for (let dx = -6; dx <= 6; dx += 2) for (let dy = -6; dy <= 6; dy += 2) { const c = pixAt(imN, x + dx, y + dy); if (!c) continue; n++; const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; if (!(c[1] > c[0] + 3 && c[1] > c[2] + 3) && l > 45 && l < 240) k++; }
      return n && k / n > 0.42;
    };
    for (const [a, b, sw, res] of segs) {
      if (!res) continue;
      const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey); if (L < 8) continue;
      const ux = ex / L, uy = ey / L, nx = uy, ny = -ux, yaw = Math.atan2(ex, ey) * 180 / Math.PI;
      for (let s = 6 + rnd() * 6; s < L - 4; s += 15 + rnd() * 5) for (const side of [-1, 1]) {
        const w = 10 + rnd() * 5, d = 12 + rnd() * 6;
        const off = sw / 2 + 5 + d / 2;
        const x = a[0] + ux * s + nx * side * off, y = a[1] + uy * s + ny * side * off;
        if (!inNear([x, y]) || height(x, y) < CUT + 0.4 || !free(x, y)) continue;
        if (inAny(open, x, y) || inAny(parks, x, y)) continue;
        if (!built(x, y)) continue;
        let roof = imN.real ? roofColour(x, y, 4) : null;
        if (!roof || rnd() < 0.15) roof = ROOFS[Math.floor(rnd() * ROOFS.length)];
        addHouse(x, y, yaw, w, d, rnd() < 0.15 ? 2 : 1, roof, false);
      }
    }
  }
  log('houses', houses.length);

  // ── Landmarks ──
  const lms = [], dinghies = [], flags = [], pines = [];
  for (const L of C.landmarks) {
    if (L.kind === 'pines') {
      const [A, B] = L.shore, len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      for (let s = 0; s <= len; s += L.every) {
        let x = A[0] + (B[0] - A[0]) * s / len, y = A[1] + (B[1] - A[1]) * s / len;
        const nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len;
        const dirS = height(x + nx * 40, y + ny * 40) > height(x - nx * 40, y - ny * 40) ? 1 : -1;
        let k = -40; while (k < 80 && height(x + nx * dirS * k, y + ny * dirS * k) < 0.5) k += 2;
        x += nx * dirS * (k + L.back); y += ny * dirS * (k + L.back);
        pines.push([r1(x), r1(y), r1(height(x, y)), r1(L.h[0] + rnd() * (L.h[1] - L.h[0]))]);
      }
    } else if (L.kind === 'club') {
      lms.push({ k: 'shed', x: L.x, y: L.y, z: r1(height(L.x, L.y)), yaw: L.yaw, s: L.shed, roof: L.roof, wall: L.wall });
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
  // Boats on swing moorings (where OSM has them), and along marinas' jetties.
  const boats = [];
  for (const n of nodes.values()) {
    const t = n.tags; if (!t) continue;
    if (!(/mooring/.test(t['seamark:type'] || '') || t.mooring === 'yes' || t.leisure === 'mooring')) continue;
    const q = toXY(n.lon, n.lat); if (!inNear(q) || height(q[0], q[1]) > CUT) continue;
    boats.push([r1(q[0]), r1(q[1]), Math.round(rnd() * 360), r1(7 + rnd() * 5), rnd() < 0.55 ? 1 : 0]);
  }
  for (const M of marinas) for (const pr of piers) {
    for (let i = 0; i + 3 < pr.p.length; i += 2) {
      const ax = pr.p[i], ay = pr.p[i + 1], bx = pr.p[i + 2], by = pr.p[i + 3];
      if (Math.hypot((ax + bx) / 2 - M.x, (ay + by) / 2 - M.y) > M.r) continue;
      const len = Math.hypot(bx - ax, by - ay); if (len < 6) continue;
      const ang = Math.atan2(bx - ax, by - ay) * 180 / Math.PI, nx = (by - ay) / len, ny = -(bx - ax) / len;
      for (let s = 4; s < len - 2; s += 5.5) for (const side of [-1, 1]) {
        if (rnd() < 0.35) continue;
        const L = 7 + rnd() * 6, off = 1.6 + L * 0.5;
        const x = ax + (bx - ax) * s / len + nx * side * off, y = ay + (by - ay) * s / len + ny * side * off;
        if (height(x, y) > CUT) continue;
        if (boats.some(b2 => Math.abs(b2[0] - x) < 3 && Math.abs(b2[1] - y) < 3)) continue;
        boats.push([r1(x), r1(y), Math.round(ang + 90 * side + (rnd() - 0.5) * 6), r1(L), rnd() < 0.45 ? 1 : 0]);
      }
    }
  }

  // ── Trees ──
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
  const addTree = (x, y, c, h, kind) => { const z = height(x, y); if (z < CUT + 0.2) return; trees.push([x, y, z, h, kind, c]); };
  const NI = C.nearImg;
  if (imN.real) {
    for (let j = 0; j < NI; j++) for (let i = 0; i < NI; i++) {
      const x = -C.near + (i + 0.5) / mpp, y = C.near - (j + 0.5) / mpp;
      const cell = Math.hypot(x, y) < 1600 ? 3 : 4;
      if (i % cell || j % cell) continue;
      let n = 0, best = null, bl = 1e9;
      for (let b = 0; b < cell && j + b < NI; b++) for (let a = 0; a < cell && i + a < NI; a++) {
        const k = ((j + b) * NI + i + a) * 4;
        if (mask[k] > 128) continue;
        const c = [imN.px[k], imN.px[k + 1], imN.px[k + 2]];
        if (!isTree(c)) continue;
        n++; const l = c[0] + c[1] + c[2]; if (l < bl) { bl = l; best = [i + a, j + b]; }
      }
      if (n < cell * cell * 0.45 || !best) continue;
      const tx = -C.near + (best[0] + rnd()) / mpp, ty = C.near - (best[1] + rnd()) / mpp;
      const k0 = (best[1] * NI + best[0]) * 4; let cr = 0, cg = 0, cb = 0, cn = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const k = k0 + (b * NI + a) * 4; if (k >= 0 && k < imN.px.length) { cr += imN.px[k]; cg += imN.px[k + 1]; cb += imN.px[k + 2]; cn++; } }
      addTree(tx, ty, [cr / cn, cg / cn, cb / cn], 9 + rnd() * 11 + (n === cell * cell ? 3 : 0), Math.floor(rnd() * 4));
    }
  } else {
    // No photo: OSM's trees, woods filled in, and street trees.
    for (const n of nodes.values()) if (n.tags && n.tags.natural === 'tree') { const q = toXY(n.lon, n.lat); if (inNear(q)) addTree(q[0], q[1], [70, 92, 60], 8 + rnd() * 9, Math.floor(rnd() * 4)); }
    for (const id2 of nearWays) {
      const w = ways.get(id2), t = w.tags || {};
      if (!closed(w) || !(t.natural === 'wood' || t.landuse === 'forest' || t.natural === 'scrub' || t.leisure === 'park' || t.leisure === 'nature_reserve')) continue;
      const p = wayPts(w), xs = p.map(q => q[0]), ys = p.map(q => q[1]);
      const dense = t.leisure === 'park' ? 0.18 : 0.75;
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 12) for (let y = Math.min(...ys); y < Math.max(...ys); y += 12) {
        if (rnd() > dense) continue;
        const tx = x + (rnd() - 0.5) * 10, ty = y + (rnd() - 0.5) * 10;
        if (!pip(p, tx, ty)) continue;
        const [u, v] = P(tx, ty), k = ((v | 0) * NI + (u | 0)) * 4; if (mask[k] > 128) continue;
        addTree(tx, ty, [62 + rnd() * 20, 84 + rnd() * 20, 54 + rnd() * 12], 9 + rnd() * 10, Math.floor(rnd() * 4));
      }
    }
    for (const [a, b, sw, res] of segs) {
      if (!res) continue;
      const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey); if (L < 10) continue;
      for (let s = rnd() * 20; s < L; s += 22) for (const side of [-1, 1]) {
        if (rnd() < 0.45) continue;
        const off = sw / 2 + 2.5 + rnd() * 2;
        addTree(a[0] + ex / L * s + ey / L * side * off, a[1] + ey / L * s - ex / L * side * off, [66 + rnd() * 20, 88 + rnd() * 18, 58 + rnd() * 12], 6 + rnd() * 7, Math.floor(rnd() * 4));
      }
    }
  }
  const nearCount = trees.length;
  if (imW.real) {
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
  }
  for (const p of pines) trees.push([p[0], p[1], p[2], p[3], 5, [52, 70, 48]]);
  log('trees', nearCount, trees.length);
  const TB = new ArrayBuffer(trees.length * 12), dv = new DataView(TB);
  trees.forEach((t, i) => { const o = i * 12; dv.setInt16(o, Math.round(t[0]), true); dv.setInt16(o + 2, Math.round(t[1]), true); dv.setInt16(o + 4, Math.round(t[2] * 10), true); dv.setUint8(o + 6, Math.min(255, Math.round(t[3] * 4))); dv.setUint8(o + 7, t[4]); dv.setUint8(o + 8, Math.round(t[5][0])); dv.setUint8(o + 9, Math.round(t[5][1])); dv.setUint8(o + 10, Math.round(t[5][2])); });
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  out['trees.bin'] = 'data:application/octet-stream;base64,' + b64(TB);

  const credit = [
    SRC.credit ? `Imagery © ${SRC.credit}` : '',
    C.state === 'nsw' ? 'Elevation & addresses © Spatial Services NSW' : 'Elevation: Terrain Tiles (Mapzen, AWS)',
    'Map data © OpenStreetMap contributors',
  ].filter(Boolean).join(' · ');
  const scene = {
    v: 1, id, origin: O, near: C.near, wide: C.wide, water: CUT, credit, base, ...(ENC ? { dem: ENC } : {}),
    roads, bridges, blds, piers, power, masts, houses, boats, dinghies, flags, landmarks: lms, trees: trees.length,
  };
  out['scene.json'] = JSON.stringify(scene);
  window.BAKE = out;
  log('done', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]))));
  return out;
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
window.VENUES = VENUES;
