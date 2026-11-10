"""Turn a venue's OpenStreetMap extract into the simulator's venue module (TypeScript).

    python3 -I make_venue.py <id> <extract.txt> <out.ts>

The extract is lines of `kind|name|x,y x,y ...` in metres from the club's saved location."""
import sys, re, json

VID, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

META = {
    'lmryc': dict(
        const='LMRYC', name='Lake Macquarie RYC', short='LMRYC · Booragul', place='Booragul foreshore, Lake Macquarie',
        lat=-32.9731483, lon=151.6152096, usual=(75, 'ENE sea breeze'),
        head=["// Lake Macquarie Radio Yacht Club's sailing water on the Booragul foreshore, First St, Booragul NSW.",
              '// Map data © OpenStreetMap contributors, under the Open Database Licence (ODbL):',
              '// https://www.openstreetmap.org/copyright. The lake is Lake Macquarie (relation 1319504), cut to',
              "// about 3 km round the club; the rest is the mapped foreshore near it. Metres from the club's saved",
              '// location (-32.9731483, 151.6152096): x east, y north. Generated from the extract; edit with care.'],
        control_note='  // The control area: the foreshore in front of the Teralba Amateur Sailing Club building, 1.5 m back from the water.',
        control=[(-29.4, 22.0), (8.2, 27.0)],
        landmarks=[('Speers Point Park', 565, 945)],
        clubs=['bafdff76-ebe7-4890-b7fa-20aa9bb37491'], venue_id='23ee6cc8-8da5-4b4b-b148-0ac5640bca76',
        traits=dict(
            about='The Booragul foreshore at the north-west corner of Lake Macquarie. You stand on the grass in front of the sailing club and race out over open lake.',
            winds=[
                dict(frm=75, name='ENE sea breeze', when='Summer afternoons', character='oscillating',
                     note='Comes in across the lake from Speers Point with clear water in front of you. Regular shifts: tack on the headers.'),
                dict(frm=180, name='Southerly', when='After a change', character='puffy', pays='out',
                     note='Off the land behind you. Gusty and shifty near the bank, steadier the further out you go.'),
                dict(frm=290, name='Westerly', when='Winter', character='puffy',
                     note='Down off the hills behind Booragul and along the foreshore. Hard gusts with holes between them.'),
            ],
            notes=['The lake is open to the north and east, so those winds arrive clean.',
                   'Winds with south or west in them come over the land and are gustier.'],
        ),
    ),
    'kbryc': dict(
        const='KBRYC', name='Kogarah Bay RYC', short='Kogarah Bay', place='Dover Park East, Blakehurst, on Kogarah Bay',
        lat=-33.995977, lon=151.1174658, usual=(50, 'NE sea breeze'), cut=1400,
        head=["// Kogarah Bay Radio Yacht Club's sailing water off Dover Park East, Blakehurst NSW, beside the",
              '// Kogarah Bay Sailing Club. Map data © OpenStreetMap contributors, under the Open Database Licence',
              '// (ODbL): https://www.openstreetmap.org/copyright. The water is Kogarah Bay (relation 1506344) and',
              '// the Georges River it opens into (relation 303326), cut to 1.4 km round the club; the rest is the',
              "// mapped foreshore near it. Metres from the club's saved location (-33.995977, 151.1174658): x east,",
              '// y north. Built by src/sim/venueBuild.ts from the Overpass extract of 11 Nov 2026; edit with care.'],
        control_note="  // The control area: the foreshore beside the sailing club's pontoon, 1.5 m back from the water.",
        look=(0.7, 0.9, 1),
        clubs=['f7cd9003-8b11-4580-8357-9f58e2ec45cd'], venue_id='4465a809-c406-44cb-9a7d-fac43b3548a6',
        traits=dict(
            about="The western shore of Kogarah Bay at Dover Park, beside the sailing club. You look east across the bay to Sans Souci, with Carss Park to your left and the Georges River away to your right.",
            winds=[
                dict(frm=50, name='NE sea breeze', when='Summer afternoons', character='oscillating',
                     note='Comes in across the bay with open water in front of you. Clean breeze with regular shifts.'),
                dict(frm=180, name='Southerly', when='After a change', character='puffy',
                     note='Up from the Georges River past Tom Uglys Point. Arrives hard and stays gusty.'),
                dict(frm=280, name='Westerly', when='Winter', character='puffy', pays='out',
                     note='Off Blakehurst behind you. Gusty and shifty, with holes under the bank: there is more breeze out in the bay.'),
            ],
            notes=['Winds with east in them cross the bay and arrive clean.',
                   'Westerlies come over the houses and the highway: expect big shifts close to the shore.'],
        ),
    ),
    'plrmyc': dict(
        const='PLRMYC', name='Patterson Lakes RMYC', short='Patterson Lakes', place='National Water Sports Centre, Bangholme, on the Patterson River',
        lat=-38.0561034, lon=145.1484613, usual=(215, 'SW sea breeze'), cut=900,
        head=["// Patterson Lakes Radio Model Yacht Club's sailing water: the Patterson River at the National Water",
              '// Sports Centre, Riverend Rd, Bangholme VIC. Map data © OpenStreetMap contributors, under the Open',
              '// Database Licence (ODbL): https://www.openstreetmap.org/copyright. The water is the Patterson River',
              '// and its rowing course (way 24835395), cut to 900 m round the club; the rest is the mapped bank',
              "// near it. Metres from the club's saved location (-38.0561034, 145.1484613): x east, y north.",
              '// Built by src/sim/venueBuild.ts from the Overpass extract of 11 Nov 2026; edit with care.'],
        control_note='  // The control area: the north bank in front of the Water Sports Centre building, 1.5 m back from the water.',
        look=(0, 0.3, 0.12),
        clubs=['abb46e7d-848f-430e-9017-7006cb41ed03'], venue_id='aceb93b9-bfa2-4b96-bfa2-b4f08ed054f4',
        traits=dict(
            about='The Patterson River at the National Water Sports Centre: a long, straight rowing course about 130 m wide, running south-west to north-east through flat, open country.',
            winds=[
                dict(frm=215, name='SW sea breeze', when='Summer afternoons', character='steady',
                     note='Off Port Phillip Bay and straight up the rowing course. Long beats with the bank close on both sides.'),
                dict(frm=350, name='Northerly', when='Hot days and winter', character='puffy', pays='out',
                     note='Across the course, off the bank you stand on. Gusty, with lighter air close in under the bank.'),
                dict(frm=250, name='Westerly', when='After a change', character='puffy',
                     note='Angles across the river from the freeway side. Shifty, and it bends along the banks.'),
            ],
            notes=['Flat and exposed: there is little to slow the wind, so it is often fresh.',
                   'The course is narrow. Across-the-river winds mean short legs and a lot of tacks.'],
        ),
    ),
}[VID]

