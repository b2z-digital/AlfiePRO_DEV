# Venue scenery (3D)

The bank view can show a venue's real country in 3D: the terrain under the aerial photo, trees, houses,
roads with traffic, jetties, moored boats, power lines and the landmarks people know the place by. It's
one layer over the water (src/components/race-simulator/scenery3d); the water, the boats and the racing
are untouched. Venues without it keep the drawn scenery.

## Adding or rebaking a venue

1. Add the venue to `VENUES` in `bake.js`: its origin (the venue's saved location, as in
   `src/sim/venues/<id>.ts`), any marinas, and its **landmarks**: what locals know it by. Kinds:
   - `pines`: a row of tall Norfolk Island pines along a shore, between two points.
   - `club`: a sailing club's shed, boat park (dinghies with masts up) and flagpole.
   - `sculpture`: a tall slender sculpture with a vane on top.
   - `flag`: a flagpole.
   Also per venue: `marinas` (boats moored along the jetties inside a circle), `bridges` (road bridges
   over the water, matched by road name: the deck's height, and `truss` for an old steel through truss
   on the carriageway running that way), and `water` for tidal water, where the survey caught the
   water's surface above zero (Kogarah Bay: 0.75 m). Check a new venue's water level by sampling
   `dem-near.png` inside the venue's lake polygon.
2. Open any https page in a browser, paste `bake.js` into the console, then run `await bake('<id>')`
   and `await saveAll()`. It takes a minute or two.
3. Put the six files in `public/sim-venues/<id>/`: `scene.json`, `trees.bin`, `near.webp`,
   `wide.webp`, `dem-near.png`, `dem-wide.png` (about 3.5 MB in all).
4. Outside NSW, run the finishing pass (below) on the folder.
5. Register the folder in `SCENERY` in `src/components/race-simulator/scenery3d/host.ts`.

## Outside NSW: the finishing pass

The only open elevation outside NSW is SRTM (via the AWS terrain tiles): about 30 m, and it reads
mangroves, tidal flats and noise as land and pocks real land with holes below the water line. So the
land/water split is decided again, from better evidence, by `fixwater.py`:

- Water is the sim's own water (the venue's `LAKE`), OpenStreetMap's water areas, the sea (ground at or
  below sea level joined to the edge of the box, or big), and patches the survey has at water level that
  the photo shows as open water. Everything else is land, at least a little above the water line, with
  some relief inland from the shore so islands aren't pancakes.
- Survey voids and spikes are filled from the nearest good ground.
- Trees are planted afresh from the photo on the corrected ground (not on buildings, houses or main
  roads), capped at 90,000 for phones (the far country thins first). Houses, buildings, roads, power
  lines and masts are re-seated on it; bridges are kept only where they cross the corrected water and
  get a deck over it.

Get the water areas from Overpass in the same browser (bbox = the venue's wide box, as
`south,west,north,east`), keeping each way's or relation member's points as local metres:

```
[out:json];(way["natural"="water"](bbox);relation["natural"="water"](bbox);way["waterway"="riverbank"](bbox);
relation["waterway"="riverbank"](bbox);way["landuse"="reservoir"](bbox);way["landuse"="basin"](bbox);
way["natural"="wetland"]["wetland"="mangrove"](bbox););out geom;
```

saved as `{"<id>": [{"o": 1 outer / 0 inner, "m": 1 if mangrove, "w": 1 if a relation member, "p": [x, y, ...]}]}`.
Then `python3 fixwater.py <id> public/sim-venues/<id> water.json`. Tasmania's photo has a cool cast:
`python3 tone.py <dir>` warms it (and `fixwater.py` treats any dark ground there as bush).

Water levels and heights: the bake takes the survey's height out on the water (`waterPts`) as zero and
stores it as `base`; a venue high above the sea or under a mountain gets its heights packed wider
(`scene.dem`). Tidal or noisy water gets a higher cut (`water`, default 0.6 m outside NSW).

## Sources (all open)

- Aerial imagery and 5 m elevation: NSW Spatial Services (`NSW_Imagery`, `NSW_5M_Elevation`).
  © Spatial Services, Department of Customer Service NSW.
- Imagery elsewhere: Queensland (State of Queensland, latest state program), Victoria (Vicmap aerial
  WMTS), Western Australia (Landgate SLIP), Tasmania (theLIST orthophoto), New Zealand (Bay of Plenty
  Regional Council). South Australia has no open aerial service, so its ground is drawn from the
  OpenStreetMap land use instead. ArcGIS services are asked for in Web Mercator and resampled (asked
  for in lat/lon, they stretch each tile).
- Elevation elsewhere: Terrain Tiles (Mapzen, on AWS): SRTM and others, about 30 m.
- Houses: NSW Geocoded Addressing, one house per address, turned to face its street. Elsewhere, along
  the residential streets where the photo shows building.
- Roads, buildings, jetties, power lines, masts: OpenStreetMap (the editing API's map calls).
  © OpenStreetMap contributors, ODbL.
- Trees: placed where the aerial photo is tree-green, coloured from it.

The credit line in the bank view shows these while the scenery is on screen.

## Turning it off

`?scenery=off` on the URL, or `localStorage['alfie.sim.scenery3d'] = 'off'`, keeps the drawn scenery.
A device without WebGL, or a failure while loading or drawing, falls back to it automatically.
