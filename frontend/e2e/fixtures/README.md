# Test fixtures

## `basemap-z0.pmtiles` (#1786)

A 67 KB world extract (zoom 0 only) of the Protomaps v4 daily build of 2026-10-11, used by the basemap unit tests and the 375 px basemap smoke. Rebuild it with:

```bash
pmtiles extract https://build.protomaps.com/20261011.pmtiles basemap-z0.pmtiles --maxzoom=0
```

(Protomaps keeps daily builds for one week. Use any current `YYYYMMDD.pmtiles` build.)

Licence: map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License (ODbL). The tileset is a Produced Work of [Protomaps](https://github.com/protomaps/basemaps). It also contains Natural Earth data, which is public domain.
