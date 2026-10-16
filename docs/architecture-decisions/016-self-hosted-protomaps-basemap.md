# ADR-016: Self-hosted Protomaps basemap, served by HTTP range requests from our bucket and Cloud CDN

- **Status:** Accepted (2026-10-12, Ron). Ron decided the tile source on 2026-10-11 (feature design §7.4). On 2026-10-12 he approved the rest: the world z0–10 extent, the runner-built upload workflow, and the map-route budget. **Amended 2026-10-15 (#2084, Ron): world z0–14**, live since the same day (D1).
- **Date:** 2026-10-12
- **Issue:** #1786 (epic #1781). Consumers: #1784 (district map), #1808 (region explorer), #1809 (world explorer). The land and water colours come from #1785 (`docs/design/map-pin-colour-modes.md` §6.3).
- **Evidence:** every number below was measured or read on 2026-10-12. The commands are in [the runbook](../runbooks/basemap.md) and the PR body.

## Context

The club maps (#1784, #1808, #1809) need a basemap. Ron ruled out OpenFreeMap and keyed providers. He chose a self-hosted **Protomaps PMTiles** archive on our own bucket and CDN, for three reasons:

- no API key;
- no third-party request from viewers' browsers;
- availability that we control.

The openstreetmap.org tile servers are excluded by their usage policy.

A PMTiles archive is a single file. A client reads a header, then directory and tile byte ranges, with HTTP `Range` requests. Hosting it is therefore a static-object problem on infrastructure we already run (ADR-007). It is not a tile server.

Constraints this decision has to satisfy:

1. **Landing-page budget.** Lighthouse CI fails above 500 KB of gzipped script (`lighthouserc.js`). `scripts/check-critical-path.ts` forbids route-only chunks on every route's critical path (#1830). The map must cost the landing page nothing.
2. **Mobile route budget.** #1784 sets the route's JS at ≤ 300 KB gzip including the renderer. It also set the first tile at ≤ 2 s on the throttled mobile profile; **#1943 re-baselined that target (Ron, 2026-10-13): the first basemap tile within about 4 s on the Android throttled profile** (Pixel 7 emulation, 150 ms RTT, 1.6 Mbps down, 4× CPU; measure with Android or real WebKit, never Chromium with an iPhone UA, which starts 3 MapLibre workers). The measured floor for any MapLibre-drawn tile on that profile is about 3.2 s: entry code 1.4 s, then the 232 KB `maplibre` chunk 1.2 s, then the 119 KB worker 0.6 s, all serial bandwidth. ≤ 2 s is not reachable with MapLibre at 1.6 Mbps. Instead, the map box paints a **static preview** of the district's clubs (inline SVG from coordinates the page already has, #1943) as soon as the data arrives, and cross-fades to the live map on its first idle. No CI check measures the first tile; the route's JS budget below is the enforced gate.
3. **Licence.** OpenStreetMap data is ODbL, and the credit must be visible wherever the map is shown, in both themes.
4. **CSP.** Previews and prod are served by Firebase Hosting with a strict CSP (`firebase.json`). It has `default-src 'self'`, `connect-src` limited to our two data origins, and no `worker-src`. Lesson 122 applies: only the deployed preview can prove the CSP.
5. **CDN behaviour.** The backend bucket `toast-stats-cdn-backend` has `compressionMode: AUTOMATIC`, `cacheMode: CACHE_ALL_STATIC`, `defaultTtl` 3600, `maxTtl` 86400 and `clientTtl` 3600 (`gcloud compute backend-buckets describe`, read-only). If compression or transcoding touched the archive, every "range" would turn into the whole multi-GB file.

## Decision

### D1. Basemap: a zoom-limited world extract of the Protomaps v4 daily build

- **Source.** Use a Protomaps v4 daily planet build, `https://build.protomaps.com/YYYYMMDD.pmtiles`. On 2026-10-11 it was 138,796,124,160 bytes, `accept-ranges: bytes`, and tileset `version 4.15.2`. Protomaps keeps daily builds for one week and discourages hotlinking: "copy the tileset to your own Cloud Storage" (docs.protomaps.com/basemaps/downloads).
- **Extent.** **World, zoom 0–10, one file, about 3.8 GB.** MapLibre over-zooms the z10 vector tiles beyond z10, so a viewer can zoom to street level over z10 geometry: coastlines, water, landuse, boundaries, and major and minor roads as generalised at z10. The options were measured with the official CLI (`pmtiles extract … --dry-run`, go-pmtiles 1.31.2, build 2026-10-11):

  | Option                                                                                                      | Archive    | Notes                                                                                                                                                                                                                             |
  | ----------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | World z0–6                                                                                                  | 45 MB      | Too coarse below country scale                                                                                                                                                                                                    |
  | World z0–8                                                                                                  | 558 MB     | A district fits at z7–8. Over-zoom to a city is blocky                                                                                                                                                                            |
  | World z0–9                                                                                                  | 1.6 GB     |                                                                                                                                                                                                                                   |
  | **World z0–10**                                                                                             | **3.8 GB** | **Recommended.** One file, one URL, worldwide parity                                                                                                                                                                              |
  | World z0–11                                                                                                 | 8.0 GB     |                                                                                                                                                                                                                                   |
  | World z0–12                                                                                                 | 18 GB      |                                                                                                                                                                                                                                   |
  | World z0–14                                                                                                 | 69 GB      | Planet z0–15 is 139 GB                                                                                                                                                                                                            |
  | Regional z0–12 or z0–14 (measured: D61 bbox 70 MB / 244 MB; India z0–12 681 MB; contiguous US z0–12 2.0 GB) | varies     | Clubs are in **158 countries + 342 unknown** (`global-totals.json`, 2026-10-11). Per-country extracts add up to most of the populated world. They also need a second source in the style, or `pmtiles merge` of disjoint archives |

- **Amended 2026-10-15 (#2084, Ron): world z0–14, about 69 GB.** Street names and POIs exist only at z12–14, so directors need z14 for street-level detail. Ron chose a z0–14 world file. He weighed it against a near-clubs merge: world z0–10 plus z11–14 over 8 km club buffers, measured at 1,984 boxes, 7.0 GB of extract and about 10.8 GB merged. He chose z0–14 for two reasons. First, the merged file would draw blank maps above z10 away from clubs, because the `pmtiles` protocol answers a missing tile with an empty one, not an over-zoom. Second, it needs no club-location list to keep current.
  - Measured on build `20261015` with `--dry-run`: 58,786,221 tile entries, an archive of 69 GB (about 64 GiB).
  - It builds on the standard `ubuntu-26.04` runner. `pmtiles extract` writes with offsets and seeks back for the header, so it cannot stream to GCS. The 145 GB root volume had 109 GB free after cleanup on run `38305058683`, against about 80 GB needed with margin.
  - Cost: $0 in runner minutes (public repo). Storage is about US$3–3.6 a month across both buckets. The build is estimated at 35–45 min.
  - Cloud CDN caches range-capable objects up to 100 GiB, in chunks of about 2 MiB, so this one fits with no CDN change.
  - The object is `basemap/protomaps-v4/world-z0-14-<YYYYMMDD>.pmtiles`, and the D1 and D4 rules are unchanged. The details are in runbook §5.
  - **Live (2026-10-15).** `basemap/protomaps-v4/world-z0-14-20261015.pmtiles`: **68,759,126,401 bytes (64.0 GiB)**, PMTiles v3, z0–14, gzip tiles, on both buckets. A CDN `Range` read returns `206`. `BASEMAP_OBJECT_PATH` names it. The style source's `maxzoom` comes from the archive header (14), so MapLibre over-zooms the z14 tiles beyond 14 and never asks for z15. The style deliberately sets no `maxzoom` of its own: an explicit value overrides the header, and on the PR preview a fixed 14 broke the basemap smoke, whose z0 fixture then had no tiles for the district view. A unit test pins that no `maxzoom` is set.
  - **Measured cost per view (2026-10-15, compressed tile bytes read from the CDN):** a z14 view over downtown Ottawa reads 6 tiles / 390 KB at 375×600 and 12 tiles / 656 KB at 1280×800. Over central Bengaluru it reads 3 tiles / 211 KB and 9 tiles / 573 KB. On z0–10 the same views over-zoomed one 102 KB z10 tile. The district view (about z7) reads the same tiles as before.
  - **First tile (2026-10-15, D61 map, Pixel 7 Android profile from §Context 2, median of 3, same local build and staging CDN for both):** the archive's root directory grows from 11 KB to 53 KB. It no longer fits in the first 16 KB header read, so it costs one more serial range read. The first tile response moved from 6.46 s to 6.82 s (+0.36 s), and the first painted map from 7.10 s to 7.47 s (+0.37 s). These wall-clock times include an uncompressed local `vite preview`. On prod Hosting (z0–10) the same run measured 5.92 s and 6.57 s. The static preview (#1943) covers the gap. Tile bytes at the district view are unchanged.
- **Why not regional now (superseded by the amendment above).** A follow-up can merge a world z0–10 file with a higher-zoom extract over **buffered club coordinates** into one archive with `pmtiles merge`. That works only once a date-level club-coordinate artifact exists (`club-geo` / #1800, blocked on #1763). Until then, z0–10 gives every district the same basemap.
- **Object.** The object is `basemap/protomaps-v4/world-z0-<maxzoom>-<YYYYMMDD>.pmtiles`. It is immutable and dated: a refresh is a new object, then a one-line change to `BASEMAP_OBJECT_PATH`. It is never overwritten in place, so cached chunks can never mix two builds. Upload metadata:
  - `Content-Type: application/octet-stream`, which Protomaps' own build host also uses;
  - `Cache-Control: public, max-age=86400, no-transform`;
  - **no** `Content-Encoding`. The tiles inside the archive are already gzip-compressed (`pmtiles show`: `tile compression: gzip`).
- **Build.** `scripts/basemap/build-basemap.sh <YYYYMMDD> [maxzoom]` extracts, runs `pmtiles verify`, and prints `{file, object, bytes, sha256}`. It runs on a GitHub runner from the manual-dispatch workflow `basemap-build.yml` (Ron, 2026-10-12: not on a laptop). Built files are never committed. The repo holds only a 67 KB z0 fixture for tests.

### D2. Renderer: MapLibre GL JS with the `pmtiles` protocol, lazy-loaded on map routes only

- **Packages.**
  - `maplibre-gl` 6.14 (BSD-3).
  - `pmtiles` 4.5 (BSD-3). It registers the `pmtiles://` protocol through `addProtocol`.
  - `@protomaps/basemaps` 5.7. Its code is BSD-3 and its map design is CC0. It generates the layer list for the v4 schema, which we recolour.
- **Measured bundle cost** (`vite build`, 2026-10-12):
  - `maplibre` chunk 292 KB gzip (1,085 KB raw);
  - CSS 10.7 KB gzip;
  - worker module 508 KB raw / 144 KB gzip, fetched separately when the first map is created;
  - pmtiles + basemaps ≈ 12 KB gzip, included in the chunk;
  - landing critical path unchanged: `check-critical-path` OK, 14 chunks, 174 KB gzip, `forbidden: []`.

  - **Map-route budget (Ron, 2026-10-12): main-thread JS ≤ 300 KB gzip and the MapLibre worker ≤ 150 KB gzip, on map routes only, enforced in CI.**
    - `scripts/check-map-route-budget.ts` runs after the critical-path check in `lighthouse-ci.yml`. The logic is in `scripts/lib/mapRouteBudget.ts`.
    - It charges each map route for the lazy chunks reachable from the chunk that lazy-imports `BasemapMap`. Chunks already on every route's critical path are not charged twice.
    - Measured on this PR: 285 KiB main thread (`BasemapPreviewPage` + `BasemapMap` + `maplibre`) and 141 KiB worker. That leaves #1784 about 15 KiB of main-thread room, so its pins and clustering must stay lean. MapLibre's built-in GeoJSON clustering adds no dependency.
    - The worker cannot be removed. MapLibre parses tiles only in a worker, and the worker module is the published build. It is fetched in parallel when the map is created and runs off the main thread.

- **Code splitting.** `vite.config.ts` puts `maplibre-gl`, `@maplibre/*`, `@mapbox/*`, `pmtiles` and `@protomaps/*` in a named `maplibre` group. `ROUTE_ONLY_CHUNK_PREFIXES` (`scripts/lib/criticalPath.ts`) now lists `maplibre-`, so CI fails if any route preloads it. `LazyBasemapMap` (a dynamic import) is the only way in. Its fallback is a same-size land-coloured box, so the chunk arriving shifts nothing (Lesson 107).
- **Worker.** MapLibre 6 resolves its worker relative to its own `import.meta.url`, and a bundle breaks that resolution. `BasemapMap` imports `maplibre-gl/dist/maplibre-gl-worker.mjs?url` and calls `setWorkerUrl`. The worker is then a same-origin, hashed asset loaded as a module worker. With no `worker-src` in our CSP, the browser falls back to `script-src 'self'`, which already allows it. **The CSP does not change.** The basemap smoke on the deployed preview fails on any CSP or worker console error.
- **Style.** The base style is geometry layers only. With no `glyphs`, no `sprite` and no symbol layers, the only network URL in it is the archive. A unit test pins this. The labels are added later on self-hosted glyphs (addendum below).
- **Colours.**
  - Light: land `#F4F1EB` (`--rt-paper`), water `#C9D7E0`.
  - Dark: land `#1A1816` (`--rt-bg-2`), water `#1E2A33`.

  These are exactly the values the pin palette was validated against (spec §6.3). Landuse, roads, buildings and boundaries are near-neutral shades of the land colour, built from the `grayscale` / `black` flavours, so the basemap stays quieter than any pin. A theme change calls `setStyle` on the same map. The map is not rebuilt.

### D3. Licence and attribution

- **Tiles.** "Produced Works of the OpenStreetMap dataset" under the **ODbL**. Web maps must show "© OpenStreetMap" (github.com/protomaps/basemaps README, docs.protomaps.com). Natural Earth data needs no corner credit.
- **Map design.** CC0. **Code:** BSD-3. A modified fork distributed as a product must not be called "Protomaps". We distribute only a recoloured style inside our app and do not use the name for it.
- **Our credit.** It reads `Protomaps © OpenStreetMap`, linking to `github.com/protomaps/basemaps` and `openstreetmap.org/copyright`. It is set on the source and shown by MapLibre's attribution control with `compact: false`, so it is never collapsed behind an "i". It has theme-aware colours. A unit test and the 375 smoke assert it.

### D4. Hosting, CDN and CORS

- **Placement.** The archive goes on the data buckets: staging `toast-stats-data-staging` and prod `toast-stats-data-ca`. `config/basemap.ts` builds the URL from `VITE_CDN_BASE_URL`, so a preview reads the staging copy and prod reads `cdn.taverns.red`. `VITE_BASEMAP_PMTILES_URL` overrides the URL for dev.
  - The pipeline never touches `basemap/`. Promotion copies `v1/`, `snapshots/`, `time-series/` and `config/`. Prune and reconcile delete only `raw-csv/` and `snapshots/` (`data-pipeline.yml`).
  - The upload is an operator step, not a pipeline stage. Ron dispatches `basemap-build.yml` twice: `target=staging` builds, uploads and verifies; `target=prod-copy` copies server side and checks the CDN's range response. The workflow does not record the object in the run manifest (`runs/<id>/written.jsonl`), which feeds the pipeline's gates.
- **Ranges through Cloud CDN.** Per the Cloud CDN caching docs, an origin that supports byte ranges must answer with:
  - status 200 or 206, `Accept-Ranges: bytes`, and `Content-Length` (plus `Content-Range` on a 206);
  - `ETag` and `Last-Modified` with a **strong** validator.

  The CDN then caches objects up to **100 GiB** and fills them in 2 MiB chunks. GCS meets these requirements for a non-composite object. The upload command therefore disables parallel composite uploads (`CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED=False`), because that is the gcloud default for large files.

- **Dynamic compression (AUTOMATIC).** It does **not** apply to the archive. Per the Cloud CDN dynamic-compression docs:
  - only listed types are compressed (`application/json`, `text/*`, `application/*+json` …), and `application/octet-stream` is not one of them;
  - responses with `Cache-Control: no-transform` are never compressed;
  - responses over 10 MiB are never compressed;
  - responses that already have a `Content-Encoding` are never compressed;
  - a compressed response would carry `Accept-Ranges: none`, and its cache hits would ignore `Range`.

  The upload sets `no-transform` as a second guard. The CDN config does not change.

- **GCS transcoding.** Never upload with `-Z`/`--gzip-local` or `Content-Encoding: gzip`. Under decompressive transcoding GCS "silently ignores" `Range` and serves, and bills, the whole object (GCS transcoding docs).
- **CORS.** **No change.** `Range` with a single byte range is a CORS-safelisted request header, so no preflight is needed. This was measured on 2026-10-12 in Chromium and WebKit: a `fetch` with `Range: bytes=0-99` from `https://ts.taverns.red` to `cdn.taverns.red`, and from a `*.web.app` origin to the staging bucket, returned `206`, 100 bytes and a readable `ETag`.
  - `Content-Range` is not exposed by our CORS config. `pmtiles` reads it only on a `416` for archives under 16 KB, which never applies here.
  - The prod bucket allows `https://ts.taverns.red`, and the staging bucket allows `*`. That covers prod and previews.

### D5. Update cadence

Refresh only when there is a reason: a schema-version bump in `@protomaps/basemaps`, a visible OSM change that matters to users, or once a year. A refresh is three steps: build a new dated object, upload it, and change `BASEMAP_OBJECT_PATH` in a PR. Delete the previous object one week after the PR deploys, so open tabs and cached chunks drain. No daily or scheduled job.

## Consequences

### Positive

- No API key, no third-party request from viewers' browsers (the privacy goal), and no dependence on another service's availability. Tiles come from the same CDN as the data.
- Zero landing-page cost, enforced by `check-critical-path`.
- One immutable file is easy to reason about. A rollback is a revert of `BASEMAP_OBJECT_PATH`.
- No CDN, CORS or CSP change is needed (D2, D4).

### Negative

- **Cost.** These are list-price estimates; check billing after the first month.
  - Storage: 3.8 GB in each of two buckets, at Standard storage ≈ US$0.02–0.03 per GB-month, is about **US$0.20/month**. Superseded by z0–14 (D1): 64 GiB in each bucket, about **US$3–3.6/month**.
  - Egress: a first map view at 375 px reads the header plus about 6–15 tiles, roughly 0.3–1 MB. At the repo's observed Cloud CDN NA rate (~US$0.11–0.13/GiB, `docs/investigations/gcp-network-spend-2026-05-30.md`), 1,000 map sessions a month cost about **US$0.10–0.15**.
  - Cache lookups (~US$0.01 per 10k) and cache fill within North America are negligible at our traffic.
  - The fixed load-balancer charge (ADR-007) is unchanged.
- **Map route cost.** 292 KB gzip of main-thread JS, plus a 144 KB gzip worker. That is the price of vector tiles; a raster stack would need a tile server or a pre-rendered pyramid.
- ~~**No place labels** until a glyph range is self-hosted (follow-up).~~ Superseded by the addendum below (#2081): labels ship on self-hosted glyphs. Street names and landmarks arrived with the z0–14 archive (D1 amendment, #2084).
- **Operator steps.** Two manual workflow dispatches per refresh. The standard runner is used after it frees preinstalled toolchains. The workflow checks the space before downloading anything, and fails with "use a larger runner" if there is not enough.
- **Detail.** Beyond z10 the geometry is over-zoomed, so minor streets are generalised. The 2026-10-15 amendment (D1) moves to world z0–14 for street-level detail everywhere. That costs about 18 times the storage (US$3–3.6 a month) and a build of about 40 minutes.

## Addendum (2026-10-15, #2081): labels on self-hosted glyphs

**Decision.** The basemap draws labels with our own zoom-banded symbol layers (`frontend/src/components/map/basemapLabels.ts`). The glyphs are served from our own origin, so there is still no third-party request from the viewer's browser.

- **Deferred.** The base style stays geometry only. On the basemap's first `idle`, `BasemapMap` imports the label module (its own lazy chunk), sets the glyphs URL and adds the label layers above the basemap's own layers, below anything a page has added (the pins). The first tile never waits on labels. The map route's fixed bytes grow by about 140 B gzip, inside the 300 KB budget, which stays unchanged (#1856 ratchets budgets down). Labels draw on the canvas, so they cause no layout shift.

- **Font.** Inter Regular 4.1 (SIL OFL 1.1, licence shipped beside the files as `OFL.txt`). It is the app's body font (`--rt-font-body`). The glyph PBFs were built with `build_pbf_glyphs` 1.5.1 from the official release's `extras/ttf/Inter-Regular.ttf`.
- **Files.** `frontend/public/basemap/glyphs/inter-4.1/Inter-Regular/{range}.pbf` (moved to `inter-4.1-noto-ar2.013-he3.001/` by #2085, below), served by Firebase Hosting. The path carries the font version, so the files are cached as `immutable` (`firebase.json`). A new font or a new range means a new version directory.
- **Ranges and bytes.** Seven ranges, 719,203 bytes on disk (217,153 gzip -9):

  | Range     | Covers                                 | Bytes   | gzip   |
  | --------- | -------------------------------------- | ------- | ------ |
  | 0-255     | Basic Latin, Latin-1                   | 84,331  | 28,795 |
  | 256-511   | Latin Extended-A/B                     | 139,397 | 38,489 |
  | 512-767   | Latin Extended-B, IPA, modifiers       | 101,699 | 34,529 |
  | 768-1023  | Combining marks, Greek                 | 62,810  | 22,254 |
  | 1024-1279 | Cyrillic                               | 131,092 | 41,333 |
  | 7680-7935 | Latin Extended Additional (Vietnamese) | 147,232 | 30,556 |
  | 8192-8447 | General punctuation (– ’ “ ”)          | 52,642  | 21,197 |

  MapLibre fetches a range only when a visible label needs it, after the map chunk has loaded. A typical English-language view needs `0-255`, and often `8192-8447` for names such as "York South–Weston".

- **Unshipped ranges 404.** A rewrite sends `/basemap/glyphs/**` misses to a file that does not exist, so Hosting returns 404 rather than the SPA's `index.html` with a 200. MapLibre then draws that glyph locally (checked on the Hosting emulator and on the preview).
- **Script coverage.** The English name (`name:en`) wins. Without one:
  - Latin, Cyrillic and Greek names are drawn from our glyphs.
  - Chinese, Japanese and Korean names are drawn by the browser's own font (MapLibre's `localIdeographFontFamily`), with no request.
  - Arabic and Hebrew names are drawn from our glyphs since #2085 (addendum below).
  - Any other script (Indic, Thai…) is shown only when an English name exists. We ship no glyphs for these scripts. Most countries, states and cities have `name:en`. Neighbourhoods in those regions often do not.
- **Zoom bands.** Labels are never busy:
  - countries z1–7;
  - states and provinces z4–10 (the abbreviation below z6);
  - cities and towns from z3, each one zoom after the tile's own `min_zoom`;
  - neighbourhoods from z12;
  - streets from z13 (major roads) and z14 (minor roads), at most one name every 400 px along a road;
  - landmarks from z14 (airports, stations, parks, universities, stadiums, museums, galleries, zoos, attractions, libraries, town halls). Each shows from the zoom the tile schema ranks it at (its `min_zoom`), so a z14 view keeps the tile's most notable places and the long tail of small parks waits for z15;
  - a few businesses from z16: hotels, malls and supermarkets (Ron asked for a few business categories). No food, drink, shops or services: a downtown z14 tile carries more than 100 named POIs, mostly those;
  - landmark labels keep 12 px of padding, so street zoom stays calm.
- **Look.** Labels use the app's slate inks: `--ink-2` for cities and `--ink-3` for every other band (light `#344052`/`#5B6675`, dark `#C8D1DD`/`#8A96A6`), with a 1.5 px halo in the land colour. Every label is at least 4.5:1 on the land (#2080's neutral basemap). There is no new hue and no sprite.
  - Labels sit directly above the basemap's layers and below the pins.
  - Pins keep `icon-allow-overlap` but now enter the collision index (`icon-ignore-placement: false`). A city or landmark label therefore steps beside a pin, by 2.2–2.4 em, or hides; it never sits under one.
- **Accessibility.** Labels are canvas-drawn and decorative. The map region keeps its accessible name, and the side panels carry the club names.

**Limits and follow-ups (Ron's call).**

1. ~~**Street names need higher-zoom tiles.**~~ Resolved by the world z0–14 archive (D1 amendment, #2084). On z0–10, road features carried no `name` and a city tile carried 3–9 POIs. A z14 tile over downtown Ottawa carries 165 named roads and 111 named POIs.
2. ~~**Arabic-script names without an English name.**~~ Resolved by #2085 (addendum below), with glyphs only: MapLibre needs no RTL plugin.

## Addendum (2026-10-16, #2085): Arabic and Hebrew names

**Decision.** Names in Arabic or Hebrew script with no English version are drawn, from self-hosted glyphs. **No RTL text plugin is loaded.**

- **Why no plugin.** MapLibre GL JS 6.9.0 began drawing Arabic and Hebrew labels without one ([changelog](https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md): "draws Arabic and Hebrew labels correctly without loading a right-to-left text plugin"). We run 6.14. Its typings mark `setRTLTextPlugin(pluginURL: string, lazy: boolean): Promise<void>` and `getRTLTextPluginStatus()` `@deprecated`. A plugin set there replaces the built-in shaping (`src/symbol/arabic_shaping.ts`) and bidi (`src/symbol/bidi.ts`, on `bidi-js`). Loading `@mapbox/mapbox-gl-rtl-text` (1.0.0, BSD-2-Clause, about 56 KB unpacked) would add a request and swap a maintained path for a deprecated one, with nothing gained. A unit test fails if `BasemapMap` ever calls `setRTLTextPlugin`.
- **Glyphs.** Inter has no Arabic or Hebrew. Four ranges are built with `build_pbf_glyphs` 1.5.1 as an Inter-first combination (`-c`) with Noto Sans Arabic 2.013 and Noto Sans Hebrew 3.001 (unhinted TTFs from the notofonts GitHub releases; SIL OFL 1.1; licences shipped as `OFL-NotoSansArabic.txt` and `OFL-NotoSansHebrew.txt`). Where Inter has a glyph it wins, so the Cyrillic Supplement in 1280-1535 stays Inter's. The build is reproducible: rebuilding Inter's seven ranges gives byte-identical files.
- **Which ranges.** MapLibre's shaper rewrites each Arabic letter into the presentation form it takes in its word and asks for that code point, so Arabic needs the presentation-form blocks as well as Arabic proper. The shaper emits Forms-B (U+FE70–FEFF) and, for Persian and Urdu letters, Forms-A U+FB50–FBFF. It never emits the U+FC00–FDFF ligatures, so they are not shipped. A test runs MapLibre's own shaper over real names from the live tiles (Amman, Tel Aviv–Ramat Gan) and checks every code point it draws against the glyph ids in our PBFs.

  | Range       | Covers                                              | Bytes   | gzip   |
  | ----------- | --------------------------------------------------- | ------- | ------ |
  | 1280-1535   | Hebrew (+ Inter's Cyrillic Supplement)              | 20,770  | 8,054  |
  | 1536-1791   | Arabic (letters that do not join, digits, marks)    | 122,071 | 36,587 |
  | 64256-64511 | Arabic Presentation Forms-A (Persian, Urdu), Hebrew | 104,591 | 27,908 |
  | 65024-65279 | Arabic Presentation Forms-B                         | 69,784  | 20,780 |

  That is 317,216 bytes on disk (93,329 gzip -9). Nothing is fetched until such a label is on screen. A Hebrew view adds about 8 KB. An Arabic view adds about 57 KB (1536-1791 and Forms-B), plus 28 KB where Persian or Urdu letters appear.

- **New path.** The glyphs moved to `basemap/glyphs/inter-4.1-noto-ar2.013-he3.001/`, following the rule above: the files are cached as `immutable`, so the directory names every font in the stack. A miss is a 404 with `no-cache` (checked on the preview and on prod), so an unshipped range is never cached as missing. The seven existing files moved unchanged. Returning viewers download the ranges they use once more.
- **On the wire.** Firebase Hosting serves the PBFs with brotli: 7.0 KB for Hebrew, 25.3 KB for Arabic and 16.8 KB for Forms-B (measured on the PR preview). An Arabic view therefore costs about 42 KB, and a Hebrew view about 7 KB.
- **Budget.** No change to the map route's fixed JS. The label chunk gains two script names and four range strings.

## Alternatives considered

- **OpenFreeMap** (free, no key). Rejected by Ron (2026-10-11): viewers' IP addresses and viewports go to a third party, and its availability is not ours.
- **MapTiler / Stadia free tiers.** Rejected: keyed, referer-locked and usage-capped.
- **openstreetmap.org raster tiles.** Excluded by the OSM tile usage policy for production apps.
- **Leaflet + raster tiles** (~42 KB gzip). Smaller, but raster needs a tile server or a pre-rendered pyramid (millions of objects), not one range-readable file. Vector tiles also restyle for dark mode in the client, where raster would need a second pyramid.
- **Full planet (z0–15, 139 GB) or world z0–12 (18 GB).** 5–35 times the storage for detail beyond what the club maps need.
- **Per-country high-zoom extracts as extra sources.** This multiplies files and style sources across 158 countries. Superseded by the `pmtiles merge` of a club-buffer extract once `club-geo` exists.
