# Make the land/water split of a baked venue trustworthy where the elevation model isn't (outside NSW the
# only open elevation is SRTM, which reads mangroves, tidal flats and noise as land and pocks real land
# with holes below the water line). Water is: the sim's own water (LAKE), OpenStreetMap's water areas, and
# the sea (the open-ocean bathymetry, connected to the edge). Everything else is land, at least a little
# above the water line. Then trees, houses and the rest are re-seated on the corrected ground.
#   python3 fixwater.py <venue> <dir> <water.json> [base]
# <dir> holds the venue's six baked files and is rewritten in place. <water.json> is {venue: [{o, m, w, p}]}:
# OpenStreetMap's water areas round the venue (see README). [base] is the water level the bake took off
# the survey (scene.json has it as 'base' since).
import sys, re, json, struct, math, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ven, root, wpath = sys.argv[1], sys.argv[2], sys.argv[3]
scene = json.load(open(f'{root}/scene.json'))
base = float(sys.argv[4]) if len(sys.argv) > 4 else scene.get('base', 0)
CUT = scene['water']
NEAR, WIDE = scene['near'], scene['wide']

src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), f'../../../src/sim/venues/{ven}.ts')).read()
m = re.search(r'const LAKE = \[([^\]]*)\]', src)
nums = [float(v) for v in m.group(1).split(',') if v.strip()]
LAKE = list(zip(nums[0::2], nums[1::2]))

# OSM water rings: closed ways as they are; multipolygon members joined end to end.
W = json.load(open(wpath))[ven]
def pts(p): return [(p[i], p[i + 1]) for i in range(0, len(p), 2)]
outers, inners, loose = [], [], {0: [], 1: []}
for e in W:
    if e.get('m'): continue  # mangroves stay land (they're trees)
    p = pts(e['p'])
    if len(p) < 3: continue
    if e.get('w') and p[0] != p[-1]: loose[e['o']].append(p); continue
    (outers if e['o'] else inners).append(p)
for o, segs in loose.items():
    segs = [s[:] for s in segs]
    while segs:
        ring = segs.pop()
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for k, s in enumerate(segs):
                if s[0] == ring[-1]: ring += s[1:]
                elif s[-1] == ring[-1]: ring += s[::-1][1:]
                elif s[-1] == ring[0]: ring = s[:-1] + ring
                elif s[0] == ring[0]: ring = s[::-1][:-1] + ring
                else: continue
                segs.pop(k); changed = True; break
        if len(ring) > 3: (outers if o else inners).append(ring)

def raster(polys_on, polys_off, n, half, ss=3):
    N = n * ss
    im = Image.new('L', (N, N), 0); d = ImageDraw.Draw(im)
    P = lambda x, y: ((x + half) / (2 * half) * (n - 1) * ss + ss / 2, (half - y) / (2 * half) * (n - 1) * ss + ss / 2)
    for p in polys_on: d.polygon([P(*q) for q in p], fill=255)
    for p in polys_off: d.polygon([P(*q) for q in p], fill=0)
    a = np.asarray(im, np.float32).reshape(n, ss, n, ss).mean(axis=(1, 3))
    return a > 127

ENC = scene.get('dem') or {'off': 20, 'scale': 100}
LO = -ENC['off'] + 0.01
def load(name):
    a = np.asarray(Image.open(f'{root}/{name}').convert('RGB')).astype(np.float64)
    return (a[..., 0] * 256 + a[..., 1]) / ENC['scale'] - ENC['off']
def save(h, name):
    v = np.clip(np.round((h + ENC['off']) * ENC['scale']), 0, 65535).astype(np.uint32)
    rgb = np.zeros(h.shape + (3,), np.uint8); rgb[..., 0] = v >> 8; rgb[..., 1] = v & 255
    Image.fromarray(rgb).save(f'{root}/{name}', optimize=True)

REAL = scene['credit'].startswith('Imagery')
def photo(name, n):
    return np.asarray(Image.open(f'{root}/{name}').convert('RGB').resize((n, n), Image.BOX)).astype(np.float64)

