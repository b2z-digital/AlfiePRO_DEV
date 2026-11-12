// Perth Radio Sailing Club's sailing water: Jackadder Lake in Jackadder Reserve, Woodlands WA. Map
// data © OpenStreetMap contributors, under the Open Database Licence (ODbL):
// https://www.openstreetmap.org/copyright. The water is Jackadder Lake, cut to 500 m round where
// the skippers stand on the south shore by the car park; the rest is the mapped bank near it.
// Metres from that point (-31.908571, 115.7941966): x east, y north. Built by src/sim/venueBuild.ts
// from the Overpass extract of 12 Nov 2026; edit with care.
import type { VenueDef } from '../venue';
import { pts } from '../venue';

const LAKE = [-121.2,291,-191,200,-192,192,-195,112.8,-191,97.8,-189,84.3,-145.2,35.5,-119.7,23.5,-103.2,20.5,-85.2,14.5,-40.2,7,-38.7,8.5,-1.2,11.5,46.8,28,51.3,31,76.8,38.5,96.3,46,115,61.8,124,85.8,124,117.3,116.5,148.8,119.5,179,106,222,90.3,259,45.3,283,37.8,283,36.3,285,0.3,285,-1.2,286,-38.7,286,-40.2,288,-76.2,288,-77.7,289,-115.2,289];
const ISLAND0 = [84.3,156,92.5,130.8,92.5,123.3,88.8,112,75.3,113.5,61,138.3,62.5,148.8,73.8,157];

const FEATURES: [VenueDef["features"][number]["kind"], string, number[]][] = [
  ['path', '', [-114.7,-3.6,-96.6,2.1,-25.8,0,7,1.6,42.5,10.2,58.8,12,119.4,11.4,123.5,23,125.8,45,142.1,88.9,139.8,106.3,146.8,111.5,147.9,117.8,144.1,121.8]],
  ['road', 'Rosewood Avenue', [-140.3,-33.1,-24.2,-34.9,8.3,-42.9,208,-148,247,-171,261,-183]],
  ['parking', '', [-72.5,-13.8,-72,-0.7,-41.6,-2,-42.1,-15.1]],
  ['road', 'Rosewood Avenue', [244,-176,148.2,-124.1,3.1,-48.1,-18.6,-42.6,-58.4,-41.2,-106.3,-42.2,-125.2,-39.1,-139.1,-44.6]],
  ['road', '', [-45.4,-10.7,-70.4,-9.7]],
  ['path', '', [114.1,-116,-9.5,-50.4,-112.9,-49.8,-112.9,-44]],
  ['road', '', [-56.9,-34.3,-58,-10.2]],
  ['path', '', [-62.9,1.3,-63.5,-9.9]],
  ['bld', '', [82.8,-18.5,89.9,-6.4,96.9,-10.4,89.9,-22.5]],
  ['path', '', [-114.1,-31.2,-115.9,-19.8,-112.4,-12.9,-114.7,-3.6,-128.1,-6,-154,-0.2,-217,119,-205,148.5,-202,197]],
  ['path', '', [-112.9,-44,-114.1,-31.2]],
  ['path', '', [125.1,38.7,146.2,22.7,154,2.1,154,-14.1,159,-63,166,-71.2,174,-74.9]],
  ['park', '', [74.4,157,84.4,155,92.9,127.4,89.6,111.6,75.5,113.5,61.5,137.3,62.2,148.8]],
  ['road', '', [-137.8,-41.3,-141.7,-47.2,-147.7,-48.8,-154,-45.2,-156,-38.3,-153,-32.4,-145.1,-30.5,-139.2,-34.5,-137.8,-41.3]],
  ['road', 'Birchwood Avenue', [-139.5,-45.1,-137.1,-49.4,-135.9,-62.9]],
  ['road', 'Bentwood Avenue', [150,-240,19,-167,-19.1,-148.2,-49.9,-142.1,-92.1,-145,-96.2,-147]],
  ['road', 'Birchwood Avenue', [-160,-13.5,-146.5,-30.4]],
  ['road', 'Birchwood Avenue', [-156,-410,-154,-391,-95,-234,-91.8,-215,-92.3,-156,-135.9,-62.9]],
  ['road', 'Birchwood Avenue', [-135.9,-62.9,-147.7,-48.8]],
  ['road', 'Birchwood Avenue', [-155,-34.4,-160,-13.5]],
  ['road', 'Rosewood Avenue', [-535,16.3,-403,-32.1,-175,-38.2,-155,-34.8]],
  ['road', 'Rosewood Avenue', [-153,-46.1,-201,-41.2,-413,-37.9,-537,10]],
  ['road', 'Birchwood Avenue', [-160,-13.5,-243,159,-248,193,-246,220,-223,306]],
  ['road', 'Bentwood Avenue', [-484,-141.5,-203,-141.7,-126.8,-149.2,-98.2,-142.7]],
  ['parking', '', [167,90,173,89.9,170,-59,165,-58.9]],
  ['parking', '', [139.1,139.8,149.5,139.4,148.6,119.5,138.3,119.9]],
  ['road', 'Jackadder Way', [170,-89.2,176,-60.5,178,108.7,194,172,201,228]],
  ['road', '', [184,133.4,144.6,132.6,144.1,121.8]],
  ['road', 'Jackadder Way', [154,-111.9,170,-89.2]],
  ['road', 'Jackadder Way', [148.2,-124.1,154,-111.9]],
  ['road', 'Jackadder Way', [170,-89.2,161,-115.1]],
  ['road', 'Jackadder Way', [161,-115.1,154,-127.4]],
  ['road', 'Sandalwood Avenue', [-123.1,-592,-96.7,-505,-16.6,-298,62.4,-191]],
  ['road', 'Tamarisk Way', [-246,220,-325,220,-320,63.7,-198,64.6]],
  ['road', 'Willow Way', [273,111.7,178,108.7]],
  ['road', '', [-219,-14.3,-219,-34.4]],
  ['park', '', [-315,211,-255,211,-254,155,-213,70.4,-310,73.6]],
  ['road', 'Cedar Place', [-203,-141.7,-211,-301]],
  ['road', 'Woodlands Street', [200,-162,208,-148]],
  ['road', 'Woodlands Street', [197,-173,200,-162]],
  ['road', 'Woodlands Street', [214,-151,205,-166]],
  ['road', 'Woodlands Street', [197,-173,73.6,-348,-27.9,-599,-45.4,-630,-58.4,-679,-72.6,-690,-495,-685]],
  ['park', '', [213,-546,438,-345,487,-345,506,-354,511,-352,513,-130.8,509,-121.3,488,-127.7,485,-117.9,346,-220,365,-243,349,-256,330,-234,296,-263,428,-261,367,-340,311,-394,179,-511,149.8,-544,135.7,-545,55.9,-767,54.8,-779,61.7,-788,81.3,-794,74.4,-772,90.4,-729,116.2,-671,157,-608]],
  ['park', '', [634,263,683,454,693,537,632,550,644,536,653,514,655,478,647,478,647,438,642,400,636,399,614,282,603,270,570,270,515,93.8,489,71,500,10.4,498,-26.8,489,-54.2,495,-59.2,512,-57.8,512,-52.3,524,-51.2,541,-29.5,572,41.4,629,222,624,224]],
  ['park', 'Woodlands Reserve', [-328,-400,-487,-398,-487,-587,-334,-585,-331,-580]],
  ['park', '', [524,-91.8,524,-253,541,-306,546,-364,542,-402,545,-439,555,-459,581,-470,573,-454,574,-426,579,-411,603,-391,612,-353,608,-293,620,-250,638,-220,705,-137.4,737,-113.2,777,-101.1,863,-106.8,902,-114,918,-131,910,-167,886,-191,913,-220,919,-315,914,-323,904,-323,905,-341,923,-352,906,-372,907,-392,965,-404,984,-411,999,-424,1027,-418,1037,-408,1062,-399,1073,-386,1085,-337,1084,-289,1150,-200,985,-104.4,890,-63.5,827,-44.9,696,-38.3,593,-62.5,576,-71.6]],
  ['bridge', '', [587,158,570,163]],
];