PT = re.compile(r'-?\d+(\.\d+)?,-?\d+(\.\d+)?')
items, control, landmarks = [], None, None
for line in open(SRC):
    line = line.rstrip('\n')
    if not line.strip() or line.startswith('#'):
        continue
    if line.count('|') >= 2 and not PT.fullmatch(line.split(' ')[0]) and '||' in line or re.match(r'^[a-z]+\|[^|]*\|', line):
        kind, name, rest = line.split('|', 2)
        if kind == 'waterflat':
            v = [float(x) for x in rest.split(',')]
            items.append(('lake', '', list(zip(v[0::2], v[1::2]))))
        elif kind == 'control':
            control = [tuple(float(v) for v in p.split(',')) for p in rest.split(' ')]
        elif kind == 'landmarks':
            landmarks = [(a.split('@')[0], *[float(v) for v in a.split('@')[1].split(',')]) for a in rest.split(';') if a]
        elif kind == 'name':
            pass
        else:
            pts = [tuple(float(v) for v in p.split(',')) for p in rest.split(' ') if p]
            items.append(({'water': 'lake'}.get(kind, kind), name, pts))
    else:
        # The first extract's format: `kind|name x,y x,y ...`
        toks = line.strip().split(' ')
        k = next(i for i, tk in enumerate(toks) if PT.fullmatch(tk))
        kind, _, name = ' '.join(toks[:k]).partition('|')
        items.append((kind, name, [tuple(float(v) for v in p.split(',')) for p in toks[k:]]))


