"""The real waters added for the Circuit and the world's races (12 Nov 2026): each club's racing water,
from its own pages or a notice of race, built from OpenStreetMap by src/sim/venueBuild.ts. The winds
are a first reading from the local climate, for each club to put right in its own words."""

def head(text, extract_note):
    return ['// ' + l for l in (text + ' Map data © OpenStreetMap contributors, under the Open Database Licence (ODbL):'
            ' https://www.openstreetmap.org/copyright. ' + extract_note).split('\n')]

def wrap(s, width=100):
    out, line = [], ''
    for w in s.split(' '):
        if len(line) + len(w) + 1 > width - 3:
            out.append(line); line = w
        else:
            line = (line + ' ' + w).strip()
    if line: out.append(line)
    return out

def heading(lines):
    return ['// ' + l for l in wrap(' '.join(lines))]

REAL = {
    'paradise': dict(
        const='PARADISE', name='Paradise RYC', short='Emerald Lakes', place='Emerald Lakes, Carrara, Gold Coast',
        lat=-28.0203876, lon=153.3785188, usual=(135, 'SE trade wind'), cut=900, region='QLD', region_name='Queensland',
        head=heading(["Paradise Radio Yacht Club's sailing water: Emerald Lakes, Carrara QLD, an estuarine lake fed from the",
                      'Nerang River. Map data © OpenStreetMap contributors, under the Open Database Licence (ODbL):',
                      'https://www.openstreetmap.org/copyright. The water is Emerald Lakes (relation 2816269), cut to 900 m',
                      "round where the skippers stand on the south shore by Nielsens Road; the rest is the mapped bank near",
                      "it. Metres from that point (-28.0203876, 153.3785188): x east, y north. Built by",
                      'src/sim/venueBuild.ts from the Overpass extract of 12 Nov 2026; edit with care.']),
        control_note='  // The control area: the south shore, between Nielsens Road and the lake, 1.5 m back from the water.',
        look=(0.15, 0.6, 1),
        traits=dict(
            about='Emerald Lakes at Carrara on the Gold Coast: open water between two wooded islands, with the canal homes of Emerald Island Drive round it. You stand on the south shore and race north across the lake.',
            winds=[
                dict(frm=135, name='SE trade wind', when='Most of the year', character='steady',
                     note='Across the lake from your right, steady and even. A boat-speed day: clear air off the line decides it.'),
                dict(frm=45, name='NE sea breeze', when='Summer afternoons', character='oscillating',
                     note='In off the coast over the houses opposite. Regular shifts: tack on the headers.'),
                dict(frm=260, name='Westerly', when='Winter', character='puffy', pays='out',
                     note='Down off the hinterland and over the trees. Gusty and shifty near the islands.'),
            ],
            notes=['The two islands bend the wind round them: watch for lifts off their ends.',
                   'Houses line most of the shore, so winds from the north and east arrive broken up.'],
        ),
    ),

    'kawana': dict(
        const='KAWANA', name='Sunshine Coast RSC', short='Lake Kawana', place='Lake Kawana, Bokarina, Sunshine Coast',
        lat=-26.7431627, lon=153.1240768, usual=(135, 'SE trade wind'), cut=900, region='QLD', region_name='Queensland',
        head=heading(["Sunshine Coast Radio Sailing Club's sailing water: Lake Kawana, Bokarina QLD (the 2024 SE Queensland",
                      'IOM Championships). Map data © OpenStreetMap contributors, under the Open Database Licence (ODbL):',
                      'https://www.openstreetmap.org/copyright. The water is Lake Kawana (relation 11018636), cut to 900 m',
                      'round where the skippers stand on the west shore of Entrance Island; the rest is the mapped bank',
                      'near it. Metres from that point (-26.7431627, 153.1240768): x east, y north. Built by',
                      'src/sim/venueBuild.ts from the Overpass extract of 12 Nov 2026; edit with care.']),
        control_note='  // The control area: the west shore of Entrance Island, 1.5 m back from the water.',
        look=(0.1, 0.5, 1),
        traits=dict(
            about='Lake Kawana on the Sunshine Coast: a long lake between Birtinya and Bokarina, close to the sea. You stand on Entrance Island and race west over the main body of the lake.',
            winds=[
                dict(frm=135, name='SE trade wind', when='Most of the year', character='steady',
                     note='Down the length of the lake from the south-east. Steady, with long beats.'),
                dict(frm=60, name='NE sea breeze', when='Summer afternoons', character='oscillating', pays='out',
                     note='In off the beach behind you, over the island. Lighter under the bank, with regular shifts further out.'),
                dict(frm=240, name='South-westerly', when='Winter', character='puffy',
                     note='Across the lake from Birtinya. Gusty off the buildings opposite.'),
            ],
            notes=['The lake is long and narrow from north to south: winds along it give the longest beats.',
                   'The sea is only a kilometre away, so the sea breeze fills in most summer afternoons.'],
        ),
    ),
    'lillydale': dict(
        const='LILLYDALE', name='Lilydale RYC', short='Lillydale Lake', place='Lillydale Lake, Lilydale, Melbourne',
        lat=-37.7662587, lon=145.355084, usual=(350, 'Northerly'), cut=700, region='VIC', region_name='Victoria',
        head=heading(["Lilydale Radio Yacht Club's sailing water: Lillydale Lake, Lilydale VIC. Map data © OpenStreetMap",
                      'contributors, under the Open Database Licence (ODbL): https://www.openstreetmap.org/copyright. The',
                      'water is Lillydale Lake (relation 13758513), cut to 700 m round where the skippers stand on the east',
                      'shore by the park; the rest is the mapped bank near it. Metres from that point (-37.7662587,',
                      '145.355084): x east, y north. Built by src/sim/venueBuild.ts from the Overpass extract of 12 Nov',
                      '2026; edit with care.']),
        control_note='  // The control area: the east shore beside the park and its jetty, 1.5 m back from the water.',
        look=(0.8, 1, 0.4),
        traits=dict(
            about='Lillydale Lake in the outer east of Melbourne: a parkland lake with two wooded islands, under the hills of the Yarra Valley. You stand on the east shore and race west across the lake.',
            winds=[
                dict(frm=350, name='Northerly', when='Hot days', character='puffy',
                     note='Down off the hills behind Lilydale. Gusty, and it swings as it comes past the islands.'),
                dict(frm=210, name='South-westerly', when='After a change', character='oscillating', pays='out',
                     note='The cool change, across the lake from the wetlands. Fresh at first, with steady swings.'),
                dict(frm=290, name='Westerly', when='Winter', character='puffy',
                     note='Over the trees on the far shore: holes and gusts close to the islands.'),
            ],
            notes=['The two islands block the wind behind them: keep clear of their shadows.',
                   'Hills to the north and east make the breeze gusty from those directions.'],
        ),
    ),

    'jackadder': dict(
        const='JACKADDER', name='Perth Radio Sailing Club', short='Jackadder Lake', place='Jackadder Lake, Woodlands, Perth',
        lat=-31.908571, lon=115.7941966, usual=(225, 'SW sea breeze'), cut=500, region='WA', region_name='Western Australia',
        head=heading(["Perth Radio Sailing Club's sailing water: Jackadder Lake in Jackadder Reserve, Woodlands WA. Map data",
                      '© OpenStreetMap contributors, under the Open Database Licence (ODbL):',
                      'https://www.openstreetmap.org/copyright. The water is Jackadder Lake, cut to 500 m round where the',
                      'skippers stand on the south shore by the car park; the rest is the mapped bank near it. Metres from',
                      'that point (-31.908571, 115.7941966): x east, y north. Built by src/sim/venueBuild.ts from the',
                      'Overpass extract of 12 Nov 2026; edit with care.']),
        control_note='  // The control area: the south shore by the car park, 1.5 m back from the water.',
        look=(0, 0.6, 1),
        traits=dict(
            about='Jackadder Lake in the suburbs of north-west Perth: a small, round parkland lake with a wooded island off its east shore. You stand on the south shore and race north across it.',
            winds=[
                dict(frm=225, name='SW sea breeze', when='Summer afternoons', character='steady',
                     note='The Fremantle Doctor, in off the ocean over the houses to your left. Fills in strong and holds all afternoon.'),
                dict(frm=90, name='Easterly', when='Summer mornings', character='puffy', pays='out',
                     note='Off the land, across the lake from the island. Patchy, and it fades as the sea breeze comes.'),
                dict(frm=315, name='North-westerly', when='Winter', character='puffy',
                     note='Ahead of a front, over the far shore. Gusty and shifty.'),
            ],
            notes=['The lake is small: short legs, busy marks and a lot of manoeuvres.',
                   'Watch the island: it blocks the breeze behind it in an easterly.'],
        ),
    ),
    'risdon': dict(
        const='RISDON', name='Risdon Brook RYC', short='Risdon Brook', place='Risdon Brook Dam, Hobart',
        lat=-42.8006234, lon=147.3316791, usual=(315, 'North-westerly'), cut=900, region='TAS', region_name='Tasmania',
        head=heading(["Risdon Brook Radio Yacht Club's sailing water: the Risdon Brook reservoir, north of Hobart TAS. Map",
                      'data © OpenStreetMap contributors, under the Open Database Licence (ODbL):',
                      'https://www.openstreetmap.org/copyright. The water is the Risdon Brook Reservoir, cut to 900 m',
                      'round where the skippers stand on its west shore; the rest is the mapped bank near it. Metres from',
                      'that point (-42.8006234, 147.3316791): x east, y north. Built by src/sim/venueBuild.ts from the',
                      'Overpass extract of 12 Nov 2026; edit with care.']),
        control_note='  // The control area: the west shore, 1.5 m back from the water.',
        look=(1, 1, 0),
        traits=dict(
            about='The Risdon Brook reservoir in the hills north of Hobart, ringed by bush. You stand on the west shore and race east across the dam.',
            winds=[
                dict(frm=315, name='North-westerly', when='Most of the year', character='puffy',
                     note='Down off the hills behind you. Strong and gusty, with big shifts as it comes over the trees.'),
                dict(frm=140, name='SE sea breeze', when='Summer afternoons', character='steady', pays='out',
                     note='Up from the Derwent across the dam. Cleaner and steadier the further out you go.'),
                dict(frm=200, name='Southerly', when='After a change', character='oscillating',
                     note='Cold and fresh, along the dam from the south. Regular swings.'),
            ],
            notes=['Bush comes right down to the water: expect holes and gusts close to the shore.',
                   'The dam sits in a valley, so winds bend to run along it.'],
        ),
    ),

    'victoria': dict(
        const='VICTORIA', name='Christchurch MYC', short='Victoria Lake', place='Victoria Lake, Hagley Park, Christchurch',
        lat=-43.5279701, lon=172.6222049, usual=(60, 'NE sea breeze'), cut=500, region='NZ', region_name='New Zealand',
        head=heading(["The Christchurch Model Yacht Club's sailing water: Victoria Lake in Hagley Park, Christchurch NZ,",
                      'sailed by the club for well over a century. Map data © OpenStreetMap contributors, under the Open',
                      'Database Licence (ODbL): https://www.openstreetmap.org/copyright. The water is Victoria Lake (way',
                      '4830823), with the park round it to 500 m; the skippers stand on the south shore by the clubhouse.',
                      'Metres from that point (-43.5279701, 172.6222049): x east, y north. Built by src/sim/venueBuild.ts',
                      'from the Overpass extract of 12 Nov 2026; edit with care.']),
        control_note="  // The control area: the south shore by the club's building, 1.5 m back from the water.",
        look=(0, 1, 0.3),
        traits=dict(
            about="Victoria Lake in Hagley Park, beside the Botanic Gardens: a small, shallow lake under big old trees, with the Christchurch Model Yacht Club's building on the south shore. You stand on the south shore and race north.",
            winds=[
                dict(frm=60, name='NE sea breeze', when='Summer afternoons', character='steady',
                     note="Christchurch's nor'easter, in over the park. Steady and dependable once it fills."),
                dict(frm=210, name='Southerly', when='After a change', character='puffy', pays='out',
                     note='Cold and gusty over the trees behind you. More breeze out in the middle.'),
                dict(frm=300, name="Nor'wester", when='Hot days', character='puffy',
                     note='Warm and gusty off the plains, through the trees on the far side. Big shifts.'),
            ],
            notes=['The lake is small: short legs and crowded marks.',
                   'Tall trees all round break up every wind: look for the gusts on the water.'],
        ),
    ),
    'gladstone': dict(
        const='GLADSTONE', name='Gladstone RSC', short='Gladstone Marina', place='Auckland Inlet, Gladstone Marina, Gladstone',
        lat=-23.8370047, lon=151.2479898, usual=(110, 'ESE trade wind'), cut=1100, region='QLD', region_name='Queensland',
        head=heading(["Gladstone Radio Sailing Club's water at Gladstone Marina, Gladstone QLD (the 2024 IOM World",
                      'Championship): Auckland Inlet off the harbour. Map data © OpenStreetMap contributors, under the Open',
                      'Database Licence (ODbL): https://www.openstreetmap.org/copyright. The water is Auckland Inlet and',
                      'the marina, cut to 1.1 km round where the skippers stand on its south shore; the rest is the mapped',
                      'shore near it. Metres from that point (-23.8370047, 151.2479898): x east, y north. Built by',
                      'src/sim/venueBuild.ts from the Overpass extract of 12 Nov 2026; edit with care.']),
        control_note='  // The control area: the south shore of Auckland Inlet, 1.5 m back from the water.',
        look=(0.4, 0.4, 0.8),
        traits=dict(
            about='Auckland Inlet at Gladstone Marina, opening onto Gladstone Harbour: open tidal water with Spinnaker Park and the East Shores parklands across it. You stand on the south shore and race north.',
            winds=[
                dict(frm=110, name='ESE trade wind', when='Most of the year', character='steady',
                     note='Across the harbour from the east, steady and fresh. The usual Gladstone breeze.'),
                dict(frm=30, name='NE sea breeze', when='Summer afternoons', character='oscillating',
                     note='In over Spinnaker Park. Regular shifts round the point.'),
                dict(frm=250, name='Westerly', when='Winter mornings', character='puffy', pays='out',
                     note='Off the town behind you. Gusty, and it can swing right round in a few minutes.'),
            ],
            notes=['Open harbour water: the breeze is usually stronger here than at a lake.',
                   'The wind can swing a long way in a hurry: watch the flags on the far shore.'],
        ),
    ),

    'patawalonga': dict(
        const='PATAWALONGA', name='Adelaide RCYRC', short='The Patawalonga', place='The Patawalonga, Glenelg North, Adelaide',
        lat=-34.9640355, lon=138.513059, usual=(225, 'SW sea breeze'), cut=900, region='SA', region_name='South Australia',
        head=heading(["Adelaide Radio Control Yacht Racing Club's sailing water: the Patawalonga, Glenelg North SA. Map data",
                      '© OpenStreetMap contributors, under the Open Database Licence (ODbL):',
                      'https://www.openstreetmap.org/copyright. The water is the Patawalonga, cut to 900 m round where the',
                      'skippers stand on its east bank at the end of Anderson Avenue; the rest is the mapped bank near it.',
                      'Metres from that point (-34.9640355, 138.513059): x east, y north. Built by src/sim/venueBuild.ts',
                      'from the Overpass extract of 12 Nov 2026; edit with care.']),
        control_note='  // The control area: the east bank at the end of Anderson Avenue, 1.5 m back from the water.',
        also_from=[(-10, 230)],
        also_note='  // The lake is narrow off Anderson Avenue: when a course won\'t fit there, the fleet sails from the west bank of the wider basin to the north.',
        look=(0, 0.6, 0.9),
        traits=dict(
            about='The Patawalonga at Glenelg North: a long, narrow lake running north and south behind the beach, with parkland along both banks. You stand on the east bank and race up and down the lake.',
            winds=[
                dict(frm=225, name='SW sea breeze', when='Summer afternoons', character='steady',
                     note='Off the gulf, over the dunes to the west. Fills in strong and stays all afternoon.'),
                dict(frm=10, name='Northerly', when='Hot days', character='puffy', pays='out',
                     note='Hot and gusty, down the length of the lake. Long beats with big puffs.'),
                dict(frm=280, name='Westerly', when='Winter', character='oscillating',
                     note='Across the lake from the beach side. Short beats and a lot of tacks.'),
            ],
            notes=['The lake is narrow off Anderson Avenue: winds across it give short beats and crowded starts, and big fleets move up to the wider basin to the north.',
                   'Winds along the lake give the best racing, with long beats.'],
        ),
    ),

    'taurikura': dict(
        const='TAURIKURA', name='Tauranga RSC', short='Lake Taurikura', place='Lake Taurikura, The Lakes, Tauranga',
        lat=-37.7465228, lon=176.1019942, usual=(45, 'NE sea breeze'), cut=500, region='NZ', region_name='New Zealand',
        head=heading(["Lake Taurikura, The Lakes, Tauranga, New Zealand. Map data",
                      '© OpenStreetMap contributors, under the Open Database Licence (ODbL):',
                      'https://www.openstreetmap.org/copyright. The water is the lake beside Taurikura Drive (unnamed on the',
                      'map), and the bank near it. Metres from the middle of its south-east bank (-37.7465228, 176.1019942):',
                      'x east, y north. Built by src/sim/venueBuild.ts from the Overpass extract of 12 Nov 2026; edit with care.']),
        control_note='  // The control area: the middle of the south-east bank, on the lakeside path, 1.5 m back from the water.',
        look=(0.5, 0.8, 0.6),
        traits=dict(
            about='Lake Taurikura in The Lakes, Tauranga: a small, sheltered lake running north-east to south-west, with a path all round and bush on the far bank. You stand on the south-east bank, halfway along.',
            winds=[
                dict(frm=45, name='NE sea breeze', when='Summer afternoons', character='steady',
                     note='In off the Bay of Plenty and down the length of the lake. The best racing here.'),
                dict(frm=225, name='South-westerly', when='Winter', character='puffy', pays='out',
                     note='Up the lake from the hills, gusty after it comes through the trees.'),
                dict(frm=290, name='Westerly', when='Fronts', character='oscillating',
                     note='Across the lake over the bush on the far bank: shifty and patchy close in.'),
            ],
            notes=['A small lake: courses are short, and winds across it give very short beats.',
                   'Trees on the far bank shadow the wind close in.'],
        ),
    ),
}