export const JACKADDER: VenueDef = {
  id: 'jackadder',
  name: 'Perth Radio Sailing Club',
  short: 'Jackadder Lake',
  place: 'Jackadder Lake, Woodlands, Perth',
  lat: -31.908571, lon: 115.7941966,
  usualWind: 225, usualWindName: 'SW sea breeze',
  // The control area: the south shore by the car park, 1.5 m back from the water.
  control: [{ x: -19.9, y: 8.5 }, { x: 17.0, y: 16.2 }],
  water: pts(LAKE),
  islands: [pts(ISLAND0)],
  features: FEATURES.map(([kind, name, p]) => ({ kind, name: name || undefined, pts: pts(p) })),
  landmarks: [],
  credit: '© OpenStreetMap contributors',
  cut: 500,
  // Where it is, for the Circuit's seasons: Western Australia.
  region: 'WA',
  // The country round the water, for the bank view.
  look: { hills: 0, trees: 0.6, houses: 1 },
  // What the club knows about its water. A first reading from the map and the local climate, for the
  // club to put right in its own words.
  traits: {
    about: 'Jackadder Lake in the suburbs of north-west Perth: a small, round parkland lake with a wooded island off its east shore. You stand on the south shore and race north across it.',
    winds: [
      { from: 225, name: 'SW sea breeze', when: 'Summer afternoons', character: 'steady', note: 'The Fremantle Doctor, in off the ocean over the houses to your left. Fills in strong and holds all afternoon.' },
      { from: 90, name: 'Easterly', when: 'Summer mornings', character: 'puffy', pays: 'out', note: 'Off the land, across the lake from the island. Patchy, and it fades as the sea breeze comes.' },
      { from: 315, name: 'North-westerly', when: 'Winter', character: 'puffy', note: 'Ahead of a front, over the far shore. Gusty and shifty.' },
    ],
    notes: [
      'The lake is small: short legs, busy marks and a lot of manoeuvres.',
      'Watch the island: it blocks the breeze behind it in an easterly.',
    ],
  },
};