def fix(h, half, sea_min_px, img):
    n = h.shape[0]
    raw = h + base
    # A tile that didn't load reads as a deep hole: fill from the nearest good ground.
    bad = raw < -150
    if ENC['off'] > 20: bad |= h <= LO  # a void in the survey, clipped
    # Spikes (survey artefacts): far off their neighbours' median.
    med = ndimage.median_filter(h, size=5)
    bad |= np.abs(h - med) > max(60, 1.5 * 2 * half / (n - 1))
    if bad.any():
        idx = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
        h = h[tuple(idx)]; raw = h + base
    low = raw <= 0.3
    lab, k = ndimage.label(low)
    keep = np.zeros(k + 1, bool)
    if k:
        sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, k + 1))
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
        for i in range(1, k + 1):
            if i in edge or sizes[i - 1] >= sea_min_px: keep[i] = True
    sea = keep[lab]
    # Fringes of the sea a pixel or two across are noise; the mapped water is kept as drawn.
    water = ndimage.binary_opening(sea, iterations=1) | raster(outers + [LAKE], inners, n, half)
    raised = ~water & (h < CUT + 0.2)
    if REAL:
        # Ground the survey has at water level that the photo shows as open water (dark, not green):
        # unmapped ponds and wetlands. Only whole patches, not a tree's shadow.
        c = photo(img, n); r, g, b = c[..., 0], c[..., 1], c[..., 2]
        lum = 0.3 * r + 0.59 * g + 0.11 * b
        pw = raised & (lum < 80) & (b >= r - 4) & (g - b < 10)
        lab, k = ndimage.label(pw)
        if k:
            sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, k + 1))
            big = np.concatenate([[False], sizes >= max(12, 3000 / (2 * half / (n - 1)) ** 2)])
            water |= big[lab]
            raised &= ~water
    out = h.copy()
    out[water] = np.minimum(out[water], CUT - 0.8)
    # Raised ground (islands, flats the survey had at water level) gets a little relief from the shore in.
    dist = ndimage.distance_transform_edt(~water) * (2 * half / (n - 1))
    lift = CUT + 0.25 + np.minimum(2.0, dist * 0.04)
    out[~water] = np.maximum(out[~water], np.where(raised, lift, CUT + 0.25)[~water])
    return out, water, int(bad.sum()), raised

hN = load('dem-near.png'); hW = load('dem-wide.png')
nN, nW = hN.shape[0], hW.shape[0]
hN2, wN, badN, rN = fix(hN, NEAR, int(300000 / (2 * NEAR / (nN - 1)) ** 2), 'near.webp')
hW2, wW, badW, rW = fix(hW, WIDE, int(2000000 / (2 * WIDE / (nW - 1)) ** 2), 'wide.webp')
save(hN2, 'dem-near.png'); save(hW2, 'dem-wide.png')

def sampler(f, half):
    n = f.shape[0]
    def s(x, y):
        fx = (x + half) / (2 * half) * (n - 1); fy = (half - y) / (2 * half) * (n - 1)
        i = int(min(n - 2, max(0, np.floor(fx)))); j = int(min(n - 2, max(0, np.floor(fy))))
        u = min(1, max(0, fx - i)); v = min(1, max(0, fy - j))
        return f[j, i] * (1 - u) * (1 - v) + f[j, i + 1] * u * (1 - v) + f[j + 1, i] * (1 - u) * v + f[j + 1, i + 1] * u * v
    return s
sN, sW = sampler(hN2, NEAR), sampler(hW2, WIDE)
H = lambda x, y: sN(x, y) if abs(x) < NEAR and abs(y) < NEAR else sW(x, y)
wet = lambda x, y: H(x, y) < CUT

# Houses, buildings, roads, power, masts: re-seat; drop what now stands in the water.
n0 = len(scene['houses'])
scene['houses'] = [h[:2] + [round(H(h[0], h[1]), 1)] + h[3:] for h in scene['houses'] if not wet(h[0], h[1])]
bl = []
for b in scene['blds']:
    p = [(b['p'][i], b['p'][i + 1]) for i in range(0, len(b['p']), 2)]
    cx = sum(q[0] for q in p) / len(p); cy = sum(q[1] for q in p) / len(p)
    if wet(cx, cy) and b['h'] < 30: continue
    b['z'] = round(min(max(H(*q), CUT + 0.25) for q in p), 1); bl.append(b)
