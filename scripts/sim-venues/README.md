# Simulator venues

The Race Simulator's built-in venues (`src/sim/venues/*.ts`) are generated from these extracts of
OpenStreetMap. Map data © OpenStreetMap contributors, under the Open Database Licence (ODbL):
https://www.openstreetmap.org/copyright.

- `<id>_osm.txt`: a venue's water, bank features, control area and landmarks, in metres from the
  club's saved location (x east, y north), one `kind|name|x,y x,y …` per line. Kogarah Bay and
  Patterson Lakes were built by `src/sim/venueBuild.ts` from an Overpass API answer (the query is
  `venueQuery()` in that file); LMRYC's is the first, hand-made extract.
- `make_venue.py`: turns an extract into the TypeScript module, with the venue's names, usual wind,
  the look of the country round it and what the club knows about its water (the `META` table).

To regenerate a venue after editing its extract or its entry in `META`:

    python3 -I scripts/sim-venues/make_venue.py kbryc scripts/sim-venues/kbryc_osm.txt src/sim/venues/kbryc.ts

The venues must be identical on every device (a live race lays its course on them), so they are
part of the app, not fetched.
