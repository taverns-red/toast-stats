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

- `scripts/smoke-fixtures.manifest.json` names the objects the shards read: path templates with `{date}`, `{prev}`, `{ago14}`, `{yearEnd}`, `{monthEnd}`, `{py}`, `{pyCurrent}`, `{district}`, `{allDistrict}`, `{shard}` and `{region}`, resolved against the CDN's own dates. A smoke that pins a date (`?date=YYYY-MM-DD`) needs that date written literally in the manifest (`snapshots/2026-10-24/...`), never only through a relative token, which moves with the latest snapshot (#2595; `smokeFixturesPinnedDates.test.ts` enforces it). `optional` records a 404 as a 404. `copyFrom` serves a committed file instead (the basemap archive, `basemap-z0.pmtiles`, with range reads).
- The `preview` job runs `npx tsx scripts/refresh-smoke-fixtures.ts --out <dir>` once per run. It fetches each object, parses it with the reader schema the frontend uses, and fails with the path and the zod issue on drift, before any shard starts. It writes the objects and `_index.json` and uploads them as the `smoke-fixtures-*` artifact. Each shard downloads it and sets `SMOKE_FIXTURES_DIR`.
- `e2e/helpers/cdnFixtures.ts`, installed by the shared fixture in `fixtures/test.ts`, answers cdn-staging from that directory. A path with no fixture, or any response that came off the network, fails the test at teardown. With `SMOKE_FIXTURES_DIR` unset (the real-preview job's `staging.smoke.ts` and the wire-cost test, prod sweeps, local runs) nothing is intercepted and the CDN is read live.
- A spec that rewrites a CDN response uses `fixtureFetch(route)` where it would use `route.fetch()`, and `route.fallback()` where it would use `route.continue()`. A helper that reads a CDN file itself uses `fixtureRequestGet(page, url)` in place of `page.request.get()`. A spec that needs a context of its own uses the `newFixtureContext` fixture in place of `browser.newContext()`, since a hand-made context never meets the auto fixture. `smokes-do-not-bypass-cdn-fixtures.test.ts` enforces all of it, for specs and for `e2e/helpers/*.ts`.
- `e2e/staging.smoke.ts` reads the deployed CDN live and runs only in the real-preview job. `PREVIEW_ONLY_SPECS` in `scripts/lib/smokeSpecCoverage.ts` keeps it out of the shards, and a shard that names it fails the coverage test.
- Not covered: `cdn.taverns.red` (prod) is still read live by the shards (the videos regexes in `howToVideos.ts`, the priority-columns relay), #2570. Only cdn-staging is intercepted, so "no request reaches staging" is the guarantee, not "no live CDN read".
- Objects with no schema rule are listed as unvalidated by the refresh step, and do not fail it; a new object type is not drift-checked until a rule is added.

Debug a shard locally:

```bash
npx tsx scripts/refresh-smoke-fixtures.ts --out /tmp/fx
BASE_URL=http://127.0.0.1:4173 SMOKE_FIXTURES_DIR=/tmp/fx npx playwright test e2e/some.smoke.ts
```

A fixture miss names the path. Add it to the manifest. To find what a run requests, set `SMOKE_FIXTURES_RECORD_FILE=rec.txt` (it passes through to the live CDN and logs each path), then run `npx tsx scripts/smoke-fixtures-uncovered.ts rec.txt`.

## Seeded cookie consent (#2584)

Toast Stats asks visitors to choose All, Minimal or None before it saves
anything or loads Google Analytics. A fresh browser has no `rt_consent` cookie,
so every page would open with the consent banner. The shared fixture
(`test.ts`) therefore seeds `rt_consent=v1.minimal` in every context by
default: the banner stays closed, preferences persist and GA does not load.
Override per file with `test.use({ consent: 'all' | 'minimal' | 'none' | 'unset' })`.
`ga-page-view.smoke.ts` uses `all`; `consent-banner.smoke.ts` uses `unset`.