def ring_area(P):
    return 0.5 * sum(P[i - 1][0] * P[i][1] - P[i][0] * P[i - 1][1] for i in range(len(P)))


def num(v):
    s = f'{v:.1f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def flat(P):
    return '[' + ','.join(num(v) for x, y in P for v in (x, y)) + ']'


def q(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


lake = next(P for k, _, P in items if k == 'lake')
islands = [P for k, _, P in items if k == 'island']
# Water rings run anticlockwise (water on the left), islands clockwise, so the water side of every
# shore edge is to its left.
if ring_area(lake) < 0:
    lake = lake[::-1]
islands = [P if ring_area(P) < 0 else P[::-1] for P in islands]

KINDS = {'park', 'wood', 'sand', 'pier', 'road', 'bridge', 'path', 'bld', 'pitch', 'playground', 'parking', 'pond'}
feats = [(k, n, P) for k, n, P in items if k in KINDS]
control = META.get('control') or control
landmarks = META.get('landmarks') or [l for l in (landmarks or []) if l[0] != 'Horse Rock Point'][:5]
T = META['traits']

L = list(META['head'])
L.append("import type { VenueDef } from '../venue';")
L.append("import { pts } from '../venue';")
L.append('')
L.append(f'const LAKE = {flat(lake)};')
for i, P in enumerate(islands):
    L.append(f'const ISLAND{i} = {flat(P)};')
L.append('')
L.append('const FEATURES: [VenueDef["features"][number]["kind"], string, number[]][] = [')
for k, n, P in feats:
    L.append(f"  ['{k}', {q(n)}, {flat(P)}],")
L.append('];')
L.append('')
L.append(f"export const {META['const']}: VenueDef = {{")
L.append(f"  id: '{VID}',")
L.append(f"  name: {q(META['name'])},")
L.append(f"  short: {q(META['short'])},")
L.append(f"  place: {q(META['place'])},")
L.append(f"  lat: {META['lat']}, lon: {META['lon']},")
L.append(f"  usualWind: {META['usual'][0]}, usualWindName: {q(META['usual'][1])},")
L.append(META['control_note'])
L.append('  control: [' + ', '.join(f'{{ x: {x:.1f}, y: {y:.1f} }}' for x, y in control) + '],')
L.append('  water: pts(LAKE),')
L.append(f"  islands: [{', '.join(f'pts(ISLAND{i})' for i in range(len(islands)))}],")
L.append('  features: FEATURES.map(([kind, name, p]) => ({ kind, name: name || undefined, pts: pts(p) })),')
L.append('  landmarks: [' + ', '.join(f'{{ name: {q(n)}, at: {{ x: {num(x)}, y: {num(y)} }} }}' for n, x, y in landmarks) + '],')
L.append("  credit: '© OpenStreetMap contributors',")
if META.get('cut'):
    L.append(f"  cut: {META['cut']},")
L.append(f"  clubs: [{', '.join(q(c) for c in META['clubs'])}], venueId: {q(META['venue_id'])},")
if META.get('look'):
    h, t, o = META['look']
    L.append('  // The country round the water, for the bank view.')
    L.append(f'  look: {{ hills: {h}, trees: {t}, houses: {o} }},')
L.append('  // What the club knows about its water. A first reading from the map and the local climate, for the')
L.append('  // club to put right in its own words.')
L.append('  traits: {')
L.append(f"    about: {q(T['about'])},")
L.append('    winds: [')
for w in T['winds']:
    parts = [f"from: {w['frm']}", f"name: {q(w['name'])}", f"when: {q(w['when'])}", f"character: '{w['character']}'"]
    if w.get('pays'):
        parts.append(f"pays: '{w['pays']}'")
    parts.append(f"note: {q(w['note'])}")
    L.append('      { ' + ', '.join(parts) + ' },')
L.append('    ],')
L.append('    notes: [')
for n in T['notes']:
    L.append(f'      {q(n)},')
L.append('    ],')
L.append('  },')
L.append('};')
open(OUT, 'w').write('\n'.join(L) + '\n')
print(VID, 'lake', len(lake), 'islands', [len(P) for P in islands], 'features', len(feats), 'bytes', sum(len(l) + 1 for l in L))