scene['blds'] = bl
# Bridges: the bake called a road a bridge where it crossed the uncorrected water. Keep those that cross
# the corrected water and are more than a culvert; give each a deck over the water, ramped at the ends.
bridges, deck_at = [], {}
for b in scene['bridges']:
    p = b['p']; q = [(p[i], p[i + 1]) for i in range(0, len(p), 3)]
    cum = [0.0]
    for i in range(1, len(q)): cum.append(cum[-1] + math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]))
    L = cum[-1]
    if L < 15 or not any(wet(*pt) for pt in q[1:-1] or q): continue
    g0, g1 = max(H(*q[0]), CUT + 0.25), max(H(*q[-1]), CUT + 0.25)
    deck = max(g0, g1, CUT + 5.5) + min(6, 0.006 * L)
    ramp = min(70, L / 3)
    zs = []
    for i, pt in enumerate(q):
        e = min(cum[i], L - cum[i]); k = min(1, e / ramp); k = k * k * (3 - 2 * k)
        g = max(H(*pt), CUT + 0.25)
        zs.append(round(max(g + 0.5, g + (deck - g) * k), 1))
    b['p'] = [v for pt, z in zip(q, zs) for v in (pt[0], pt[1], z)]
    for pt, z in zip(q, zs): deck_at[(round(pt[0]), round(pt[1]))] = z
    bridges.append(b)
scene['bridges'] = bridges
for r in scene['roads']:
    p = r['p']
    for i in range(0, len(p), 3):
        key = (round(p[i]), round(p[i + 1]))
        p[i + 2] = round(deck_at[key] + 0.1, 1) if key in deck_at else round(max(H(p[i], p[i + 1]), CUT + 0.25) + 0.15, 1)
for line in scene['power']:
    for i in range(0, len(line), 3): line[i + 2] = round(max(0, H(line[i], line[i + 1])), 1)
scene['masts'] = [m[:2] + [round(H(m[0], m[1]), 1)] + m[3:] for m in scene['masts']]

# Trees. With a real photo, every tree is planted from it on the corrected ground (the bake's own pass ran
# on the uncorrected survey, and for some states on a photo that wasn't yet registered properly). The
# drawn-map venue keeps its mapped trees, less those now standing in the water.
keep, dropped, added = [], 0, 0
rng = np.random.default_rng(7)
# Some photos (Tasmania's) have a cool cast that leaves the bush grey-blue, not green: there any dark
# ground is bush, and its trees take a eucalypt green of the same lightness.
DARK = ven in ('risdon',)
def tree(x, y, h, kind, c):
    if DARK:
        l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
        c = (l * 0.9, l * 1.05, l * 0.8)
    g = H(x, y)
    if g < CUT + 0.2: return False
    keep.append(struct.pack('<hhhBBBBBx', int(round(x)), int(round(y)), int(round(g * 10)), min(255, int(round(h * 4))), kind,
                            int(c[0]), int(c[1]), int(c[2])))
    return True
