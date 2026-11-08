# Test fixtures

## `basemap-z0.pmtiles` (#1786)

A 67 KB world extract (zoom 0 only) of the Protomaps v4 daily build of 2026-10-11, used by the basemap unit tests and the 375 px basemap smoke. Rebuild it with:

```bash
pmtiles extract https://build.protomaps.com/20261011.pmtiles basemap-z0.pmtiles --maxzoom=0
```

(Protomaps keeps daily builds for one week. Use any current `YYYYMMDD.pmtiles` build.)

Licence: map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License (ODbL). The tileset is a Produced Work of [Protomaps](https://github.com/protomaps/basemaps). It also contains Natural Earth data, which is public domain.

## CDN fixtures for the PR Preview shards (#2545)

The preview build reads `https://cdn-staging.taverns.red`. Staging was 73% of the project's CDN cache lookups, mostly previews and CI, so the PR Preview shards no longer read it live. Nothing here is committed except the manifest.

- `scripts/smoke-fixtures.manifest.json` names the objects the shards read: path templates with `{date}`, `{prev}`, `{ago14}`, `{yearEnd}`, `{monthEnd}`, `{py}`, `{pyCurrent}`, `{district}`, `{allDistrict}`, `{shard}` and `{region}`, resolved against the CDN's own dates. `optional` records a 404 as a 404. `copyFrom` serves a committed file instead (the basemap archive, `basemap-z0.pmtiles`, with range reads).
- The `preview` job runs `npx tsx scripts/refresh-smoke-fixtures.ts --out <dir>` once per run. It fetches each object, parses it with the reader schema the frontend uses, and fails with the path and the zod issue on drift, before any shard starts. It writes the objects and `_index.json` and uploads them as the `smoke-fixtures-*` artifact. Each shard downloads it and sets `SMOKE_FIXTURES_DIR`.
- `e2e/helpers/cdnFixtures.ts`, installed by the shared fixture in `fixtures/test.ts`, answers cdn-staging from that directory. A path with no fixture, or any response that came off the network, fails the test at teardown. With `SMOKE_FIXTURES_DIR` unset (the real-preview job's `staging.smoke.ts` and the wire-cost test, prod sweeps, local runs) nothing is intercepted and the CDN is read live.
- A spec that rewrites a CDN response uses `fixtureFetch(route)` where it would use `route.fetch()`, and `route.fallback()` where it would use `route.continue()`. `smokes-do-not-bypass-cdn-fixtures.test.ts` enforces it.

Debug a shard locally:

```bash
npx tsx scripts/refresh-smoke-fixtures.ts --out /tmp/fx
BASE_URL=http://127.0.0.1:4173 SMOKE_FIXTURES_DIR=/tmp/fx npx playwright test e2e/some.smoke.ts
```

A fixture miss names the path. Add it to the manifest. To find what a run requests, set `SMOKE_FIXTURES_RECORD_FILE=rec.txt` (it passes through to the live CDN and logs each path), then run `npx tsx scripts/smoke-fixtures-uncovered.ts rec.txt`.
