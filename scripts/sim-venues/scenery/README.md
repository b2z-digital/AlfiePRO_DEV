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
2. Open any https page in a browser, paste `bake.js` into the console, then run `await bake('<id>')`
   and `await saveAll()`. It takes a minute or two.
3. Put the six files in `public/sim-venues/<id>/`: `scene.json`, `trees.bin`, `near.webp`,
   `wide.webp`, `dem-near.png`, `dem-wide.png` (about 3.5 MB in all).
4. Register the folder in `SCENERY` in `src/components/race-simulator/scenery3d/host.ts`.

## Sources (all open)

- Aerial imagery and 5 m elevation: NSW Spatial Services (`NSW_Imagery`, `NSW_5M_Elevation`).
  © Spatial Services, Department of Customer Service NSW. Outside NSW, swap in that state's services.
- Houses: NSW Geocoded Addressing, one house per address, turned to face its street.
- Roads, buildings, jetties, power lines, masts: OpenStreetMap (the editing API's map calls).
  © OpenStreetMap contributors, ODbL.
- Trees: placed where the aerial photo is tree-green, coloured from it.

The credit line in the bank view shows these while the scenery is on screen.

## Turning it off

`?scenery=off` on the URL, or `localStorage['alfie.sim.scenery3d'] = 'off'`, keeps the drawn scenery.
A device without WebGL, or a failure while loading or drawing, falls back to it automatically.