if REAL:
    ph = np.asarray(Image.open(f'{root}/near.webp').convert('RGB')).astype(np.float64); NI = ph.shape[0]
    mpp = NI / (2 * NEAR)
    # Not on buildings, houses or the main roads.
    mk = Image.new('L', (NI, NI), 0); md = ImageDraw.Draw(mk)
    PP = lambda x, y: ((x + NEAR) * mpp, (NEAR - y) * mpp)
    for b in scene['blds']:
        q = [PP(b['p'][i], b['p'][i + 1]) for i in range(0, len(b['p']), 2)]
        if len(q) > 2: md.polygon(q, fill=255)
    for hs in scene['houses']:
        x, y, yaw, w, d = hs[0], hs[1], math.radians(hs[3]), hs[4] / 2 + 1.5, hs[5] / 2 + 1.5
        c, s = math.cos(yaw), math.sin(yaw)
        md.polygon([PP(x + a * c + b * s, y - a * s + b * c) for a, b in ((-w, -d), (w, -d), (w, d), (-w, d))], fill=255)
    for r in scene['roads']:
        q = [PP(r['p'][i], r['p'][i + 1]) for i in range(0, len(r['p']), 3)]
        md.line(q, fill=255, width=max(1, int(11 * mpp)))
    mask = np.asarray(mk) > 128
    R_, G_, B_ = ph[..., 0], ph[..., 1], ph[..., 2]
    lum = 0.3 * R_ + 0.59 * G_ + 0.11 * B_
    isT = (((G_ >= R_ - 3) & (G_ > B_ + 3) & (lum < 112)) | (DARK & (lum < 92))) & (lum > 16) & ~mask
    for cell in (3, 4):
        m = NI // cell
        blk = isT[:m * cell, :m * cell].reshape(m, cell, m, cell)
        cnt = blk.sum(axis=(1, 3))
        jj, ii = np.nonzero(cnt >= cell * cell * 0.45)
        for j, i in zip(jj, ii):
            x = -NEAR + (i * cell + cell / 2) / mpp; y = NEAR - (j * cell + cell / 2) / mpp
            if (math.hypot(x, y) < 1600) != (cell == 3): continue
            sub = isT[j * cell:(j + 1) * cell, i * cell:(i + 1) * cell]
            cols = ph[j * cell:(j + 1) * cell, i * cell:(i + 1) * cell][sub]
            l = cols.sum(axis=1); k = int(np.argmin(l))
            sj, si = np.argwhere(sub)[k]
            tx = -NEAR + (i * cell + si + rng.random()) / mpp; ty = NEAR - (j * cell + sj + rng.random()) / mpp
            pj, pi = j * cell + sj, i * cell + si
            c = ph[max(0, pj - 1):pj + 2, max(0, pi - 1):pi + 2].reshape(-1, 3).mean(axis=0)
            full = cnt[j, i] == cell * cell
            if tree(tx, ty, 9 + rng.random() * 11 + (3 if full else 0), int(rng.integers(0, 4)), c): added += 1
    # The far country: clumps from the wide photo, out to 9 km.
    pw = np.asarray(Image.open(f'{root}/wide.webp').convert('RGB')).astype(np.float64); NW_ = pw.shape[0]
    fm = NW_ / (2 * WIDE)
    r, g, b = pw[..., 0], pw[..., 1], pw[..., 2]; lw = 0.3 * r + 0.59 * g + 0.11 * b
    tW = (((g >= r - 3) & (g > b + 3) & (lw < 112)) | (DARK & (lw < 92))) & (lw > 16)
    m = NW_ // 3
    cnt = tW[:m * 3, :m * 3].reshape(m, 3, m, 3).sum(axis=(1, 3))
    for j, i in zip(*np.nonzero(cnt >= 4)):
        x = -WIDE + (i * 3 + 1.5) / fm; y = WIDE - (j * 3 + 1.5) / fm
        if abs(x) < NEAR - 40 and abs(y) < NEAR - 40: continue
        if math.hypot(x, y) > 9000: continue
        sub = tW[j * 3:j * 3 + 3, i * 3:i * 3 + 3]
        c = pw[j * 3:j * 3 + 3, i * 3:i * 3 + 3][sub].mean(axis=0)
        if tree(x + (rng.random() - 0.5) * 40, y + (rng.random() - 0.5) * 40, 16 + rng.random() * 10, 4, c): added += 1
else:
    tb = open(f'{root}/trees.bin', 'rb').read()
    for o in range(0, len(tb) - 11, 12):
        x, y, z10 = struct.unpack_from('<hhh', tb, o)
        g = H(x, y)
        if g < CUT + 0.2: dropped += 1; continue
        rec = bytearray(tb[o:o + 12]); struct.pack_into('<h', rec, 4, int(round(g * 10)))
        keep.append(bytes(rec))
# A phone draws every one of these: past 90,000, thin the far country first.
CAP = 90000
if len(keep) > CAP:
    far = [i for i, t in enumerate(keep) if t[7] == 4]
    rng.shuffle(far)
    drop = set(far[:len(keep) - CAP])
    keep = [t for i, t in enumerate(keep) if i not in drop]
    if len(keep) > CAP:
        idx = rng.choice(len(keep), CAP, replace=False); keep = [keep[i] for i in sorted(idx)]
open(f'{root}/trees.bin', 'wb').write(b''.join(keep))

scene['trees'] = len(keep)
json.dump(scene, open(f'{root}/scene.json', 'w'), separators=(',', ':'))
print(ven, 'base', base, 'filled', badN, badW, 'water% near', round(wN.mean() * 100, 1), 'wide', round(wW.mean() * 100, 1),
      'trees', len(keep), '-', dropped, '+', added, 'bridges', len(bridges), 'houses', n0, '->', len(scene['houses']), 'blds', len(bl))
