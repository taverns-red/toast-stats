# Changelog

## [3.49.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.48.0...frontend-v3.49.0) (2026-10-25)


### Features

* **training:** officer-training distribution in the time series and region rollups ([#2296](https://github.com/taverns-red/toast-stats/issues/2296)) ([#2311](https://github.com/taverns-red/toast-stats/issues/2311)) ([48e128f](https://github.com/taverns-red/toast-stats/commit/48e128fc701caced6dfac89e4e1379c718cc21c5))
* **training:** officer-training Training subpage ([#2296](https://github.com/taverns-red/toast-stats/issues/2296)) ([#2312](https://github.com/taverns-red/toast-stats/issues/2312)) ([52109b7](https://github.com/taverns-red/toast-stats/commit/52109b71ee36cec578a32121cb947e8144239e6a))
* **training:** region comparison of district officer training ([#2296](https://github.com/taverns-red/toast-stats/issues/2296)) ([#2313](https://github.com/taverns-red/toast-stats/issues/2313)) ([c132975](https://github.com/taverns-red/toast-stats/commit/c132975a239a8dd7c95b151949647c5c1f0a40be))

## [3.48.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.47.2...frontend-v3.48.0) (2026-10-25)


### Features

* **training:** accept officerTraining in the region-rollups and time-series contracts ([#2296](https://github.com/taverns-red/toast-stats/issues/2296)) ([#2314](https://github.com/taverns-red/toast-stats/issues/2314)) ([611b9e1](https://github.com/taverns-red/toast-stats/commit/611b9e1253677b84329e339bd9492ad80ff40dc3))


### Bug Fixes

* **action-list:** omit zero parts from the Needs cell ([#2308](https://github.com/taverns-red/toast-stats/issues/2308)) ([#2309](https://github.com/taverns-red/toast-stats/issues/2309)) ([be7f5b7](https://github.com/taverns-red/toast-stats/commit/be7f5b7664171ba4aab8a519e68e204ba05a2c44))

## [3.47.2](https://github.com/taverns-red/toast-stats/compare/frontend-v3.47.1...frontend-v3.47.2) (2026-10-24)


### Bug Fixes

* **club:** say the meeting time is not readable instead of TI's '?' text ([#2247](https://github.com/taverns-red/toast-stats/issues/2247)) ([#2267](https://github.com/taverns-red/toast-stats/issues/2267)) ([8f2f274](https://github.com/taverns-red/toast-stats/commit/8f2f2743041e1405a71478d68b3753f2354c7fbf))
* **clubs:** drop '?' address parts and say the address is not readable ([#2268](https://github.com/taverns-red/toast-stats/issues/2268)) ([#2270](https://github.com/taverns-red/toast-stats/issues/2270)) ([ba5d732](https://github.com/taverns-red/toast-stats/commit/ba5d7324590cc129b2c425a19af6ed1b7f562071))
* **landing:** full phone title and a payments row in the 375 World pulse ([#2256](https://github.com/taverns-red/toast-stats/issues/2256)) ([#2263](https://github.com/taverns-red/toast-stats/issues/2263)) ([6bbc28d](https://github.com/taverns-red/toast-stats/commit/6bbc28da9cd2b64f43774d2d3f413af48c4d2039))
* **landing:** keep a bare / free of ?regions= ([#2255](https://github.com/taverns-red/toast-stats/issues/2255)) ([#2273](https://github.com/taverns-red/toast-stats/issues/2273)) ([4e80f8b](https://github.com/taverns-red/toast-stats/commit/4e80f8b7bc8fa5c1580fb2e9cedbc6d8a4c59ff6))
* last-visit baseline moves only on a later as-of date ([#2254](https://github.com/taverns-red/toast-stats/issues/2254)) ([#2271](https://github.com/taverns-red/toast-stats/issues/2271)) ([7a9e3df](https://github.com/taverns-red/toast-stats/commit/7a9e3df105ba2a2be41ae346940c25ff739bccf8))
* **map:** load the online clubs chip eagerly to drop the Suspense throttle ([#2248](https://github.com/taverns-red/toast-stats/issues/2248)) ([#2280](https://github.com/taverns-red/toast-stats/issues/2280)) ([77b5178](https://github.com/taverns-red/toast-stats/commit/77b517844afae77664421fe546ba6cf64fd2f8c4))


### Tests

* preload lazy page graphs before the first findBy ([#2248](https://github.com/taverns-red/toast-stats/issues/2248)) ([#2275](https://github.com/taverns-red/toast-stats/issues/2275)) ([55a1c2c](https://github.com/taverns-red/toast-stats/commit/55a1c2ce9b06b2d56ba0a207149500396c8254e8))


### Continuous Integration

* **preview:** upload smoke results on failure and log error responses ([#2248](https://github.com/taverns-red/toast-stats/issues/2248)) ([#2277](https://github.com/taverns-red/toast-stats/issues/2277)) ([2d84132](https://github.com/taverns-red/toast-stats/commit/2d841329dc138ad2a2617c92cb0d94b9ac083da6))

## [3.47.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.47.0...frontend-v3.47.1) (2026-10-24)


### Bug Fixes

* **awards:** raise the tied chip to a 12px uppercase label ([#2264](https://github.com/taverns-red/toast-stats/issues/2264)) ([#2265](https://github.com/taverns-red/toast-stats/issues/2265)) ([4767a45](https://github.com/taverns-red/toast-stats/commit/4767a457b55c8394ad946d0049d8183a6503d55c))


### Refactors

* **pipeline:** the education rollup reaches prod through the manifest promote ([#2222](https://github.com/taverns-red/toast-stats/issues/2222)) ([#2235](https://github.com/taverns-red/toast-stats/issues/2235)) ([4765d81](https://github.com/taverns-red/toast-stats/commit/4765d81d5d98304c1a1abf3b0e2e05ee45d51844))

## [3.47.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.46.1...frontend-v3.47.0) (2026-10-24)


### Features

* **landing:** find your district first, world pulse, Red Vote block ([#2249](https://github.com/taverns-red/toast-stats/issues/2249)) ([#2250](https://github.com/taverns-red/toast-stats/issues/2250)) ([dfbb0d1](https://github.com/taverns-red/toast-stats/commit/dfbb0d10e5a99eac751c846c879687ca4ec20026))

## [3.46.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.46.0...frontend-v3.46.1) (2026-10-21)


### Tests

* **e2e:** the world-map online-chip smoke controls its own data ([#2229](https://github.com/taverns-red/toast-stats/issues/2229)) ([#2230](https://github.com/taverns-red/toast-stats/issues/2230)) ([89a5b5e](https://github.com/taverns-red/toast-stats/commit/89a5b5e9f33113e5d4d838a28529f54c21b8ebe7))
* **frontend:** preload the DistrictActionListPage module graph before the first test ([#2211](https://github.com/taverns-red/toast-stats/issues/2211)) ([#2217](https://github.com/taverns-red/toast-stats/issues/2217)) ([811630b](https://github.com/taverns-red/toast-stats/commit/811630b2587a334907cb045772c853653ba17b9c))


### Dependencies

* **deps-dev:** Bump vite from 8.3.1 to 8.3.4 ([#2212](https://github.com/taverns-red/toast-stats/issues/2212)) ([97ccf9b](https://github.com/taverns-red/toast-stats/commit/97ccf9bc40f1d29c1150341615dddca2e1213596))

## [3.46.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.45.0...frontend-v3.46.0) (2026-10-20)


### Features

* **clubs-by-region:** meetsOnline on shard rows + region map online chip ([#2175](https://github.com/taverns-red/toast-stats/issues/2175)) ([#2201](https://github.com/taverns-red/toast-stats/issues/2201)) ([4d95425](https://github.com/taverns-red/toast-stats/commit/4d954259e2d6be7acc60781ddbbe2298c759371e))
* **meetings:** region and world meeting-time heatmaps at /region/:n/meetings and /regions/meetings ([#1814](https://github.com/taverns-red/toast-stats/issues/1814)) ([#2207](https://github.com/taverns-red/toast-stats/issues/2207)) ([3831e2c](https://github.com/taverns-red/toast-stats/commit/3831e2c1a8c0a3af41387e454ae82584d685c683))
* **world:** link the world explorer to the country map ([#1809](https://github.com/taverns-red/toast-stats/issues/1809)) ([#2213](https://github.com/taverns-red/toast-stats/issues/2213)) ([a7878ee](https://github.com/taverns-red/toast-stats/commit/a7878eedf1afee799977d6c882e67e93dfb312cf))


### Bug Fixes

* **world:** the Colour picker no longer crashes the world explorer ([#2214](https://github.com/taverns-red/toast-stats/issues/2214)) ([#2215](https://github.com/taverns-red/toast-stats/issues/2215)) ([0d1dc01](https://github.com/taverns-red/toast-stats/commit/0d1dc017c47d5f9f7bed07642443bd45a7280670))

## [3.45.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.44.0...frontend-v3.45.0) (2026-10-20)


### Features

* **education:** multi-year bars on the district education page ([#1807](https://github.com/taverns-red/toast-stats/issues/1807)) ([#2194](https://github.com/taverns-red/toast-stats/issues/2194)) ([9c39c3c](https://github.com/taverns-red/toast-stats/commit/9c39c3c6193c0a5df6dc0318e91e21415f899f58))
* **education:** sparkline-expand for the district years below 768 ([#1793](https://github.com/taverns-red/toast-stats/issues/1793)) ([#2195](https://github.com/taverns-red/toast-stats/issues/2195)) ([bf5916c](https://github.com/taverns-red/toast-stats/commit/bf5916cdda5b4bae6d620edb00e9a86be183e2be))
* **education:** world education page at /regions/education ([#1811](https://github.com/taverns-red/toast-stats/issues/1811)) ([#2199](https://github.com/taverns-red/toast-stats/issues/2199)) ([8929c8f](https://github.com/taverns-red/toast-stats/commit/8929c8f67c3ad1a319e95fdd1142066b4805f5f2))
* **pipeline:** snapshots/{date}/meeting-times.json, per-district meeting-time counts for the region and world heatmaps ([#1814](https://github.com/taverns-red/toast-stats/issues/1814)) ([#2206](https://github.com/taverns-red/toast-stats/issues/2206)) ([cf21b4a](https://github.com/taverns-red/toast-stats/commit/cf21b4a059e7126e4de965b4dfa2293db3337b88))
* **region:** PY-scoped region membership and moved-region banner ([#1821](https://github.com/taverns-red/toast-stats/issues/1821)) ([#2197](https://github.com/taverns-red/toast-stats/issues/2197)) ([d2e564c](https://github.com/taverns-red/toast-stats/commit/d2e564c0f261ee46272e4c51e788759f28800435))
* **world:** world club explorer at /regions/map ([#1809](https://github.com/taverns-red/toast-stats/issues/1809)) ([#2200](https://github.com/taverns-red/toast-stats/issues/2200)) ([5f815f6](https://github.com/taverns-red/toast-stats/commit/5f815f6eca90e9c3403305e6481fa9c0927f75e7))


### Bug Fixes

* **club:** fixed hero chip column so the full render cannot re-wrap the hero ([#2071](https://github.com/taverns-red/toast-stats/issues/2071)) ([#2196](https://github.com/taverns-red/toast-stats/issues/2196)) ([1bc8ffc](https://github.com/taverns-red/toast-stats/commit/1bc8ffc80faee4a9328155cc9391f5f003d73b3a))
* **growth:** read a multi-step prospect cell at its furthest step ([#2142](https://github.com/taverns-red/toast-stats/issues/2142)) ([#2189](https://github.com/taverns-red/toast-stats/issues/2189)) ([d40b6d4](https://github.com/taverns-red/toast-stats/commit/d40b6d45539b399a22ee1ebe478f994537732e2e))
* **map:** pick area shades district-wide so every pair reads apart ([#2178](https://github.com/taverns-red/toast-stats/issues/2178)) ([#2188](https://github.com/taverns-red/toast-stats/issues/2188)) ([3aefdd8](https://github.com/taverns-red/toast-stats/commit/3aefdd8d0c6d04125faaeb719b9de42e4df02c70))


### Documentation

* **methodology:** add the three-Level-1s DCP-credit example ([#1807](https://github.com/taverns-red/toast-stats/issues/1807)) ([#2192](https://github.com/taverns-red/toast-stats/issues/2192)) ([758ebce](https://github.com/taverns-red/toast-stats/commit/758ebcecedfffd1eedecfb1d30f6e7d533563942))


### Tests

* **e2e:** lineage smoke accepts the date-exact chip ([#1816](https://github.com/taverns-red/toast-stats/issues/1816)) ([#2208](https://github.com/taverns-red/toast-stats/issues/2208)) ([7a0b270](https://github.com/taverns-red/toast-stats/commit/7a0b270984a669d0f52851acc3447a1df8fbba59))

## [3.44.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.43.0...frontend-v3.44.0) (2026-10-20)


### Features

* action-list section + CSV export for clubs without a Club Success Plan ([#1555](https://github.com/taverns-red/toast-stats/issues/1555), 3/4) ([#1561](https://github.com/taverns-red/toast-stats/issues/1561)) ([52109a3](https://github.com/taverns-red/toast-stats/commit/52109a3c72b37fc54a1523c1b08e5ab496b4205d))
* **action-list:** collapsible sections, with the Club Success Plan section pinned first while actionable ([#1569](https://github.com/taverns-red/toast-stats/issues/1569)) ([#1571](https://github.com/taverns-red/toast-stats/issues/1571)) ([56d8194](https://github.com/taverns-red/toast-stats/commit/56d81947be779023c4b13a6d4179e8c4c76cb1f8))
* **action-list:** restructure the four sections into aligned 28px tables ([#1577](https://github.com/taverns-red/toast-stats/issues/1577)) ([#1578](https://github.com/taverns-red/toast-stats/issues/1578)) ([6c0389a](https://github.com/taverns-red/toast-stats/commit/6c0389ae0b41bd83ed3e69ec812c7db926c6bad7))
* **analytics:** education award leaderboards ([#1592](https://github.com/taverns-red/toast-stats/issues/1592)) ([#1593](https://github.com/taverns-red/toast-stats/issues/1593)) ([504f792](https://github.com/taverns-red/toast-stats/commit/504f7926f2ae5a3970863669e505a301e64ee59d))
* **analytics:** retire the 8 unread per-district analytics files; completeness gate ignores them ([#1798](https://github.com/taverns-red/toast-stats/issues/1798)) ([#1989](https://github.com/taverns-red/toast-stats/issues/1989)) ([88b9632](https://github.com/taverns-red/toast-stats/commit/88b9632c56f16da88d1e60cda02cd98aef161a79))
* **area:** Area Director action list — shareable 'what to do next' ([#1231](https://github.com/taverns-red/toast-stats/issues/1231)) ([#1239](https://github.com/taverns-red/toast-stats/issues/1239)) ([7d9a998](https://github.com/taverns-red/toast-stats/commit/7d9a998363e25fb27df138828dcc0494d414d9c4))
* **awards:** District Club Growth Achievement recipients on /awards ([#1537](https://github.com/taverns-red/toast-stats/issues/1537)) ([#1680](https://github.com/taverns-red/toast-stats/issues/1680)) ([3533f3f](https://github.com/taverns-red/toast-stats/commit/3533f3f0557b7c6627c20024c6f67cb778607b4b))
* **changes,search:** transfers name the counterpart district; omni-search finds closed clubs ([#1806](https://github.com/taverns-red/toast-stats/issues/1806)) ([#2060](https://github.com/taverns-red/toast-stats/issues/2060)) ([f80fea1](https://github.com/taverns-red/toast-stats/commit/f80fea17022a570abf2f677986fa1f28304ecbd9))
* **changes:** add 'Club status changes' group — club operational-status transitions ([#1247](https://github.com/taverns-red/toast-stats/issues/1247)) ([#1248](https://github.com/taverns-red/toast-stats/issues/1248)) ([b9c1a72](https://github.com/taverns-red/toast-stats/commit/b9c1a7255888c7258a90cf2ec148defe53a498e3))
* **charts:** lazy chart chunk fallbacks paint the chart's own loading state ([#1835](https://github.com/taverns-red/toast-stats/issues/1835)) ([#2058](https://github.com/taverns-red/toast-stats/issues/2058)) ([370d59e](https://github.com/taverns-red/toast-stats/commit/370d59e979b22b222a1c250c3ef6fc3b3240d27a))
* **charts:** tap-to-pin chart readout on touch devices ([#1835](https://github.com/taverns-red/toast-stats/issues/1835)) ([#1939](https://github.com/taverns-red/toast-stats/issues/1939)) ([a54f297](https://github.com/taverns-red/toast-stats/commit/a54f297d8a3165353eb3bf79fa44051d044b9bf2))
* **charts:** unpin, legend chips, phone ticks and chart-shaped skeletons ([#1835](https://github.com/taverns-red/toast-stats/issues/1835)) ([#2016](https://github.com/taverns-red/toast-stats/issues/2016)) ([453738b](https://github.com/taverns-red/toast-stats/commit/453738bdebfd34eb8a065b8996938354996520dc))
* Club Success Plan clauses in the area and division narratives ([#1555](https://github.com/taverns-red/toast-stats/issues/1555), 2/4) ([#1559](https://github.com/taverns-red/toast-stats/issues/1559)) ([d507dac](https://github.com/taverns-red/toast-stats/commit/d507dac6146397e15befe16440d7c60544e1d3a9))
* **club:** /club/:cid?py= and the club page resolve the PY's district ([#1804](https://github.com/taverns-red/toast-stats/issues/1804)) ([#2067](https://github.com/taverns-red/toast-stats/issues/2067)) ([dfe193d](https://github.com/taverns-red/toast-stats/commit/dfe193d588d82a058d52ab2f837d388070fdc202))
* **club:** 2×2 stat strip and open disclosure panels on phones ([#1843](https://github.com/taverns-red/toast-stats/issues/1843)) ([#2052](https://github.com/taverns-red/toast-stats/issues/2052)) ([eee7eab](https://github.com/taverns-red/toast-stats/commit/eee7eab2f6991903102332973840e463bfc99d47))
* **club:** club history resolves each year's district from the history ([#1803](https://github.com/taverns-red/toast-stats/issues/1803)) ([#2068](https://github.com/taverns-red/toast-stats/issues/2068)) ([85e848e](https://github.com/taverns-red/toast-stats/commit/85e848e9fb5756be426fcaa78a72c7f628dc7b41))
* **club:** club page on the mobile primitives — hero ≤ 200 px, history row, static mini-map ([#1843](https://github.com/taverns-red/toast-stats/issues/1843)) ([#1950](https://github.com/taverns-red/toast-stats/issues/1950)) ([6a9150f](https://github.com/taverns-red/toast-stats/commit/6a9150fe609ad66c44740ce49083cf53dedea615))
* **club:** Compliance panel + Awards/Coach stat cells ([#1790](https://github.com/taverns-red/toast-stats/issues/1790)) ([#1855](https://github.com/taverns-red/toast-stats/issues/1855)) ([10f140c](https://github.com/taverns-red/toast-stats/commit/10f140c62957695c7ef8af360e9266f0312a8bb5))
* **club:** Education panel from the reports ledger (Legacy/Pathways/DTM) ([#1790](https://github.com/taverns-red/toast-stats/issues/1790)) ([#1826](https://github.com/taverns-red/toast-stats/issues/1826)) ([a04643c](https://github.com/taverns-red/toast-stats/commit/a04643cde72a2467da938efdd8f279780786ffa4))
* **club:** hero lineage chip from the club-district history ([#1805](https://github.com/taverns-red/toast-stats/issues/1805)) ([#2066](https://github.com/taverns-red/toast-stats/issues/2066)) ([cfe9803](https://github.com/taverns-red/toast-stats/commit/cfe9803f3d19073b671454db47a37d2f827e8c43))
* **club:** hero where-it-meets line + Contact on toastmasters.org, 3.2 layout order ([#1783](https://github.com/taverns-red/toast-stats/issues/1783)) ([#1823](https://github.com/taverns-red/toast-stats/issues/1823)) ([b923d30](https://github.com/taverns-red/toast-stats/commit/b923d30c9c5eb96b123d607f3722dcef00267631))
* **club:** Lifecycle card shows observed moves only and where our records start ([#2169](https://github.com/taverns-red/toast-stats/issues/2169)) ([#2170](https://github.com/taverns-red/toast-stats/issues/2170)) ([686d9e1](https://github.com/taverns-red/toast-stats/commit/686d9e1966f17005529b4df1b5c7e1cb2a15676f))
* **club:** Lifecycle panel is a vertical timeline ([#1843](https://github.com/taverns-red/toast-stats/issues/1843)) ([#2057](https://github.com/taverns-red/toast-stats/issues/2057)) ([16e956c](https://github.com/taverns-red/toast-stats/commit/16e956c16e42cac90f6a7ac42c57c009be63e02e))
* **club:** multi-year membership context on the club page ([#1791](https://github.com/taverns-red/toast-stats/issues/1791)) ([#1955](https://github.com/taverns-red/toast-stats/issues/1955)) ([a562eba](https://github.com/taverns-red/toast-stats/commit/a562ebac438ffd15826e0437c301ee21c77393c0))
* **club:** never display a club's online meeting link ([#1879](https://github.com/taverns-red/toast-stats/issues/1879)) ([#1882](https://github.com/taverns-red/toast-stats/issues/1882)) ([fdc6799](https://github.com/taverns-red/toast-stats/commit/fdc679956727e8fbe608d553feb659b6ef507a53))
* **club:** quiet outline hero chips and compact PY/date controls ([#2171](https://github.com/taverns-red/toast-stats/issues/2171)) ([#2172](https://github.com/taverns-red/toast-stats/issues/2172)) ([3d99036](https://github.com/taverns-red/toast-stats/commit/3d9903672596ab7555da66030e17167d5be3c5f9))
* **club:** real map tiles under the Location mini-map ([#2162](https://github.com/taverns-red/toast-stats/issues/2162)) ([#2165](https://github.com/taverns-red/toast-stats/issues/2165)) ([c0978cd](https://github.com/taverns-red/toast-stats/commit/c0978cdf6572829eb81f833870f5c71a52532b3e))
* **clubs:** /clubs hub and /clubs/race/:tier routed subpages ([#1556](https://github.com/taverns-red/toast-stats/issues/1556), 3/4) ([#1562](https://github.com/taverns-red/toast-stats/issues/1562)) ([5dab761](https://github.com/taverns-red/toast-stats/commit/5dab761c062debdac2745bd487cbcf27c6e42b98))
* **clubs:** club-page Worldwide standing card + /methodology#club-race basis ([#1556](https://github.com/taverns-red/toast-stats/issues/1556), 4/4) ([#1564](https://github.com/taverns-red/toast-stats/issues/1564)) ([f42a422](https://github.com/taverns-red/toast-stats/commit/f42a422c6847d404943436ba1ccbda9f2827fc35))
* **clubs:** Coach column, filter, phone flag and CSV export ([#1954](https://github.com/taverns-red/toast-stats/issues/1954)) ([#1963](https://github.com/taverns-red/toast-stats/issues/1963)) ([0e84331](https://github.com/taverns-red/toast-stats/commit/0e843317fe6b9f030450f209d0526359f712825e))
* **clubs:** coach flag on phone MobileRowList rows ([#1968](https://github.com/taverns-red/toast-stats/issues/1968)) ([#1988](https://github.com/taverns-red/toast-stats/issues/1988)) ([d64d747](https://github.com/taverns-red/toast-stats/commit/d64d74748a5d58a9ba3c3f4b519c82bbda4addf4))
* **clubs:** district meeting-time heatmap ([#1796](https://github.com/taverns-red/toast-stats/issues/1796)) ([#2114](https://github.com/taverns-red/toast-stats/issues/2114)) ([f01cd3a](https://github.com/taverns-red/toast-stats/commit/f01cd3a7de402a9027110286cb5ed24e901f4dd7))
* **clubs:** membership-trend sparkline column, sortable by net change ([#1792](https://github.com/taverns-red/toast-stats/issues/1792)) ([#1930](https://github.com/taverns-red/toast-stats/issues/1930)) ([c455a31](https://github.com/taverns-red/toast-stats/commit/c455a31c92d7f2b6cfa6f9d16b5deeb1a3e4fdc0))
* **collector:** dated education ledger history backfill 2003-04 → 2018-19, staging only ([#1802](https://github.com/taverns-red/toast-stats/issues/1802)) ([#1908](https://github.com/taverns-red/toast-stats/issues/1908)) ([c62b07f](https://github.com/taverns-red/toast-stats/commit/c62b07fd6639a5515173e0ca83882ed8895ce245))
* district overview Club Success Plan completion line ([#1555](https://github.com/taverns-red/toast-stats/issues/1555), 4/4) ([#1563](https://github.com/taverns-red/toast-stats/issues/1563)) ([4be5745](https://github.com/taverns-red/toast-stats/commit/4be5745fc7c1ac9fb9fda690244619060c9a2e7a))
* **district:** retire the Analytics subpage; redirect to Clubs sorted by net change ([#2159](https://github.com/taverns-red/toast-stats/issues/2159)) ([#2163](https://github.com/taverns-red/toast-stats/issues/2163)) ([39796a0](https://github.com/taverns-red/toast-stats/commit/39796a0b51d2c9b7a994290a1e51b213c581ca6b))
* dual-shape reader for slim district analytics club lists ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#2046](https://github.com/taverns-red/toast-stats/issues/2046)) ([7f7b7b2](https://github.com/taverns-red/toast-stats/commit/7f7b7b26160c42348d0e61088b62f726992f3b59))
* **education:** /district/:id/education subpage — PYTD, ledger only ([#1793](https://github.com/taverns-red/toast-stats/issues/1793)) ([#2053](https://github.com/taverns-red/toast-stats/issues/2053)) ([287b882](https://github.com/taverns-red/toast-stats/commit/287b882c3c9fd7d64187f4cdfd08a21cec3c00d9))
* **frontend:** data-driven default program year — unblock release [#1253](https://github.com/taverns-red/toast-stats/issues/1253) ([#1300](https://github.com/taverns-red/toast-stats/issues/1300)) ([#1304](https://github.com/taverns-red/toast-stats/issues/1304)) ([e42675b](https://github.com/taverns-red/toast-stats/commit/e42675bee3937cdbfcd84bd7634921622caaf82d))
* **frontend:** filter the rankings table by Recognition ([#1362](https://github.com/taverns-red/toast-stats/issues/1362)) ([#1369](https://github.com/taverns-red/toast-stats/issues/1369)) ([9a13e1b](https://github.com/taverns-red/toast-stats/commit/9a13e1bc106a2328d86d2a6aead8435cfef8015c))
* **frontend:** normalize freshness pill on every page ([#1310](https://github.com/taverns-red/toast-stats/issues/1310)) ([#1311](https://github.com/taverns-red/toast-stats/issues/1311)) ([cd513f1](https://github.com/taverns-red/toast-stats/commit/cd513f1ed53d7686b94f27250756306ae7146c63))
* **frontend:** omni-search finds every district that has ever existed, landing each on its most recent year ([#1403](https://github.com/taverns-red/toast-stats/issues/1403)) ([#1404](https://github.com/taverns-red/toast-stats/issues/1404)) ([7e4b268](https://github.com/taverns-red/toast-stats/commit/7e4b268b3fdac5233f32b0b1ec1b4618e17fa61c))
* **frontend:** OR multi-select the region filter — plain click toggles ([#1374](https://github.com/taverns-red/toast-stats/issues/1374)) ([#1379](https://github.com/taverns-red/toast-stats/issues/1379)) ([1152d49](https://github.com/taverns-red/toast-stats/commit/1152d491a70b9db3fdb1adbd6ed835bf7596e905))
* **frontend:** PY selector on Division, Area, Club detail/history pages ([#1302](https://github.com/taverns-red/toast-stats/issues/1302)) ([#1308](https://github.com/taverns-red/toast-stats/issues/1308)) ([089c2f0](https://github.com/taverns-red/toast-stats/commit/089c2f0a4c4b80e3cccd40cf75ecaca4e7cb251c))
* **frontend:** PY selector on Regions, Region, and Awards pages ([#1301](https://github.com/taverns-red/toast-stats/issues/1301)) ([#1305](https://github.com/taverns-red/toast-stats/issues/1305)) ([cc6a19e](https://github.com/taverns-red/toast-stats/commit/cc6a19eb19eacdad9a34cf228ad9809279de1e8c))
* **frontend:** surface newCharteredClubs + a checkpoint-count resolution hook for Club Growth Achievement ([#1475](https://github.com/taverns-red/toast-stats/issues/1475)) () ([abc0af6](https://github.com/taverns-red/toast-stats/commit/abc0af67183af0e7a7099046e1bcdaf499499afd))
* **frontend:** the worldwide scoreboard extends /history + methodology definitions ([#1500](https://github.com/taverns-red/toast-stats/issues/1500)) ([#1513](https://github.com/taverns-red/toast-stats/issues/1513)) ([b24c3b5](https://github.com/taverns-red/toast-stats/commit/b24c3b56927aae51606c3e2dcf15f7df85231bae))
* **growth:** district Club Growth funnel — /district/:id/growth ([#1794](https://github.com/taverns-red/toast-stats/issues/1794)) ([#1948](https://github.com/taverns-red/toast-stats/issues/1948)) ([587f56a](https://github.com/taverns-red/toast-stats/commit/587f56adc88df7cafeda3dbc882bfbac46a36106))
* **growth:** list the clubs suspended this program year in the funnel ([#1794](https://github.com/taverns-red/toast-stats/issues/1794)) ([#2055](https://github.com/taverns-red/toast-stats/issues/2055)) ([1f1b4ad](https://github.com/taverns-red/toast-stats/commit/1f1b4ade65c380c309cfdbc9263c7413e1f738a8))
* **growth:** region and world Club Growth funnels ([#1812](https://github.com/taverns-red/toast-stats/issues/1812), [#1813](https://github.com/taverns-red/toast-stats/issues/1813)) ([#2140](https://github.com/taverns-red/toast-stats/issues/2140)) ([7d084de](https://github.com/taverns-red/toast-stats/commit/7d084de8793a3145ff8145f03ce2273469e660b9))
* **growth:** sponsor/mentor counts on the Club Growth funnel ([#1794](https://github.com/taverns-red/toast-stats/issues/1794)) ([#2065](https://github.com/taverns-red/toast-stats/issues/2065)) ([15686fc](https://github.com/taverns-red/toast-stats/commit/15686fce2c776a88dd48c0c59daa1b642175d962))
* isCspRequired rule + per-area/division Club Success Plan completion fields ([#1555](https://github.com/taverns-red/toast-stats/issues/1555), 1/4) ([#1557](https://github.com/taverns-red/toast-stats/issues/1557)) ([af2bf25](https://github.com/taverns-red/toast-stats/commit/af2bf2533567db27437a576f1aec3021a2bf00e9))
* **landing:** Club Growth Achievement badge on the rankings table ([#1537](https://github.com/taverns-red/toast-stats/issues/1537)) ([#1684](https://github.com/taverns-red/toast-stats/issues/1684)) ([b0b3dd3](https://github.com/taverns-red/toast-stats/commit/b0b3dd3db78d7dcc2db851834ffe921a6927a8cb))
* **map:** ?view=list uses the shared MobileRowList rows ([#1945](https://github.com/taverns-red/toast-stats/issues/1945)) ([#1964](https://github.com/taverns-red/toast-stats/issues/1964)) ([36bddd3](https://github.com/taverns-red/toast-stats/commit/36bddd33790353962f7ea0e3276b30dc4da72ae9))
* **map:** Arabic and Hebrew place names on self-hosted glyphs, no RTL plugin needed ([#2085](https://github.com/taverns-red/toast-stats/issues/2085)) ([#2116](https://github.com/taverns-red/toast-stats/issues/2116)) ([9564ed1](https://github.com/taverns-red/toast-stats/commit/9564ed17ac6944127d711b4e86efed98beef49d5))
* **map:** distinct division colours, area shades, uniform-colour clusters ([#2178](https://github.com/taverns-red/toast-stats/issues/2178)) ([#2179](https://github.com/taverns-red/toast-stats/issues/2179)) ([3d346c8](https://github.com/taverns-red/toast-stats/commit/3d346c8cbcb7858c593bd8e0a3a7d727fdbc884d))
* **map:** district club map — /district/:id/map with health/tier/division/area pins ([#1784](https://github.com/taverns-red/toast-stats/issues/1784)) ([#1925](https://github.com/taverns-red/toast-stats/issues/1925)) ([74f21e7](https://github.com/taverns-red/toast-stats/commit/74f21e77d219c58c762b8fe475e9594096049e65))
* **map:** Enter on a pin moves focus into the side panel ([#1967](https://github.com/taverns-red/toast-stats/issues/1967)) ([#1987](https://github.com/taverns-red/toast-stats/issues/1987)) ([534651d](https://github.com/taverns-red/toast-stats/commit/534651d8a0271b2203fd42c8611776245a10dfda))
* **map:** extended pin colour modes — status, members, growth, DCP, club age ([#1787](https://github.com/taverns-red/toast-stats/issues/1787)) ([#1972](https://github.com/taverns-red/toast-stats/issues/1972)) ([2345616](https://github.com/taverns-red/toast-stats/commit/2345616f8e0a61707aeb5a700a1c4a212737914e))
* **map:** hide online-only clubs' pins, online clubs chip, Meets online card ([#2174](https://github.com/taverns-red/toast-stats/issues/2174)) ([#2177](https://github.com/taverns-red/toast-stats/issues/2177)) ([c2cc070](https://github.com/taverns-red/toast-stats/commit/c2cc0709f4ee30677c35de6f60f61db6ac1d480e))
* **map:** keyboard navigation between map pins ([#1940](https://github.com/taverns-red/toast-stats/issues/1940)) ([#1966](https://github.com/taverns-red/toast-stats/issues/1966)) ([90e11f2](https://github.com/taverns-red/toast-stats/commit/90e11f22bdacf4dfacd357d571a19df6510a9447))
* **map:** labelled basemap context, zoom-banded, on self-hosted glyphs ([#2081](https://github.com/taverns-red/toast-stats/issues/2081)) ([#2082](https://github.com/taverns-red/toast-stats/issues/2082)) ([6f394ac](https://github.com/taverns-red/toast-stats/commit/6f394ac7682dff5422429f19e946a279406d68c5))
* **map:** meeting-day pin mode and Online only attendance ([#1787](https://github.com/taverns-red/toast-stats/issues/1787)) ([#2118](https://github.com/taverns-red/toast-stats/issues/2118)) ([ece55d6](https://github.com/taverns-red/toast-stats/commit/ece55d6e6a332cf9aeba2c03c1d136531d6dd1d9))
* **map:** realignment sandbox on the district map ([#1819](https://github.com/taverns-red/toast-stats/issues/1819)) ([#1951](https://github.com/taverns-red/toast-stats/issues/1951)) ([a68e450](https://github.com/taverns-red/toast-stats/commit/a68e450c8aa4ccfb783f50fe4dcc5e9e2ed74222))
* **map:** renewals, CSP, officer list, coach, awards and attendance pin modes ([#1787](https://github.com/taverns-red/toast-stats/issues/1787)) ([#2049](https://github.com/taverns-red/toast-stats/issues/2049)) ([f51b81b](https://github.com/taverns-red/toast-stats/commit/f51b81bd9649e24299ffca47eef103bed2466bda))
* **map:** self-hosted Protomaps PMTiles basemap groundwork + ADR-016 ([#1786](https://github.com/taverns-red/toast-stats/issues/1786)) ([#1919](https://github.com/taverns-red/toast-stats/issues/1919)) ([2e59344](https://github.com/taverns-red/toast-stats/commit/2e593440590aab4dd370fe4615e6ff119b7b7c89))
* **map:** teardrop pins with glyphs, overlap-only grouping, reset map view ([#2173](https://github.com/taverns-red/toast-stats/issues/2173)) ([#2176](https://github.com/taverns-red/toast-stats/issues/2176)) ([b3f6a30](https://github.com/taverns-red/toast-stats/commit/b3f6a303b88215eaebd2bb6e4cb2a80020b5f693))
* **map:** visit-round, online-capable, division/area filters + richer club summary ([#1788](https://github.com/taverns-red/toast-stats/issues/1788)) ([#1941](https://github.com/taverns-red/toast-stats/issues/1941)) ([b1e9061](https://github.com/taverns-red/toast-stats/commit/b1e90614c3a43272ccf184c10835028df4c38a2e))
* **map:** world z0–14 basemap with street names and a restrained POI set ([#2084](https://github.com/taverns-red/toast-stats/issues/2084), [#2081](https://github.com/taverns-red/toast-stats/issues/2081)) ([#2089](https://github.com/taverns-red/toast-stats/issues/2089)) ([3c01be5](https://github.com/taverns-red/toast-stats/commit/3c01be5d4a08065be599359a9d1437ff166b7dfb))
* **methodology:** a tracked log of program-year rule changes ([#1400](https://github.com/taverns-red/toast-stats/issues/1400)) ([#1407](https://github.com/taverns-red/toast-stats/issues/1407)) ([75606ed](https://github.com/taverns-red/toast-stats/commit/75606ed953b89480399d85e1c8fe87dfe9d567ed))
* **mobile:** action list and club mini-list use compact rows below 768 ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1871](https://github.com/taverns-red/toast-stats/issues/1871)) ([5261942](https://github.com/taverns-red/toast-stats/commit/5261942e30ebb95e182cc5c00eb12ab35b49560b))
* **mobile:** area page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1866](https://github.com/taverns-red/toast-stats/issues/1866)) ([1f4da98](https://github.com/taverns-red/toast-stats/commit/1f4da9879f77980f0e957ea65eba12f07f0c34be))
* **mobile:** bottom section bar — 4 routes + More sheet on district routes below 768 ([#1832](https://github.com/taverns-red/toast-stats/issues/1832)) ([#1864](https://github.com/taverns-red/toast-stats/issues/1864)) ([10a9376](https://github.com/taverns-red/toast-stats/commit/10a9376eed1411301537b5f463095e043e38d242))
* **mobile:** club grid — names on tap in a sheet, 44px tiles, 14px legend ([#1845](https://github.com/taverns-red/toast-stats/issues/1845)) ([#1902](https://github.com/taverns-red/toast-stats/issues/1902)) ([e05978b](https://github.com/taverns-red/toast-stats/commit/e05978b419b2ff6a2999eb35583e750f64b555f5))
* **mobile:** club history page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1868](https://github.com/taverns-red/toast-stats/issues/1868)) ([f6dd19f](https://github.com/taverns-red/toast-stats/commit/f6dd19fec0235d7f399b26c34063dd93f895a903))
* **mobile:** club page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1867](https://github.com/taverns-red/toast-stats/issues/1867)) ([fbda9f8](https://github.com/taverns-red/toast-stats/commit/fbda9f8737a030c169ec38e55af2498fe13a01f7))
* **mobile:** Clubs first row at 188px in phone landscape — toolbar in the context bar ([#1912](https://github.com/taverns-red/toast-stats/issues/1912)) ([#1923](https://github.com/taverns-red/toast-stats/issues/1923)) ([f9d97c3](https://github.com/taverns-red/toast-stats/commit/f9d97c3079a712a75bcf4a6b046260d8b50631c2))
* **mobile:** clubs-world bottom section bar — 3 routes + More below 768 ([#1832](https://github.com/taverns-red/toast-stats/issues/1832)) ([#1873](https://github.com/taverns-red/toast-stats/issues/1873)) ([11562cc](https://github.com/taverns-red/toast-stats/commit/11562cc74e10a70a470696bf55ed0073fb996349))
* **mobile:** clubs-world pages get the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1870](https://github.com/taverns-red/toast-stats/issues/1870)) ([1512937](https://github.com/taverns-red/toast-stats/commit/151293771b1a2a588b1d4de64fc54a288383ac32))
* **mobile:** district Overview hub below 768 — 2x2 KPI tiles, Needs attention, sections as rows ([#1842](https://github.com/taverns-red/toast-stats/issues/1842)) ([#1893](https://github.com/taverns-red/toast-stats/issues/1893)) ([ea9bab4](https://github.com/taverns-red/toast-stats/commit/ea9bab453d70d78228852ae06d483f86dbba9e75))
* **mobile:** division page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1863](https://github.com/taverns-red/toast-stats/issues/1863)) ([74e0dd5](https://github.com/taverns-red/toast-stats/commit/74e0dd5565576a7d1eac67e7116e688a98888214))
* **mobile:** divisions list as compact rows below 768 ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1861](https://github.com/taverns-red/toast-stats/issues/1861)) ([670a89a](https://github.com/taverns-red/toast-stats/commit/670a89a8c0e68b67df0a8fe1ca8f501a269c7a2e))
* **mobile:** landing first screen — search first, orientation in the context sheet, edge-aware chip fades ([#1846](https://github.com/taverns-red/toast-stats/issues/1846)) ([#1909](https://github.com/taverns-red/toast-stats/issues/1909)) ([984fa73](https://github.com/taverns-red/toast-stats/commit/984fa73cf4497e6bae4ac856c635ea82a7131d9f))
* **mobile:** landing rankings use priority columns; retire MOBILE_RANKINGS_CAP ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1883](https://github.com/taverns-red/toast-stats/issues/1883)) ([4a8e8c8](https://github.com/taverns-red/toast-stats/commit/4a8e8c85b2da775a340060651343b5843a9d554a))
* **mobile:** MobileRowList + grouped clubs list below 768 ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1859](https://github.com/taverns-red/toast-stats/issues/1859)) ([d53375a](https://github.com/taverns-red/toast-stats/commit/d53375ab16709ec9249699bd00d1a11e36661adb))
* **mobile:** one-row phone toolbar on the clubs list — trigger beside search, preset in the sheet ([#1836](https://github.com/taverns-red/toast-stats/issues/1836)) ([#1876](https://github.com/taverns-red/toast-stats/issues/1876)) ([e5f2014](https://github.com/taverns-red/toast-stats/commit/e5f20142aefe44a808689e446359f1a0fd660ff8))
* **mobile:** phone context bar + bottom sheet replace the district header stack below 768 ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1860](https://github.com/taverns-red/toast-stats/issues/1860)) ([8c58183](https://github.com/taverns-red/toast-stats/commit/8c58183146e1d3ca01d0eac5c596232f8e8c28b9))
* **mobile:** phone rankings reveal 25 at a time (?rows=, ?district= pin); landing budget in CI ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1887](https://github.com/taverns-red/toast-stats/issues/1887)) ([a2fdcec](https://github.com/taverns-red/toast-stats/commit/a2fdcec87dea28c879dad97f06e9d622701294c6))
* **mobile:** priority columns on history worldwide, club history, regions leaderboard ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1877](https://github.com/taverns-red/toast-stats/issues/1877)) ([af34dfd](https://github.com/taverns-red/toast-stats/commit/af34dfdfa4e935cd0c5f451090ac302dc41272ac))
* **mobile:** priority columns on the Division/Area area table ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1881](https://github.com/taverns-red/toast-stats/issues/1881)) ([c7642f6](https://github.com/taverns-red/toast-stats/commit/c7642f660b08ef887237b9557706e7c32b49d1f3))
* **mobile:** PriorityColumnsTable primitive + region table adoption ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1875](https://github.com/taverns-red/toast-stats/issues/1875)) ([526d76a](https://github.com/taverns-red/toast-stats/commit/526d76a1f20f241e73092e27016d41d451e4c97d))
* **mobile:** progress summary collapses per division below 768 ([#1862](https://github.com/taverns-red/toast-stats/issues/1862)) ([#1865](https://github.com/taverns-red/toast-stats/issues/1865)) ([2f660ac](https://github.com/taverns-red/toast-stats/commit/2f660ac43f37ef95facb14c78c8b8bf81c452100))
* **mobile:** race table uses compact rows below 768 ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1872](https://github.com/taverns-red/toast-stats/issues/1872)) ([33f5add](https://github.com/taverns-red/toast-stats/commit/33f5add2a2955b723cebdcf8d1c19ead38e20ca0))
* **mobile:** region page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1869](https://github.com/taverns-red/toast-stats/issues/1869)) ([4c970bc](https://github.com/taverns-red/toast-stats/commit/4c970bc45db541d352a0c73b8be64a7209621354))
* **mobile:** safe-area + landscape — viewport-fit=cover, inset-padded chrome, dvh sheets, phone chrome in landscape ([#1847](https://github.com/taverns-red/toast-stats/issues/1847)) ([#1907](https://github.com/taverns-red/toast-stats/issues/1907)) ([3f00a94](https://github.com/taverns-red/toast-stats/commit/3f00a947a4935d706c226ce221327e2062f0391e))
* **mobile:** shared Filter & sort bottom sheet, adopted on the clubs list ([#1836](https://github.com/taverns-red/toast-stats/issues/1836)) ([#1874](https://github.com/taverns-red/toast-stats/issues/1874)) ([033122f](https://github.com/taverns-red/toast-stats/commit/033122f421aa0faca15ef68a864b334c56a77dee))
* **pipeline:** date-exact club-district change points ([#1816](https://github.com/taverns-red/toast-stats/issues/1816)) ([#2135](https://github.com/taverns-red/toast-stats/issues/2135)) ([03fd650](https://github.com/taverns-red/toast-stats/commit/03fd65083a3578620380b89992cfcbee2ac28c5e))
* **pipeline:** education rollup from the ledger — district, region, world per PY ([#1801](https://github.com/taverns-red/toast-stats/issues/1801)) ([#1973](https://github.com/taverns-red/toast-stats/issues/1973)) ([aa7bb5b](https://github.com/taverns-red/toast-stats/commit/aa7bb5bd4e0c61199ea15351418828b32fad66b9))
* **pipeline:** snapshots/{date}/global-totals.json — the per-date worldwide rollup ([#1498](https://github.com/taverns-red/toast-stats/issues/1498)) ([#1509](https://github.com/taverns-red/toast-stats/issues/1509)) ([b7fdeb3](https://github.com/taverns-red/toast-stats/commit/b7fdeb3ab99a406a6a7e37687d1eb2a829712941))
* **pipeline:** snapshots/&lt;date&gt;/reports-rollups.json — reports-derived region/world rollups ([#2012](https://github.com/taverns-red/toast-stats/issues/2012)) ([#2117](https://github.com/taverns-red/toast-stats/issues/2117)) ([bef7d98](https://github.com/taverns-red/toast-stats/commit/bef7d98b93fb8f6a1f87976217093f37c9e971c5))
* **preview:** read PR preview data through the compressing staging CDN ([#2003](https://github.com/taverns-red/toast-stats/issues/2003)) ([#2004](https://github.com/taverns-red/toast-stats/issues/2004)) ([1880ce8](https://github.com/taverns-red/toast-stats/commit/1880ce8f44bd9f713cfbe60fc0a7e0af6eed836d))
* **promo:** promote Red Vote on district-level pages ([#2090](https://github.com/taverns-red/toast-stats/issues/2090)) ([#2091](https://github.com/taverns-red/toast-stats/issues/2091)) ([a6e8bd9](https://github.com/taverns-red/toast-stats/commit/a6e8bd9fcfdaadc14b448fcee6b22b927a28dfb2))
* **promo:** show the Red Vote card on phone district pages ([#2090](https://github.com/taverns-red/toast-stats/issues/2090)) ([#2094](https://github.com/taverns-red/toast-stats/issues/2094)) ([306127f](https://github.com/taverns-red/toast-stats/commit/306127f1433ecac7bebf2cf3968d8af083461dfd))
* **recognition:** Club Growth Achievement predicate (PY-gated) + program-year rule-change log entry ([#1474](https://github.com/taverns-red/toast-stats/issues/1474)) () ([e1489b7](https://github.com/taverns-red/toast-stats/commit/e1489b7198ff63081d5a0c30b866b967d817652a))
* **recognition:** register the District Club Growth Achievement ([#1537](https://github.com/taverns-red/toast-stats/issues/1537)) ([#1679](https://github.com/taverns-red/toast-stats/issues/1679)) ([1d8857f](https://github.com/taverns-red/toast-stats/commit/1d8857fca4be9cb29bd735fc3070b18df3dc6f0c))
* **region,world:** health, status and compliance rollup subpages + region districts sparkline ([#1815](https://github.com/taverns-red/toast-stats/issues/1815)) ([#2123](https://github.com/taverns-red/toast-stats/issues/2123)) ([538e03b](https://github.com/taverns-red/toast-stats/commit/538e03b78626d3b54dff4f078263c0fd904a8479))
* **region:** /region/:n/education + mirror the education rollup into prod ([#1810](https://github.com/taverns-red/toast-stats/issues/1810)) ([#2139](https://github.com/taverns-red/toast-stats/issues/2139)) ([d61ac4a](https://github.com/taverns-red/toast-stats/commit/d61ac4a091924e4c652b4bf54f82badd881e0f5c))
* **region:** region and world membership series for /regions sparklines ([#2127](https://github.com/taverns-red/toast-stats/issues/2127)) ([#2134](https://github.com/taverns-red/toast-stats/issues/2134)) ([7157287](https://github.com/taverns-red/toast-stats/commit/71572878b5ff1f880134c10b342404cc907a8515))
* **region:** region club explorer — /region/:n/map ([#1808](https://github.com/taverns-red/toast-stats/issues/1808)) ([#2137](https://github.com/taverns-red/toast-stats/issues/2137)) ([8d7565b](https://github.com/taverns-red/toast-stats/commit/8d7565bb83d8f6257ad9fb7356b4facdde53ae9d))
* **search:** closed clubs searchable by name — pipeline closed-club name index ([#2062](https://github.com/taverns-red/toast-stats/issues/2062)) ([#2122](https://github.com/taverns-red/toast-stats/issues/2122)) ([68fba06](https://github.com/taverns-red/toast-stats/commit/68fba061a12530e4b06b5d230fae60fddfa2db06))
* **survival:** /district/:id/growth/survival — charter cohort survival curves ([#1817](https://github.com/taverns-red/toast-stats/issues/1817)) ([#2059](https://github.com/taverns-red/toast-stats/issues/2059)) ([80da12f](https://github.com/taverns-red/toast-stats/commit/80da12ffe9e4464a1cebe38fa668a1250b746c36))
* **survival:** charter cohort survival at region and world level ([#1818](https://github.com/taverns-red/toast-stats/issues/1818)) ([#2138](https://github.com/taverns-red/toast-stats/issues/2138)) ([0c220d9](https://github.com/taverns-red/toast-stats/commit/0c220d9779c87dff4ca20d3748b4cc18338aa2c6))
* **trends:** membership trend spans the whole program year against prior years ([#1705](https://github.com/taverns-red/toast-stats/issues/1705)) ([#1937](https://github.com/taverns-red/toast-stats/issues/1937)) ([a3dd754](https://github.com/taverns-red/toast-stats/commit/a3dd754323907100b6a22004f80dc8b8a7946e0c))
* **ui:** Club Growth Achievement card on the District Overview ([#1476](https://github.com/taverns-red/toast-stats/issues/1476)) ([#1487](https://github.com/taverns-red/toast-stats/issues/1487)) ([186255a](https://github.com/taverns-red/toast-stats/commit/186255aaa78598e8c42f306fa456a87a4f8c69f8))
* **whats-changed:** Club Success Plan submission events in the change feed ([#1460](https://github.com/taverns-red/toast-stats/issues/1460)) ([#1494](https://github.com/taverns-red/toast-stats/issues/1494)) ([8e339e5](https://github.com/taverns-red/toast-stats/commit/8e339e5d25e023eef60c2755440c1fc15aebee78))
* **whats-changed:** CSV export on the What's Changed page, with a change-events section ([#1461](https://github.com/taverns-red/toast-stats/issues/1461)) ([#1492](https://github.com/taverns-red/toast-stats/issues/1492)) ([0d27d71](https://github.com/taverns-red/toast-stats/commit/0d27d71921802572f4a9ab262da95c5c769e82a7))
* **whats-changed:** per-club payment events with payment-type attribution ([#1459](https://github.com/taverns-red/toast-stats/issues/1459)) ([#1485](https://github.com/taverns-red/toast-stats/issues/1485)) ([b4a029f](https://github.com/taverns-red/toast-stats/commit/b4a029f2b4fdd14b0362c25b3a170bbd96f716ce))
* **whats-changed:** signed net-delta summaries in change-group headings ([#1463](https://github.com/taverns-red/toast-stats/issues/1463)) ([#1493](https://github.com/taverns-red/toast-stats/issues/1493)) ([d28e289](https://github.com/taverns-red/toast-stats/commit/d28e289e5b191fea748056a889e530d5787f8f7b))
* **whats-changed:** time-window preset chips for the date pair picker ([#1462](https://github.com/taverns-red/toast-stats/issues/1462)) ([#1486](https://github.com/taverns-red/toast-stats/issues/1486)) ([a7a7a87](https://github.com/taverns-red/toast-stats/commit/a7a7a87c3363d87ae7bec60270f1fe88676266f3))
* **world:** worldwide country choropleth on /history/countries ([#1797](https://github.com/taverns-red/toast-stats/issues/1797)) ([#1935](https://github.com/taverns-red/toast-stats/issues/1935)) ([be9b2ea](https://github.com/taverns-red/toast-stats/commit/be9b2eabc7585f2f2fd41e47fdb624ab7708dda6))


### Bug Fixes

* **a11y:** 16px form-control floor on touch landscape phones ([#2018](https://github.com/taverns-red/toast-stats/issues/2018)) ([#2021](https://github.com/taverns-red/toast-stats/issues/2021)) ([dd40ac1](https://github.com/taverns-red/toast-stats/commit/dd40ac185af803d55fefeb23a1933ccc7000ca2d))
* **a11y:** 44px header search and footer links on touch landscape ([#2017](https://github.com/taverns-red/toast-stats/issues/2017)) ([#2019](https://github.com/taverns-red/toast-stats/issues/2019)) ([ab8d4af](https://github.com/taverns-red/toast-stats/commit/ab8d4af5836972d335fd8b768c5c1eeea4e084b9))
* **a11y:** AA contrast for chart legends and the dark projected pill at 768/1280 ([#1904](https://github.com/taverns-red/toast-stats/issues/1904)) ([#1914](https://github.com/taverns-red/toast-stats/issues/1914)) ([38b4236](https://github.com/taverns-red/toast-stats/commit/38b4236b2d5e4380d7fac5b06f09ee93f3bc50ef))
* **a11y:** clear AA on district pages in both themes ([#1660](https://github.com/taverns-red/toast-stats/issues/1660)) ([#1661](https://github.com/taverns-red/toast-stats/issues/1661)) ([f12996f](https://github.com/taverns-red/toast-stats/commit/f12996ff9713cd7111abfffe03b6e31487d343b6))
* **a11y:** clear every axe violation on the landing page ([#1360](https://github.com/taverns-red/toast-stats/issues/1360)) ([#1382](https://github.com/taverns-red/toast-stats/issues/1382)) ([ec97c30](https://github.com/taverns-red/toast-stats/commit/ec97c30d2681e15dc5b3d14ae5b9ef7545932513))
* **a11y:** club timeline note + footer link clear AA ([#1648](https://github.com/taverns-red/toast-stats/issues/1648)) ([#1654](https://github.com/taverns-red/toast-stats/issues/1654)) ([c2f3a8d](https://github.com/taverns-red/toast-stats/commit/c2f3a8dc41b266d1a8660dba0c4f454910caa1e0))
* **a11y:** composition bar counts clear AA in light mode ([#1652](https://github.com/taverns-red/toast-stats/issues/1652)) ([#1659](https://github.com/taverns-red/toast-stats/issues/1659)) ([0450656](https://github.com/taverns-red/toast-stats/commit/0450656071096af0297f41f1e4934a8f450deb18))
* **analytics:** a known reformation boundary is the evidence a realignment happened, not the roster's size ([#1470](https://github.com/taverns-red/toast-stats/issues/1470)) ([#1507](https://github.com/taverns-red/toast-stats/issues/1507)) ([2e552d0](https://github.com/taverns-red/toast-stats/commit/2e552d04f2130a13b1d30ce02560b13ce23442e4))
* **analytics:** DCP goals 2-3 read 0 for PY 2026-27 — resolve TI's 'or EOM' column rename ([#1399](https://github.com/taverns-red/toast-stats/issues/1399)) ([#1402](https://github.com/taverns-red/toast-stats/issues/1402)) ([f7ac01e](https://github.com/taverns-red/toast-stats/commit/f7ac01eeb0bfe7e18d34bce9363206294daaea8a))
* **analytics:** DCP goals 5-6 unreadable for five program years — restore the 2020-07 → 2025-06 header aliases ([#1539](https://github.com/taverns-red/toast-stats/issues/1539)) ([#1546](https://github.com/taverns-red/toast-stats/issues/1546)) ([f6b0efa](https://github.com/taverns-red/toast-stats/commit/f6b0efadf7c769c11777446cd22ec945eb91ae35))
* **analytics:** one GA page_view per load and per SPA navigation ([#1946](https://github.com/taverns-red/toast-stats/issues/1946)) ([#1949](https://github.com/taverns-red/toast-stats/issues/1949)) ([c420644](https://github.com/taverns-red/toast-stats/commit/c42064443fd49a2d37cfa53bbf3a65f54b8d1196))
* **analytics:** resolve club recognition tiers per program year — Smedley is unreachable before PY 2025-26 ([#1406](https://github.com/taverns-red/toast-stats/issues/1406)) ([#1409](https://github.com/taverns-red/toast-stats/issues/1409)) ([d77c9db](https://github.com/taverns-red/toast-stats/commit/d77c9dbdf0f9a2e357313b1a5b63896d0197b6cb))
* **awards:** count only active clubs in the 20-Plus numerator ([#1611](https://github.com/taverns-red/toast-stats/issues/1611)) ([#1633](https://github.com/taverns-red/toast-stats/issues/1633)) ([2a6bdc2](https://github.com/taverns-red/toast-stats/commit/2a6bdc2eb246cd4ed96448547c8c55266241d5a3))
* **awards:** exclude undistricted 'U' from Club Strength; note its 1490 removal ([#1613](https://github.com/taverns-red/toast-stats/issues/1613)) ([#1629](https://github.com/taverns-red/toast-stats/issues/1629)) ([2f6d607](https://github.com/taverns-red/toast-stats/commit/2f6d6078de11fe53b8f2183f3487b7fa0aa256e1))
* **awards:** label tied Top-3 co-winners honestly ([#1610](https://github.com/taverns-red/toast-stats/issues/1610)) ([#1624](https://github.com/taverns-red/toast-stats/issues/1624)) ([46051bd](https://github.com/taverns-red/toast-stats/commit/46051bd5d83d950bb004b4a3f2ebd247a68949a9))
* **awards:** Leadership Excellence — no future-PY leak, award year counts, on track mid-year ([#1609](https://github.com/taverns-red/toast-stats/issues/1609)) ([#1635](https://github.com/taverns-red/toast-stats/issues/1635)) ([c66dbcc](https://github.com/taverns-red/toast-stats/commit/c66dbcc62547d1f89097098dfb5c03571dba7bd7))
* **awards:** scope June-close charter/suspension counts to the logical snapshot date ([#1622](https://github.com/taverns-red/toast-stats/issues/1622)) ([#1625](https://github.com/taverns-red/toast-stats/issues/1625)) ([e029fa7](https://github.com/taverns-red/toast-stats/commit/e029fa7d24fa46788fdce34a3ffb3f56f2997f1d))
* **cls:** division/area pages keep their chrome while loading ([#1896](https://github.com/taverns-red/toast-stats/issues/1896)) ([#1915](https://github.com/taverns-red/toast-stats/issues/1915)) ([7fb331b](https://github.com/taverns-red/toast-stats/commit/7fb331b6e28a71bc4a26c94bd2822df6e9ef8f92))
* **cls:** reserve district subpage data slots + CLS gate on every subpage ([#1837](https://github.com/taverns-red/toast-stats/issues/1837)) ([#1897](https://github.com/taverns-red/toast-stats/issues/1897)) ([4bc8efe](https://github.com/taverns-red/toast-stats/commit/4bc8efedb902c49a42df031ec17bdd00235b994f))
* **club:** lifecycle panel waits for a shard read that has not started ([#2076](https://github.com/taverns-red/toast-stats/issues/2076)) ([#2077](https://github.com/taverns-red/toast-stats/issues/2077)) ([1af2f08](https://github.com/taverns-red/toast-stats/commit/1af2f08e4c868cf602bbc44fa8074cff3f144f17))
* **clubs:** apply a verified renewal only within the dues period it pays for ([#1586](https://github.com/taverns-red/toast-stats/issues/1586)) ([#1587](https://github.com/taverns-red/toast-stats/issues/1587)) ([6282da2](https://github.com/taverns-red/toast-stats/commit/6282da27b1c880ba1b148e4fe79cc2f441d2d3c5))
* **clubs:** count each club once at its top tier; stack the pack chart ([#1570](https://github.com/taverns-red/toast-stats/issues/1570)) ([#1573](https://github.com/taverns-red/toast-stats/issues/1573)) ([ac5fa9d](https://github.com/taverns-red/toast-stats/commit/ac5fa9d061467121edfecc0f4af71bdd0c8d6b3f))
* **clubs:** dark-mode tier chart fills clear 3:1 ([#1636](https://github.com/taverns-red/toast-stats/issues/1636)) ([#1641](https://github.com/taverns-red/toast-stats/issues/1641)) ([91c84e5](https://github.com/taverns-red/toast-stats/commit/91c84e590385aaa9462fcb1be61b82ee4f99c02f))
* **clubs:** loading skeleton instead of false empty state while dates load ([#1999](https://github.com/taverns-red/toast-stats/issues/1999)) ([#2031](https://github.com/taverns-red/toast-stats/issues/2031)) ([7442c13](https://github.com/taverns-red/toast-stats/commit/7442c133e906bac9fb1f922b87a00e68aeeaf75b))
* **clubs:** pass coach and club status to the clubs CSV export ([#1978](https://github.com/taverns-red/toast-stats/issues/1978)) ([#1981](https://github.com/taverns-red/toast-stats/issues/1981)) ([0541650](https://github.com/taverns-red/toast-stats/commit/0541650c403f70349bcc5bea418f4abe3e63c8d1))
* **clubs:** podium district chip renders as a compact pill ([#1617](https://github.com/taverns-red/toast-stats/issues/1617)) ([#1634](https://github.com/taverns-red/toast-stats/issues/1634)) ([19ae5d8](https://github.com/taverns-red/toast-stats/commit/19ae5d82e25b31916ee1aa67ccbb9cf34aeee1eb))
* **clubs:** race chart legend text in neutral ink ([#1616](https://github.com/taverns-red/toast-stats/issues/1616)) ([#1630](https://github.com/taverns-red/toast-stats/issues/1630)) ([576f8a9](https://github.com/taverns-red/toast-stats/commit/576f8a90364b6f604bc17b23d3a9d3b1469ef559))
* **clubs:** restyle /clubs on legacy chrome tokens ([#1606](https://github.com/taverns-red/toast-stats/issues/1606)) ([#1607](https://github.com/taverns-red/toast-stats/issues/1607)) ([220703d](https://github.com/taverns-red/toast-stats/commit/220703dfcdf07e08504db3f3857dc2275fe8e4c6))
* **club:** the club-district history decides the PY's district ([#2079](https://github.com/taverns-red/toast-stats/issues/2079)) ([#2136](https://github.com/taverns-red/toast-stats/issues/2136)) ([ac13927](https://github.com/taverns-red/toast-stats/commit/ac1392778a0055238940cc737b0e8e3b92847f47))
* **collector:** count education-award members only for counted awards ([#1599](https://github.com/taverns-red/toast-stats/issues/1599)) ([#1600](https://github.com/taverns-red/toast-stats/issues/1600)) ([9abaae2](https://github.com/taverns-red/toast-stats/commit/9abaae2c859e7ac0548a3f3a848f0bf23cc33c87))
* **coords:** treat FAC's (0, 0) sentinel as no coordinates, one shared rule ([#2153](https://github.com/taverns-red/toast-stats/issues/2153)) ([#2156](https://github.com/taverns-red/toast-stats/issues/2156)) ([feeae86](https://github.com/taverns-red/toast-stats/commit/feeae86e446338450938365436a7fb2556a2abd6))
* **csp:** per-club Club Success Plan due dates and deadline-aware copy ([#1565](https://github.com/taverns-red/toast-stats/issues/1565)) ([#1567](https://github.com/taverns-red/toast-stats/issues/1567)) ([d32d7b0](https://github.com/taverns-red/toast-stats/commit/d32d7b05b5e35f77195767c71fc791b379ec2cad))
* **dark-mode:** recolour the first divide-y divider too ([#1370](https://github.com/taverns-red/toast-stats/issues/1370)); pin the lessons-index locale ([#1372](https://github.com/taverns-red/toast-stats/issues/1372)) ([#1371](https://github.com/taverns-red/toast-stats/issues/1371)) ([df9ae67](https://github.com/taverns-red/toast-stats/commit/df9ae6795760f9cfbb4574975fc183ac18e092fe))
* **district:** header subtitle describes the page it is on ([#2161](https://github.com/taverns-red/toast-stats/issues/2161)) ([#2164](https://github.com/taverns-red/toast-stats/issues/2164)) ([b294e8a](https://github.com/taverns-red/toast-stats/commit/b294e8a070959b73f3483f13ead5ce839be527d9))
* **district:** KPI strip waits for performance targets, fixing the flaky 1350px CLS ([#1685](https://github.com/taverns-red/toast-stats/issues/1685)) ([#1686](https://github.com/taverns-red/toast-stats/issues/1686)) ([9f622c0](https://github.com/taverns-red/toast-stats/commit/9f622c07ac75b9b159df35db4fbec85be4e19b4f))
* **district:** no horizontal scroll on /district/:id at 375/768 ([#1655](https://github.com/taverns-red/toast-stats/issues/1655)) ([#1663](https://github.com/taverns-red/toast-stats/issues/1663)) ([524ab1a](https://github.com/taverns-red/toast-stats/commit/524ab1aa2b2bc8b84ad113c63d199736389a4d76))
* **e2e:** measure map filter chips after the sheet settles ([#1984](https://github.com/taverns-red/toast-stats/issues/1984)) ([#1985](https://github.com/taverns-red/toast-stats/issues/1985)) ([46e3bfe](https://github.com/taverns-red/toast-stats/commit/46e3bfee94c4c74eff0a4411cf5a1896142e9032))
* **e2e:** measure the map panel heading after the scroll settles ([#1993](https://github.com/taverns-red/toast-stats/issues/1993)) ([#1997](https://github.com/taverns-red/toast-stats/issues/1997)) ([94b0980](https://github.com/taverns-red/toast-stats/commit/94b0980c23732ba2723fb22431831e098d4ea10a))
* **e2e:** require BASE_URL for Playwright smokes ([#2010](https://github.com/taverns-red/toast-stats/issues/2010)) ([#2011](https://github.com/taverns-red/toast-stats/issues/2011)) ([73c1375](https://github.com/taverns-red/toast-stats/commit/73c137539ced22db8cfcb7dcd3d2f075cc222e61))
* **education:** count the CES vintage path in the leaderboards — one Pathways vocabulary ([#1976](https://github.com/taverns-red/toast-stats/issues/1976)) ([#1980](https://github.com/taverns-red/toast-stats/issues/1980)) ([1aefc96](https://github.com/taverns-red/toast-stats/commit/1aefc9677ba75755959682a380f59bdbe09f580a))
* every page defaults to the data-resolved program year ([#1618](https://github.com/taverns-red/toast-stats/issues/1618)) ([#1627](https://github.com/taverns-red/toast-stats/issues/1627)) ([f78ad8a](https://github.com/taverns-red/toast-stats/commit/f78ad8a8c8a3e3336b959eabf797e96eeca8e0d5))
* **frontend:** a club that moved districts no longer dead-ends on its old-district URL ([#1441](https://github.com/taverns-red/toast-stats/issues/1441)) ([#1445](https://github.com/taverns-red/toast-stats/issues/1445)) ([0a7d009](https://github.com/taverns-red/toast-stats/commit/0a7d009ea0b9789d6da56b6333c11836bdd9c271))
* **frontend:** classify distinguished word forms by substring ([#1431](https://github.com/taverns-red/toast-stats/issues/1431)) ([#1433](https://github.com/taverns-red/toast-stats/issues/1433)) ([cec5e54](https://github.com/taverns-red/toast-stats/commit/cec5e5429b395bb844a812fb949714ba2940af10))
* **frontend:** club history is keyed on the club number, and every skipped year says why ([#1437](https://github.com/taverns-red/toast-stats/issues/1437)) ([#1446](https://github.com/taverns-red/toast-stats/issues/1446)) ([4c30e85](https://github.com/taverns-red/toast-stats/commit/4c30e8590c7ddb262fb996b995899d0671b097be))
* **frontend:** give the degraded district view a program-year selector ([#1436](https://github.com/taverns-red/toast-stats/issues/1436)) ([#1444](https://github.com/taverns-red/toast-stats/issues/1444)) ([e2160d5](https://github.com/taverns-red/toast-stats/commit/e2160d5abc2523654a2bb9c8a01bd6c052896844))
* **frontend:** guard browser storage so the app renders when storage is blocked ([#1646](https://github.com/taverns-red/toast-stats/issues/1646)) ([#1653](https://github.com/taverns-red/toast-stats/issues/1653)) ([aba37c0](https://github.com/taverns-red/toast-stats/commit/aba37c0bb7c69d119d287d443ea8eeeb433d6c79))
* **frontend:** NaN program year ([#1353](https://github.com/taverns-red/toast-stats/issues/1353)), year-driven DD checklist ([#1354](https://github.com/taverns-red/toast-stats/issues/1354)), contact path ([#1356](https://github.com/taverns-red/toast-stats/issues/1356)), 640px column dead zone ([#1358](https://github.com/taverns-red/toast-stats/issues/1358)), landing CLS 0.265 → 0.004 ([#1359](https://github.com/taverns-red/toast-stats/issues/1359)) ([#1357](https://github.com/taverns-red/toast-stats/issues/1357)) ([50d858f](https://github.com/taverns-red/toast-stats/commit/50d858fdf7a8920715aba286c2f2e2708041151b))
* **frontend:** Payment Composition + trophy-case integers follow the selected program year ([#1396](https://github.com/taverns-red/toast-stats/issues/1396)) ([#1397](https://github.com/taverns-red/toast-stats/issues/1397)) ([5e032ca](https://github.com/taverns-red/toast-stats/commit/5e032caf02185ae8aa4d1720460f662a8894c613))
* **frontend:** the browsable district list follows the displayed program year ([#1398](https://github.com/taverns-red/toast-stats/issues/1398)) ([#1401](https://github.com/taverns-red/toast-stats/issues/1401)) ([8c9d10a](https://github.com/taverns-red/toast-stats/commit/8c9d10a29929327dfbfee96706e1bd06b30cfcc4))
* **global-totals:** state a gap district left out of the world sums ([#2042](https://github.com/taverns-red/toast-stats/issues/2042)) ([#2050](https://github.com/taverns-red/toast-stats/issues/2050)) ([5620f1f](https://github.com/taverns-red/toast-stats/commit/5620f1fb5b897ddfc65b4bb99d1574a11cefd3f9))
* July program-year rollover — resolve active PY by data + de-couple tests from the clock ([#1284](https://github.com/taverns-red/toast-stats/issues/1284), [#1285](https://github.com/taverns-red/toast-stats/issues/1285)) ([#1286](https://github.com/taverns-red/toast-stats/issues/1286)) ([982f045](https://github.com/taverns-red/toast-stats/commit/982f0450d41c5577c315c1c7a6c61881a96ba5a1))
* **landing:** stack the tablet header, keep nav links on one line ([#1917](https://github.com/taverns-red/toast-stats/issues/1917)) ([#1931](https://github.com/taverns-red/toast-stats/issues/1931)) ([0050a65](https://github.com/taverns-red/toast-stats/commit/0050a65cc15c40a85d52607899288d08311ad666))
* **map:** 44px tap targets for the basemap credit links ([#1944](https://github.com/taverns-red/toast-stats/issues/1944)) ([#1961](https://github.com/taverns-red/toast-stats/issues/1961)) ([f44ceed](https://github.com/taverns-red/toast-stats/commit/f44ceede7329fa866acaf99aa05104023ff240a5))
* **map:** city labels step clear of large pin clusters ([#2092](https://github.com/taverns-red/toast-stats/issues/2092)) ([#2111](https://github.com/taverns-red/toast-stats/issues/2111)) ([c120c06](https://github.com/taverns-red/toast-stats/commit/c120c06329808a6a5855f0cc1e58bfe2a6ee54b4))
* **map:** pin outline and halo use the app palette ([#2087](https://github.com/taverns-red/toast-stats/issues/2087)) ([#2113](https://github.com/taverns-red/toast-stats/issues/2113)) ([ba231de](https://github.com/taverns-red/toast-stats/commit/ba231dea472a6ed3e4732588a60827f3bc5bc927))
* **map:** realign area select honours the 44 px floor in WebKit ([#1974](https://github.com/taverns-red/toast-stats/issues/1974)) ([#1983](https://github.com/taverns-red/toast-stats/issues/1983)) ([8b08fad](https://github.com/taverns-red/toast-stats/commit/8b08fad535a2f584d05899ac9af19835b71b9712))
* **map:** render 24-hour meeting times without an am/pm suffix ([#1958](https://github.com/taverns-red/toast-stats/issues/1958)) ([#1959](https://github.com/taverns-red/toast-stats/issues/1959)) ([881eaf9](https://github.com/taverns-red/toast-stats/commit/881eaf9e7a2cd0d92450095d38598100d9da5e2b))
* **mobile:** ≥44px row/heading links and AA contrast fixes ([#1839](https://github.com/taverns-red/toast-stats/issues/1839)) ([#1894](https://github.com/taverns-red/toast-stats/issues/1894)) ([d4baa1c](https://github.com/taverns-red/toast-stats/commit/d4baa1c8f045534a854b444304905fe7224c980e))
* **mobile:** district KPI strip in flow below 768, never pinned over the Overview ([#1828](https://github.com/taverns-red/toast-stats/issues/1828)) ([#1848](https://github.com/taverns-red/toast-stats/issues/1848)) ([024e114](https://github.com/taverns-red/toast-stats/commit/024e11427f0fe17f18125522de1be03587001043))
* **mobile:** district KPI strip pins only from 1024, in flow on tablets ([#1828](https://github.com/taverns-red/toast-stats/issues/1828)) ([#1857](https://github.com/taverns-red/toast-stats/issues/1857)) ([826e529](https://github.com/taverns-red/toast-stats/commit/826e529e0897268e1f20284f8a9f2eccc61d3e9b))
* **mobile:** drop the phone Overview Sections list; fix double-active bottom bar ([#2093](https://github.com/taverns-red/toast-stats/issues/2093)) ([#2095](https://github.com/taverns-red/toast-stats/issues/2095)) ([ebabdad](https://github.com/taverns-red/toast-stats/commit/ebabdad31a233f8d561c6ac94ab85b35ed698b89))
* **mobile:** form controls 16px below 768 — no iOS focus zoom ([#1838](https://github.com/taverns-red/toast-stats/issues/1838)) ([#1892](https://github.com/taverns-red/toast-stats/issues/1892)) ([a1a44b0](https://github.com/taverns-red/toast-stats/commit/a1a44b0f9b3e8edb6471b31d993b839d0a5e1075))
* **mobile:** phone type floor — 14px data/links/pills, 12px eyebrows ([#1840](https://github.com/taverns-red/toast-stats/issues/1840)) ([#1898](https://github.com/taverns-red/toast-stats/issues/1898)) ([ab0beae](https://github.com/taverns-red/toast-stats/commit/ab0beae9f558062d24bcb534bc36a624f03653f6))
* **mobile:** retitle the Overview panel 'Details' under the phone hub ([#1842](https://github.com/taverns-red/toast-stats/issues/1842)) ([#1899](https://github.com/taverns-red/toast-stats/issues/1899)) ([696c211](https://github.com/taverns-red/toast-stats/commit/696c211e41a808579c994a55b69439d3d9842e3f))
* **mobile:** section bar labels 14px with 8px between targets ([#1832](https://github.com/taverns-red/toast-stats/issues/1832)) ([#1884](https://github.com/taverns-red/toast-stats/issues/1884)) ([4a2cb42](https://github.com/taverns-red/toast-stats/commit/4a2cb42f6c305af560d58dd90dddb4c8f2659ab7))
* **mobile:** section nav centres the active link, with edge fade cues ([#1829](https://github.com/taverns-red/toast-stats/issues/1829)) ([#1849](https://github.com/taverns-red/toast-stats/issues/1849)) ([fd98361](https://github.com/taverns-red/toast-stats/commit/fd98361c0115164206ebbee8a89dc7fbd10140b0))
* one canonical club id across the eight identity sites ([#1440](https://github.com/taverns-red/toast-stats/issues/1440)) ([#1447](https://github.com/taverns-red/toast-stats/issues/1447)) ([2577eaa](https://github.com/taverns-red/toast-stats/commit/2577eaac146fc04d49d6002ebaa91c141d844721))
* **pipeline:** a snapshot directory holds only the districts that existed on its own date ([#1465](https://github.com/taverns-red/toast-stats/issues/1465)) ([#1480](https://github.com/taverns-red/toast-stats/issues/1480)) ([fcb05aa](https://github.com/taverns-red/toast-stats/commit/fcb05aa39165ef22a27de8997439a47e8cb2b75d))
* **privacy:** no link of any kind in the club place or schedule ([#2069](https://github.com/taverns-red/toast-stats/issues/2069)) ([#2074](https://github.com/taverns-red/toast-stats/issues/2074)) ([aa1a580](https://github.com/taverns-red/toast-stats/commit/aa1a580483ba400f8ccae2e91c315d0c41f09031))
* **privacy:** one shared place-text scrub strips meeting credentials ([#2157](https://github.com/taverns-red/toast-stats/issues/2157)) ([#2158](https://github.com/taverns-red/toast-stats/issues/2158)) ([d3bb221](https://github.com/taverns-red/toast-stats/commit/d3bb221aeff85ce2d2c388c7eb23c62bc9d04430))
* **recognition:** a district-wide zeroed charter count is 'not collected', not 'no milestone reached' ([#1501](https://github.com/taverns-red/toast-stats/issues/1501)) ([#1505](https://github.com/taverns-red/toast-stats/issues/1505)) ([53bd75e](https://github.com/taverns-red/toast-stats/commit/53bd75ef6c2ab2dbd37d59c0693a164e6a784132))
* **region:** keep summary tile numbers on one line at narrow widths ([#2154](https://github.com/taverns-red/toast-stats/issues/2154)) ([#2155](https://github.com/taverns-red/toast-stats/issues/2155)) ([a059678](https://github.com/taverns-red/toast-stats/commit/a0596789e67f0731c4e1bdc25754998a28b6b69d))
* **region:** key competitive-awards on snapshot date, not sourceCsvDate ([#1315](https://github.com/taverns-red/toast-stats/issues/1315)) ([#1316](https://github.com/taverns-red/toast-stats/issues/1316)) ([2ea597e](https://github.com/taverns-red/toast-stats/commit/2ea597e989bc261b45effcba25a3baed9008f484))
* **region:** pad unpadded region ids and redirect to the canonical URL ([#2130](https://github.com/taverns-red/toast-stats/issues/2130)) ([#2131](https://github.com/taverns-red/toast-stats/issues/2131)) ([d03b2d7](https://github.com/taverns-red/toast-stats/commit/d03b2d7b14e7d6b4fe9e9e744aaea0f270548c04))
* say when a district realignment moved the boundary instead of calling transfers roster churn ([#1443](https://github.com/taverns-red/toast-stats/issues/1443)) ([#1448](https://github.com/taverns-red/toast-stats/issues/1448)) ([9914555](https://github.com/taverns-red/toast-stats/commit/99145553883f9c56e8a47735e7664679b7a49a69))
* **shell:** no horizontal page scroll at 375/768 — top bar fits the viewport ([#1651](https://github.com/taverns-red/toast-stats/issues/1651)) ([#1657](https://github.com/taverns-red/toast-stats/issues/1657)) ([6cd7aab](https://github.com/taverns-red/toast-stats/commit/6cd7aabb0acf734db0caf6b2b16e3c9fb280a573))
* **shell:** restore the CommandPalette CSS comment opener ([#1851](https://github.com/taverns-red/toast-stats/issues/1851)) ([#1854](https://github.com/taverns-red/toast-stats/issues/1854)) ([75fe7a6](https://github.com/taverns-red/toast-stats/commit/75fe7a6b7cd2ca21fd34c7ec17f62ddd4841ebe7))
* **smoke:** shared fixture stubs GA collect so smokes never send real hits ([#1979](https://github.com/taverns-red/toast-stats/issues/1979)) ([#1982](https://github.com/taverns-red/toast-stats/issues/1982)) ([85a5bbd](https://github.com/taverns-red/toast-stats/commit/85a5bbd35ab4912af340d4a59c4cf3e5bfc3f6ab))
* staging smoke passes against prod; BottomSheet returns focus in WebKit ([#1920](https://github.com/taverns-red/toast-stats/issues/1920)) ([#1921](https://github.com/taverns-red/toast-stats/issues/1921)) ([a69545f](https://github.com/taverns-red/toast-stats/commit/a69545f6739a17fa52f0276ea7a1c2cef1c09d25))
* suppress district year-over-year across the 2026 reformation boundary ([#1442](https://github.com/taverns-red/toast-stats/issues/1442)) ([#1449](https://github.com/taverns-red/toast-stats/issues/1449)) ([09b36a5](https://github.com/taverns-red/toast-stats/commit/09b36a5f018ffde63bdb7d0b199c3dbec0c82383))
* **test-infra:** type the jest-axe shim's axe() options parameter ([#1389](https://github.com/taverns-red/toast-stats/issues/1389)) ([#1392](https://github.com/taverns-red/toast-stats/issues/1392)) ([430641a](https://github.com/taverns-red/toast-stats/commit/430641ab25a52c805574c58485696a8bc28da11a))
* **test-utils:** unmount each accessibility check's render so ids stay unique ([#1503](https://github.com/taverns-red/toast-stats/issues/1503)) ([#1506](https://github.com/taverns-red/toast-stats/issues/1506)) ([d147c54](https://github.com/taverns-red/toast-stats/commit/d147c549cce85ad3416dd0b3c7e5226528ce4f0d))
* **theme:** page canvas paints --bg in both themes ([#1662](https://github.com/taverns-red/toast-stats/issues/1662)) ([#1664](https://github.com/taverns-red/toast-stats/issues/1664)) ([36da73f](https://github.com/taverns-red/toast-stats/commit/36da73f15d290f30e8c4485ca12c786abda60446))
* **time-series:** a [#1671](https://github.com/taverns-red/toast-stats/issues/1671) gap date gets no point, recorded as not measured, never 0 ([#2070](https://github.com/taverns-red/toast-stats/issues/2070)) ([#2072](https://github.com/taverns-red/toast-stats/issues/2072)) ([2ac486d](https://github.com/taverns-red/toast-stats/commit/2ac486d8de95564d0a2120e52603ea9f7e033b7d))
* **trends:** year-over-year y-axis ticks at the 14px data floor ([#2125](https://github.com/taverns-red/toast-stats/issues/2125)) ([#2126](https://github.com/taverns-red/toast-stats/issues/2126)) ([eee013e](https://github.com/taverns-red/toast-stats/commit/eee013e9c7e715e338305a18939de706fd0dcf7b))
* **ui:** centre breadcrumb links inside their touch-target box — one baseline again ([#1387](https://github.com/taverns-red/toast-stats/issues/1387)) ([#1390](https://github.com/taverns-red/toast-stats/issues/1390)) ([0625428](https://github.com/taverns-red/toast-stats/commit/06254286fec94dec442d4c7bbabd21ed168d87fb))
* **ui:** clamp shared tooltip panels inside the viewport ([#1405](https://github.com/taverns-red/toast-stats/issues/1405)) ([#1410](https://github.com/taverns-red/toast-stats/issues/1410)) ([c00e09a](https://github.com/taverns-red/toast-stats/commit/c00e09ab23fd16b359864ffd9f2490a2e484e57c))
* **ui:** freshness badge shows as-of date + month-end reconciliation ([#1296](https://github.com/taverns-red/toast-stats/issues/1296)) ([#1297](https://github.com/taverns-red/toast-stats/issues/1297)) ([1d3ffeb](https://github.com/taverns-red/toast-stats/commit/1d3ffeb4143a6f233c33f5f3410f51f99ad84052))
* **ui:** header search input transparent in dark mode ([#2022](https://github.com/taverns-red/toast-stats/issues/2022)) ([#2023](https://github.com/taverns-red/toast-stats/issues/2023)) ([84068a9](https://github.com/taverns-red/toast-stats/commit/84068a9ca3a198b27d875f8a9fbd9ae10be53943))
* **ui:** lift KPI tier thresholds off the bullet bar into a flow legend ([#1517](https://github.com/taverns-red/toast-stats/issues/1517)) ([#1518](https://github.com/taverns-red/toast-stats/issues/1518)) ([8786e9e](https://github.com/taverns-red/toast-stats/commit/8786e9e842b3672a7cf5f55f1735d93129fa32b6))
* **ui:** new pages match the existing app palette, no --rt-stats amber ([#2080](https://github.com/taverns-red/toast-stats/issues/2080)) ([#2083](https://github.com/taverns-red/toast-stats/issues/2083)) ([418f2db](https://github.com/taverns-red/toast-stats/commit/418f2db71eecf288db4a5a1de26d2a0eb9bcd48d))


### Refactors

* delete 32 verified-dead frontend files ([#1687](https://github.com/taverns-red/toast-stats/issues/1687)) ([#1692](https://github.com/taverns-red/toast-stats/issues/1692)) ([f64d0ac](https://github.com/taverns-red/toast-stats/commit/f64d0ac0b2a1b4726edcaef15dc92c94e91001d4))
* **history:** fold [#2060](https://github.com/taverns-red/toast-stats/issues/2060)'s shard reader into the [#2059](https://github.com/taverns-red/toast-stats/issues/2059) reader ([#2073](https://github.com/taverns-red/toast-stats/issues/2073)) ([#2115](https://github.com/taverns-red/toast-stats/issues/2115)) ([5926691](https://github.com/taverns-red/toast-stats/commit/592669156acdeffe3616e08496adfe5241d386fd))
* rename @toastmasters/{analytics-core,shared-contracts,collector-cli} → @taverns-red/* ([#1258](https://github.com/taverns-red/toast-stats/issues/1258)) ([#1259](https://github.com/taverns-red/toast-stats/issues/1259)) ([5e33f2d](https://github.com/taverns-red/toast-stats/commit/5e33f2d7546e72eef1146b8ae84bf8a6df4903d9))


### Performance

* **changes:** bound transfer counterparts to a per-view shard budget ([#2063](https://github.com/taverns-red/toast-stats/issues/2063)) ([#2128](https://github.com/taverns-red/toast-stats/issues/2128)) ([8453a50](https://github.com/taverns-red/toast-stats/commit/8453a50b998283a138fffcb2d4889203f4ca0671))
* **club:** keep rankings, manifest and Inter off the club hero's LCP set ([#1852](https://github.com/taverns-red/toast-stats/issues/1852)) ([#2147](https://github.com/taverns-red/toast-stats/issues/2147)) ([9acc4af](https://github.com/taverns-red/toast-stats/commit/9acc4afb71d8aa4d91a1e6b9cd6f4ff818e2261a))
* **club:** paint the club hero from the district snapshot, load analytics after it ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#1910](https://github.com/taverns-red/toast-stats/issues/1910)) ([beb4110](https://github.com/taverns-red/toast-stats/commit/beb411097e9a83f0928f08da173e45bfddd5169f))
* **club:** prefetch the hero's data chain from the entry; read rankings once ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#2025](https://github.com/taverns-red/toast-stats/issues/2025)) ([c5d95c3](https://github.com/taverns-red/toast-stats/commit/c5d95c37ce5be4780b21bb201243ddde84a130c8))
* **district:** lazy-load GlobalRankingsTab so the hub stops waiting on Recharts ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#1924](https://github.com/taverns-red/toast-stats/issues/1924)) ([33eb2a9](https://github.com/taverns-red/toast-stats/commit/33eb2a92b534c9352d9c651b8a74695edd7e4807))
* **district:** paint the hub tiles in the /district/:id route fallback on phones ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#1926](https://github.com/taverns-red/toast-stats/issues/1926)) ([d6ff67d](https://github.com/taverns-red/toast-stats/commit/d6ff67d51acaee8d083899c2ccd0fca0cfc15ee0))
* **district:** reserve every Overview slot — /district/:id CLS under 0.1 ([#1647](https://github.com/taverns-red/toast-stats/issues/1647)) ([#1658](https://github.com/taverns-red/toast-stats/issues/1658)) ([3320e5d](https://github.com/taverns-red/toast-stats/commit/3320e5dabc5a27b009052fcf9202ac0bfb84d06c))
* **fonts:** metric-matched swap fallbacks take 375px CLS 0.141 -&gt; 0.002, plus a gate that can see mobile ([#1373](https://github.com/taverns-red/toast-stats/issues/1373)) ([#1381](https://github.com/taverns-red/toast-stats/issues/1381)) ([ab797f9](https://github.com/taverns-red/toast-stats/commit/ab797f9a2cb7df3a78db141699c6be788aad8555))
* **hub:** request each CDN resource once per hub load ([#2027](https://github.com/taverns-red/toast-stats/issues/2027)) ([#2032](https://github.com/taverns-red/toast-stats/issues/2032)) ([18a605a](https://github.com/taverns-red/toast-stats/commit/18a605aa06a8aedbf4c3e3785f7ca1cba5e62725))
* **map:** static club preview while MapLibre loads; re-baseline first tile to ~4 s ([#1943](https://github.com/taverns-red/toast-stats/issues/1943)) ([#1965](https://github.com/taverns-red/toast-stats/issues/1965)) ([44e1bd7](https://github.com/taverns-red/toast-stats/commit/44e1bd725add4581dbcb87a2bf0519f370cae7f2))
* **mobile:** /clubs stops downloading the Recharts chunk ([#1830](https://github.com/taverns-red/toast-stats/issues/1830)) ([#2009](https://github.com/taverns-red/toast-stats/issues/2009)) ([23b1ab8](https://github.com/taverns-red/toast-stats/commit/23b1ab8ca6b4e4857aab929be7250b1aa3cdac80))
* **mobile:** club route drops club-index.json; landing reads v1/dates.json ([#1830](https://github.com/taverns-red/toast-stats/issues/1830)) ([#1827](https://github.com/taverns-red/toast-stats/issues/1827)) ([#1850](https://github.com/taverns-red/toast-stats/issues/1850)) ([230c8fe](https://github.com/taverns-red/toast-stats/commit/230c8fe720e3b3379e71a805fd438f275d7eaa07))
* **mobile:** GA after load, charts chunk route-only + critical-path CI check ([#1830](https://github.com/taverns-red/toast-stats/issues/1830)) ([#1827](https://github.com/taverns-red/toast-stats/issues/1827)) ([#1853](https://github.com/taverns-red/toast-stats/issues/1853)) ([50fdd33](https://github.com/taverns-red/toast-stats/commit/50fdd33fbc7858b5ee4c1bb6ebe3eaa5b34c24c3))
* **mobile:** load gtag after the first screen settles; 5 KB favicon set ([#1906](https://github.com/taverns-red/toast-stats/issues/1906)) ([#1916](https://github.com/taverns-red/toast-stats/issues/1916)) ([da6a566](https://github.com/taverns-red/toast-stats/commit/da6a566d05f8a210cdbacc816b685dfa205c36df))
* **mobile:** self-host the web fonts, drop the Google Fonts chain ([#1905](https://github.com/taverns-red/toast-stats/issues/1905)) ([#1918](https://github.com/taverns-red/toast-stats/issues/1918)) ([aa310d5](https://github.com/taverns-red/toast-stats/commit/aa310d59f8e68f439beaac68388545f924a65d35))
* **survival:** per-district cohort survival file, so /growth/survival stops fetching 100 history shards ([#2061](https://github.com/taverns-red/toast-stats/issues/2061)) ([#2119](https://github.com/taverns-red/toast-stats/issues/2119)) ([872fd4a](https://github.com/taverns-red/toast-stats/commit/872fd4adfecf43b507e8c9d6e0206995bd6150f8))


### Documentation

* **methodology:** Distinguished Percent divides by club base ([#1615](https://github.com/taverns-red/toast-stats/issues/1615)) ([#1631](https://github.com/taverns-red/toast-stats/issues/1631)) ([205455e](https://github.com/taverns-red/toast-stats/commit/205455e5401c8453c2ac7a0b3d956c7c42bc11fa))
* PY 2021-22 archive coverage is proven, not an unverified prerequisite ([#1456](https://github.com/taverns-red/toast-stats/issues/1456)) ([#1457](https://github.com/taverns-red/toast-stats/issues/1457)) ([0863a4b](https://github.com/taverns-red/toast-stats/commit/0863a4bfbc627303be9a37d692a3819faad1be53))


### Tests

* behavioural tests for cdnTimeSeries, transformServiceFactory, createVerboseLogger ([#1687](https://github.com/taverns-red/toast-stats/issues/1687)) ([#1690](https://github.com/taverns-red/toast-stats/issues/1690)) ([8316cb1](https://github.com/taverns-red/toast-stats/commit/8316cb16883f0a1186fe18d7fd674d19535a8045))
* behavioural tests for the collector-cli, mcp-server and frontend entrypoints ([#1687](https://github.com/taverns-red/toast-stats/issues/1687)) ([#1695](https://github.com/taverns-red/toast-stats/issues/1695)) ([f9d1f53](https://github.com/taverns-red/toast-stats/commit/f9d1f53ffa9cfa655a8a231f39aea4cbd45ea821))
* behavioural tests for useGlobalHistory, textEffectsRemover, TopGrowthClubs ([#1687](https://github.com/taverns-red/toast-stats/issues/1687)) ([#1693](https://github.com/taverns-red/toast-stats/issues/1693)) ([f214519](https://github.com/taverns-red/toast-stats/commit/f2145197a74fb132b1667a69f5580ec23b8db462))
* **e2e:** kpi-tier-labels drives the hub sheets and ?py= ([#1903](https://github.com/taverns-red/toast-stats/issues/1903)) ([#1913](https://github.com/taverns-red/toast-stats/issues/1913)) ([174183b](https://github.com/taverns-red/toast-stats/commit/174183b7095f0455ce6a78144c492f4edce4ca82))
* **e2e:** wait for snapshot dates before asserting the date selector ([#1947](https://github.com/taverns-red/toast-stats/issues/1947)) ([#1952](https://github.com/taverns-red/toast-stats/issues/1952)) ([972c332](https://github.com/taverns-red/toast-stats/commit/972c3324a460b7ae2fde3f0300a8cae8b165bd9f))
* **frontend:** de-flake rankingsCheckpoint thin-wrapper test ([#1779](https://github.com/taverns-red/toast-stats/issues/1779)) ([#1889](https://github.com/taverns-red/toast-stats/issues/1889)) ([7155d40](https://github.com/taverns-red/toast-stats/commit/7155d40bc7fe42603d46e4685882f164190f468c))
* **mobile:** 375 Playwright smoke gate — overflow, targets, text, first-content offset ([#1841](https://github.com/taverns-red/toast-stats/issues/1841)) ([#2007](https://github.com/taverns-red/toast-stats/issues/2007)) ([02269f1](https://github.com/taverns-red/toast-stats/commit/02269f167e888d1af3e45794518bc98a1c1f7c0e))
* **mobile:** 375 smoke for phone clubs rows + FilterSheet URL round-trip ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1890](https://github.com/taverns-red/toast-stats/issues/1890)) ([d1aa0b8](https://github.com/taverns-red/toast-stats/commit/d1aa0b81d09b5641f291d2d31f69832ff80c0525))
* **mobile:** 375 smoke for the phone divisions page — rows, no area tables, ≤6,000px ([#1844](https://github.com/taverns-red/toast-stats/issues/1844)) ([#1929](https://github.com/taverns-red/toast-stats/issues/1929)) ([956060b](https://github.com/taverns-red/toast-stats/commit/956060b7308cd41fb150fa9cb03b97d0a9f50b97))
* **ui:** pin current PY in DistrictClubsPage test to unblock release [#1253](https://github.com/taverns-red/toast-stats/issues/1253) ([#1303](https://github.com/taverns-red/toast-stats/issues/1303)) ([0dc30c5](https://github.com/taverns-red/toast-stats/commit/0dc30c5f01d885afa90165e5e4e1944f5ce0817a))


### Dependencies

* **deps-dev:** bump the dev-deps group across 1 directory with 4 updates ([#1502](https://github.com/taverns-red/toast-stats/issues/1502)) ([485dc1c](https://github.com/taverns-red/toast-stats/commit/485dc1c75b0c8ac6d3f8076b87ab608e1e216b14))
* **deps-dev:** bump the dev-deps group across 1 directory with 4 updates ([#1533](https://github.com/taverns-red/toast-stats/issues/1533)) ([c7c7196](https://github.com/taverns-red/toast-stats/commit/c7c7196acda1cca4d897e8e17d306b1a5990f57c))
* **deps:** bump the patch-and-minor group across 1 directory with 14 updates ([#1236](https://github.com/taverns-red/toast-stats/issues/1236)) ([ac0e084](https://github.com/taverns-red/toast-stats/commit/ac0e08499141afc97b89ef6e67f3cb6994ca86c5))
* **deps:** Bump the patch-and-minor group across 1 directory with 17 updates ([#2110](https://github.com/taverns-red/toast-stats/issues/2110)) ([d82ed58](https://github.com/taverns-red/toast-stats/commit/d82ed587586bd3fb0017408e952e1715ac632a35))
* **deps:** bump the patch-and-minor group across 1 directory with 18 updates ([#1604](https://github.com/taverns-red/toast-stats/issues/1604)) ([0f42c54](https://github.com/taverns-red/toast-stats/commit/0f42c548ffb240d7496945b09c9ea7b21b3cbd7b))
* **deps:** bump the patch-and-minor group across 1 directory with 23 updates ([#1488](https://github.com/taverns-red/toast-stats/issues/1488)) ([5714376](https://github.com/taverns-red/toast-stats/commit/5714376b49bf475c3c7fc08481937fd4966e71c2))
* **deps:** bump the patch-and-minor group across 1 directory with 5 updates ([#1656](https://github.com/taverns-red/toast-stats/issues/1656)) ([3b055a7](https://github.com/taverns-red/toast-stats/commit/3b055a78e72a5cf4c79463ca956a0f731b31f6d2))
* **deps:** bump the patch-and-minor group with 10 updates ([#1523](https://github.com/taverns-red/toast-stats/issues/1523)) ([dbc727c](https://github.com/taverns-red/toast-stats/commit/dbc727c91e1fd0483686219dd04e522b1167a376))
* **deps:** bump the patch-and-minor group with 13 updates ([#1576](https://github.com/taverns-red/toast-stats/issues/1576)) ([89caddc](https://github.com/taverns-red/toast-stats/commit/89caddc2e6bd254d79a926d276a730cbbdfa3a34))
* **deps:** Bump the patch-and-minor group with 8 updates ([#2150](https://github.com/taverns-red/toast-stats/issues/2150)) ([adb1213](https://github.com/taverns-red/toast-stats/commit/adb1213623872f7b00ed7e44301e8384b304c334))
* **deps:** bump the prod-deps group across 1 directory with 3 updates ([#1261](https://github.com/taverns-red/toast-stats/issues/1261)) ([5dbc0ae](https://github.com/taverns-red/toast-stats/commit/5dbc0ae63127b76b22351535206aeabf31494f6b))
* **deps:** bump the prod-deps group across 1 directory with 6 updates ([#1582](https://github.com/taverns-red/toast-stats/issues/1582)) ([0c9fe54](https://github.com/taverns-red/toast-stats/commit/0c9fe5459f2e77b78e862235877b66237a8f7a9d))
* land the patch-and-minor group with the prettier 3.9.6 reformat ([#1340](https://github.com/taverns-red/toast-stats/issues/1340)) ([83b19db](https://github.com/taverns-red/toast-stats/commit/83b19dbca7a910712db4933036acaf7ab8b570b0)), closes [#1339](https://github.com/taverns-red/toast-stats/issues/1339)


### Build System

* **deps:** migrate to vitest 5 — the coverageFilesDirectory break was a mixed-major tree ([#1529](https://github.com/taverns-red/toast-stats/issues/1529)) ([#1532](https://github.com/taverns-red/toast-stats/issues/1532)) ([9769221](https://github.com/taverns-red/toast-stats/commit/97692210e1547fd801398e9f42e406406a6a1a0b))
* **frontend:** migrate @tanstack/react-table 8 → 9 ([#1530](https://github.com/taverns-red/toast-stats/issues/1530)) ([#1538](https://github.com/taverns-red/toast-stats/issues/1538)) ([e8fef53](https://github.com/taverns-red/toast-stats/commit/e8fef53aba701ec759967f8f3fdd960e0b4c1f7e))
* migrate off moduleResolution node10 and bump TypeScript to 7.0.2 ([#1489](https://github.com/taverns-red/toast-stats/issues/1489)) ([#1495](https://github.com/taverns-red/toast-stats/issues/1495)) ([a8a4e88](https://github.com/taverns-red/toast-stats/commit/a8a4e88e067aeacf7fbc959708d5bf3dd38b1342))

## [3.43.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.42.1...frontend-v3.43.0) (2026-10-19)


### Features

* **club:** Lifecycle card shows observed moves only and where our records start ([#2169](https://github.com/taverns-red/toast-stats/issues/2169)) ([#2170](https://github.com/taverns-red/toast-stats/issues/2170)) ([686d9e1](https://github.com/taverns-red/toast-stats/commit/686d9e1966f17005529b4df1b5c7e1cb2a15676f))
* **club:** quiet outline hero chips and compact PY/date controls ([#2171](https://github.com/taverns-red/toast-stats/issues/2171)) ([#2172](https://github.com/taverns-red/toast-stats/issues/2172)) ([3d99036](https://github.com/taverns-red/toast-stats/commit/3d9903672596ab7555da66030e17167d5be3c5f9))
* **club:** real map tiles under the Location mini-map ([#2162](https://github.com/taverns-red/toast-stats/issues/2162)) ([#2165](https://github.com/taverns-red/toast-stats/issues/2165)) ([c0978cd](https://github.com/taverns-red/toast-stats/commit/c0978cdf6572829eb81f833870f5c71a52532b3e))
* **district:** retire the Analytics subpage; redirect to Clubs sorted by net change ([#2159](https://github.com/taverns-red/toast-stats/issues/2159)) ([#2163](https://github.com/taverns-red/toast-stats/issues/2163)) ([39796a0](https://github.com/taverns-red/toast-stats/commit/39796a0b51d2c9b7a994290a1e51b213c581ca6b))
* **growth:** region and world Club Growth funnels ([#1812](https://github.com/taverns-red/toast-stats/issues/1812), [#1813](https://github.com/taverns-red/toast-stats/issues/1813)) ([#2140](https://github.com/taverns-red/toast-stats/issues/2140)) ([7d084de](https://github.com/taverns-red/toast-stats/commit/7d084de8793a3145ff8145f03ce2273469e660b9))
* **pipeline:** date-exact club-district change points ([#1816](https://github.com/taverns-red/toast-stats/issues/1816)) ([#2135](https://github.com/taverns-red/toast-stats/issues/2135)) ([03fd650](https://github.com/taverns-red/toast-stats/commit/03fd65083a3578620380b89992cfcbee2ac28c5e))
* **pipeline:** snapshots/&lt;date&gt;/reports-rollups.json — reports-derived region/world rollups ([#2012](https://github.com/taverns-red/toast-stats/issues/2012)) ([#2117](https://github.com/taverns-red/toast-stats/issues/2117)) ([bef7d98](https://github.com/taverns-red/toast-stats/commit/bef7d98b93fb8f6a1f87976217093f37c9e971c5))
* **region:** /region/:n/education + mirror the education rollup into prod ([#1810](https://github.com/taverns-red/toast-stats/issues/1810)) ([#2139](https://github.com/taverns-red/toast-stats/issues/2139)) ([d61ac4a](https://github.com/taverns-red/toast-stats/commit/d61ac4a091924e4c652b4bf54f82badd881e0f5c))


### Bug Fixes

* **coords:** treat FAC's (0, 0) sentinel as no coordinates, one shared rule ([#2153](https://github.com/taverns-red/toast-stats/issues/2153)) ([#2156](https://github.com/taverns-red/toast-stats/issues/2156)) ([feeae86](https://github.com/taverns-red/toast-stats/commit/feeae86e446338450938365436a7fb2556a2abd6))
* **district:** header subtitle describes the page it is on ([#2161](https://github.com/taverns-red/toast-stats/issues/2161)) ([#2164](https://github.com/taverns-red/toast-stats/issues/2164)) ([b294e8a](https://github.com/taverns-red/toast-stats/commit/b294e8a070959b73f3483f13ead5ce839be527d9))
* **privacy:** one shared place-text scrub strips meeting credentials ([#2157](https://github.com/taverns-red/toast-stats/issues/2157)) ([#2158](https://github.com/taverns-red/toast-stats/issues/2158)) ([d3bb221](https://github.com/taverns-red/toast-stats/commit/d3bb221aeff85ce2d2c388c7eb23c62bc9d04430))
* **region:** keep summary tile numbers on one line at narrow widths ([#2154](https://github.com/taverns-red/toast-stats/issues/2154)) ([#2155](https://github.com/taverns-red/toast-stats/issues/2155)) ([a059678](https://github.com/taverns-red/toast-stats/commit/a0596789e67f0731c4e1bdc25754998a28b6b69d))


### Dependencies

* **deps:** Bump the patch-and-minor group with 8 updates ([#2150](https://github.com/taverns-red/toast-stats/issues/2150)) ([adb1213](https://github.com/taverns-red/toast-stats/commit/adb1213623872f7b00ed7e44301e8384b304c334))

## [3.42.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.42.0...frontend-v3.42.1) (2026-10-18)


### Performance

* **club:** keep rankings, manifest and Inter off the club hero's LCP set ([#1852](https://github.com/taverns-red/toast-stats/issues/1852)) ([#2147](https://github.com/taverns-red/toast-stats/issues/2147)) ([9acc4af](https://github.com/taverns-red/toast-stats/commit/9acc4afb71d8aa4d91a1e6b9cd6f4ff818e2261a))

## [3.42.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.41.1...frontend-v3.42.0) (2026-10-18)


### Features

* **region:** region and world membership series for /regions sparklines ([#2127](https://github.com/taverns-red/toast-stats/issues/2127)) ([#2134](https://github.com/taverns-red/toast-stats/issues/2134)) ([7157287](https://github.com/taverns-red/toast-stats/commit/71572878b5ff1f880134c10b342404cc907a8515))
* **region:** region club explorer — /region/:n/map ([#1808](https://github.com/taverns-red/toast-stats/issues/1808)) ([#2137](https://github.com/taverns-red/toast-stats/issues/2137)) ([8d7565b](https://github.com/taverns-red/toast-stats/commit/8d7565bb83d8f6257ad9fb7356b4facdde53ae9d))
* **search:** closed clubs searchable by name — pipeline closed-club name index ([#2062](https://github.com/taverns-red/toast-stats/issues/2062)) ([#2122](https://github.com/taverns-red/toast-stats/issues/2122)) ([68fba06](https://github.com/taverns-red/toast-stats/commit/68fba061a12530e4b06b5d230fae60fddfa2db06))
* **survival:** charter cohort survival at region and world level ([#1818](https://github.com/taverns-red/toast-stats/issues/1818)) ([#2138](https://github.com/taverns-red/toast-stats/issues/2138)) ([0c220d9](https://github.com/taverns-red/toast-stats/commit/0c220d9779c87dff4ca20d3748b4cc18338aa2c6))


### Performance

* **survival:** per-district cohort survival file, so /growth/survival stops fetching 100 history shards ([#2061](https://github.com/taverns-red/toast-stats/issues/2061)) ([#2119](https://github.com/taverns-red/toast-stats/issues/2119)) ([872fd4a](https://github.com/taverns-red/toast-stats/commit/872fd4adfecf43b507e8c9d6e0206995bd6150f8))

## [3.41.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.41.0...frontend-v3.41.1) (2026-10-18)


### Bug Fixes

* **club:** the club-district history decides the PY's district ([#2079](https://github.com/taverns-red/toast-stats/issues/2079)) ([#2136](https://github.com/taverns-red/toast-stats/issues/2136)) ([ac13927](https://github.com/taverns-red/toast-stats/commit/ac1392778a0055238940cc737b0e8e3b92847f47))
* **region:** pad unpadded region ids and redirect to the canonical URL ([#2130](https://github.com/taverns-red/toast-stats/issues/2130)) ([#2131](https://github.com/taverns-red/toast-stats/issues/2131)) ([d03b2d7](https://github.com/taverns-red/toast-stats/commit/d03b2d7b14e7d6b4fe9e9e744aaea0f270548c04))


### Performance

* **changes:** bound transfer counterparts to a per-view shard budget ([#2063](https://github.com/taverns-red/toast-stats/issues/2063)) ([#2128](https://github.com/taverns-red/toast-stats/issues/2128)) ([8453a50](https://github.com/taverns-red/toast-stats/commit/8453a50b998283a138fffcb2d4889203f4ca0671))

## [3.41.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.40.0...frontend-v3.41.0) (2026-10-17)


### Features

* **clubs:** district meeting-time heatmap ([#1796](https://github.com/taverns-red/toast-stats/issues/1796)) ([#2114](https://github.com/taverns-red/toast-stats/issues/2114)) ([f01cd3a](https://github.com/taverns-red/toast-stats/commit/f01cd3a7de402a9027110286cb5ed24e901f4dd7))
* **map:** Arabic and Hebrew place names on self-hosted glyphs, no RTL plugin needed ([#2085](https://github.com/taverns-red/toast-stats/issues/2085)) ([#2116](https://github.com/taverns-red/toast-stats/issues/2116)) ([9564ed1](https://github.com/taverns-red/toast-stats/commit/9564ed17ac6944127d711b4e86efed98beef49d5))
* **map:** meeting-day pin mode and Online only attendance ([#1787](https://github.com/taverns-red/toast-stats/issues/1787)) ([#2118](https://github.com/taverns-red/toast-stats/issues/2118)) ([ece55d6](https://github.com/taverns-red/toast-stats/commit/ece55d6e6a332cf9aeba2c03c1d136531d6dd1d9))
* **region,world:** health, status and compliance rollup subpages + region districts sparkline ([#1815](https://github.com/taverns-red/toast-stats/issues/1815)) ([#2123](https://github.com/taverns-red/toast-stats/issues/2123)) ([538e03b](https://github.com/taverns-red/toast-stats/commit/538e03b78626d3b54dff4f078263c0fd904a8479))


### Bug Fixes

* **map:** city labels step clear of large pin clusters ([#2092](https://github.com/taverns-red/toast-stats/issues/2092)) ([#2111](https://github.com/taverns-red/toast-stats/issues/2111)) ([c120c06](https://github.com/taverns-red/toast-stats/commit/c120c06329808a6a5855f0cc1e58bfe2a6ee54b4))
* **map:** pin outline and halo use the app palette ([#2087](https://github.com/taverns-red/toast-stats/issues/2087)) ([#2113](https://github.com/taverns-red/toast-stats/issues/2113)) ([ba231de](https://github.com/taverns-red/toast-stats/commit/ba231dea472a6ed3e4732588a60827f3bc5bc927))
* **time-series:** a [#1671](https://github.com/taverns-red/toast-stats/issues/1671) gap date gets no point, recorded as not measured, never 0 ([#2070](https://github.com/taverns-red/toast-stats/issues/2070)) ([#2072](https://github.com/taverns-red/toast-stats/issues/2072)) ([2ac486d](https://github.com/taverns-red/toast-stats/commit/2ac486d8de95564d0a2120e52603ea9f7e033b7d))
* **trends:** year-over-year y-axis ticks at the 14px data floor ([#2125](https://github.com/taverns-red/toast-stats/issues/2125)) ([#2126](https://github.com/taverns-red/toast-stats/issues/2126)) ([eee013e](https://github.com/taverns-red/toast-stats/commit/eee013e9c7e715e338305a18939de706fd0dcf7b))


### Refactors

* **history:** fold [#2060](https://github.com/taverns-red/toast-stats/issues/2060)'s shard reader into the [#2059](https://github.com/taverns-red/toast-stats/issues/2059) reader ([#2073](https://github.com/taverns-red/toast-stats/issues/2073)) ([#2115](https://github.com/taverns-red/toast-stats/issues/2115)) ([5926691](https://github.com/taverns-red/toast-stats/commit/592669156acdeffe3616e08496adfe5241d386fd))


### Dependencies

* **deps:** Bump the patch-and-minor group across 1 directory with 17 updates ([#2110](https://github.com/taverns-red/toast-stats/issues/2110)) ([d82ed58](https://github.com/taverns-red/toast-stats/commit/d82ed587586bd3fb0017408e952e1715ac632a35))

## [3.40.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.39.0...frontend-v3.40.0) (2026-10-16)


### Features

* **promo:** show the Red Vote card on phone district pages ([#2090](https://github.com/taverns-red/toast-stats/issues/2090)) ([#2094](https://github.com/taverns-red/toast-stats/issues/2094)) ([306127f](https://github.com/taverns-red/toast-stats/commit/306127f1433ecac7bebf2cf3968d8af083461dfd))


### Bug Fixes

* **mobile:** drop the phone Overview Sections list; fix double-active bottom bar ([#2093](https://github.com/taverns-red/toast-stats/issues/2093)) ([#2095](https://github.com/taverns-red/toast-stats/issues/2095)) ([ebabdad](https://github.com/taverns-red/toast-stats/commit/ebabdad31a233f8d561c6ac94ab85b35ed698b89))

## [3.39.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.38.0...frontend-v3.39.0) (2026-10-16)


### Features

* **map:** labelled basemap context, zoom-banded, on self-hosted glyphs ([#2081](https://github.com/taverns-red/toast-stats/issues/2081)) ([#2082](https://github.com/taverns-red/toast-stats/issues/2082)) ([6f394ac](https://github.com/taverns-red/toast-stats/commit/6f394ac7682dff5422429f19e946a279406d68c5))
* **map:** world z0–14 basemap with street names and a restrained POI set ([#2084](https://github.com/taverns-red/toast-stats/issues/2084), [#2081](https://github.com/taverns-red/toast-stats/issues/2081)) ([#2089](https://github.com/taverns-red/toast-stats/issues/2089)) ([3c01be5](https://github.com/taverns-red/toast-stats/commit/3c01be5d4a08065be599359a9d1437ff166b7dfb))
* **promo:** promote Red Vote on district-level pages ([#2090](https://github.com/taverns-red/toast-stats/issues/2090)) ([#2091](https://github.com/taverns-red/toast-stats/issues/2091)) ([a6e8bd9](https://github.com/taverns-red/toast-stats/commit/a6e8bd9fcfdaadc14b448fcee6b22b927a28dfb2))


### Bug Fixes

* **ui:** new pages match the existing app palette, no --rt-stats amber ([#2080](https://github.com/taverns-red/toast-stats/issues/2080)) ([#2083](https://github.com/taverns-red/toast-stats/issues/2083)) ([418f2db](https://github.com/taverns-red/toast-stats/commit/418f2db71eecf288db4a5a1de26d2a0eb9bcd48d))

## [3.38.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.37.0...frontend-v3.38.0) (2026-10-15)


### Features

* **club:** /club/:cid?py= and the club page resolve the PY's district ([#1804](https://github.com/taverns-red/toast-stats/issues/1804)) ([#2067](https://github.com/taverns-red/toast-stats/issues/2067)) ([dfe193d](https://github.com/taverns-red/toast-stats/commit/dfe193d588d82a058d52ab2f837d388070fdc202))
* **club:** hero lineage chip from the club-district history ([#1805](https://github.com/taverns-red/toast-stats/issues/1805)) ([#2066](https://github.com/taverns-red/toast-stats/issues/2066)) ([cfe9803](https://github.com/taverns-red/toast-stats/commit/cfe9803f3d19073b671454db47a37d2f827e8c43))
* **growth:** sponsor/mentor counts on the Club Growth funnel ([#1794](https://github.com/taverns-red/toast-stats/issues/1794)) ([#2065](https://github.com/taverns-red/toast-stats/issues/2065)) ([15686fc](https://github.com/taverns-red/toast-stats/commit/15686fce2c776a88dd48c0c59daa1b642175d962))


### Bug Fixes

* **club:** lifecycle panel waits for a shard read that has not started ([#2076](https://github.com/taverns-red/toast-stats/issues/2076)) ([#2077](https://github.com/taverns-red/toast-stats/issues/2077)) ([1af2f08](https://github.com/taverns-red/toast-stats/commit/1af2f08e4c868cf602bbc44fa8074cff3f144f17))
* **privacy:** no link of any kind in the club place or schedule ([#2069](https://github.com/taverns-red/toast-stats/issues/2069)) ([#2074](https://github.com/taverns-red/toast-stats/issues/2074)) ([aa1a580](https://github.com/taverns-red/toast-stats/commit/aa1a580483ba400f8ccae2e91c315d0c41f09031))

## [3.37.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.36.0...frontend-v3.37.0) (2026-10-15)


### Features

* **analytics:** retire the 8 unread per-district analytics files; completeness gate ignores them ([#1798](https://github.com/taverns-red/toast-stats/issues/1798)) ([#1989](https://github.com/taverns-red/toast-stats/issues/1989)) ([88b9632](https://github.com/taverns-red/toast-stats/commit/88b9632c56f16da88d1e60cda02cd98aef161a79))
* **changes,search:** transfers name the counterpart district; omni-search finds closed clubs ([#1806](https://github.com/taverns-red/toast-stats/issues/1806)) ([#2060](https://github.com/taverns-red/toast-stats/issues/2060)) ([f80fea1](https://github.com/taverns-red/toast-stats/commit/f80fea17022a570abf2f677986fa1f28304ecbd9))
* **charts:** lazy chart chunk fallbacks paint the chart's own loading state ([#1835](https://github.com/taverns-red/toast-stats/issues/1835)) ([#2058](https://github.com/taverns-red/toast-stats/issues/2058)) ([370d59e](https://github.com/taverns-red/toast-stats/commit/370d59e979b22b222a1c250c3ef6fc3b3240d27a))
* **charts:** unpin, legend chips, phone ticks and chart-shaped skeletons ([#1835](https://github.com/taverns-red/toast-stats/issues/1835)) ([#2016](https://github.com/taverns-red/toast-stats/issues/2016)) ([453738b](https://github.com/taverns-red/toast-stats/commit/453738bdebfd34eb8a065b8996938354996520dc))
* **club:** 2×2 stat strip and open disclosure panels on phones ([#1843](https://github.com/taverns-red/toast-stats/issues/1843)) ([#2052](https://github.com/taverns-red/toast-stats/issues/2052)) ([eee7eab](https://github.com/taverns-red/toast-stats/commit/eee7eab2f6991903102332973840e463bfc99d47))
* **club:** Lifecycle panel is a vertical timeline ([#1843](https://github.com/taverns-red/toast-stats/issues/1843)) ([#2057](https://github.com/taverns-red/toast-stats/issues/2057)) ([16e956c](https://github.com/taverns-red/toast-stats/commit/16e956c16e42cac90f6a7ac42c57c009be63e02e))
* dual-shape reader for slim district analytics club lists ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#2046](https://github.com/taverns-red/toast-stats/issues/2046)) ([7f7b7b2](https://github.com/taverns-red/toast-stats/commit/7f7b7b26160c42348d0e61088b62f726992f3b59))
* **education:** /district/:id/education subpage — PYTD, ledger only ([#1793](https://github.com/taverns-red/toast-stats/issues/1793)) ([#2053](https://github.com/taverns-red/toast-stats/issues/2053)) ([287b882](https://github.com/taverns-red/toast-stats/commit/287b882c3c9fd7d64187f4cdfd08a21cec3c00d9))
* **growth:** list the clubs suspended this program year in the funnel ([#1794](https://github.com/taverns-red/toast-stats/issues/1794)) ([#2055](https://github.com/taverns-red/toast-stats/issues/2055)) ([1f1b4ad](https://github.com/taverns-red/toast-stats/commit/1f1b4ade65c380c309cfdbc9263c7413e1f738a8))
* **map:** renewals, CSP, officer list, coach, awards and attendance pin modes ([#1787](https://github.com/taverns-red/toast-stats/issues/1787)) ([#2049](https://github.com/taverns-red/toast-stats/issues/2049)) ([f51b81b](https://github.com/taverns-red/toast-stats/commit/f51b81bd9649e24299ffca47eef103bed2466bda))
* **preview:** read PR preview data through the compressing staging CDN ([#2003](https://github.com/taverns-red/toast-stats/issues/2003)) ([#2004](https://github.com/taverns-red/toast-stats/issues/2004)) ([1880ce8](https://github.com/taverns-red/toast-stats/commit/1880ce8f44bd9f713cfbe60fc0a7e0af6eed836d))
* **survival:** /district/:id/growth/survival — charter cohort survival curves ([#1817](https://github.com/taverns-red/toast-stats/issues/1817)) ([#2059](https://github.com/taverns-red/toast-stats/issues/2059)) ([80da12f](https://github.com/taverns-red/toast-stats/commit/80da12ffe9e4464a1cebe38fa668a1250b746c36))


### Bug Fixes

* **a11y:** 16px form-control floor on touch landscape phones ([#2018](https://github.com/taverns-red/toast-stats/issues/2018)) ([#2021](https://github.com/taverns-red/toast-stats/issues/2021)) ([dd40ac1](https://github.com/taverns-red/toast-stats/commit/dd40ac185af803d55fefeb23a1933ccc7000ca2d))
* **a11y:** 44px header search and footer links on touch landscape ([#2017](https://github.com/taverns-red/toast-stats/issues/2017)) ([#2019](https://github.com/taverns-red/toast-stats/issues/2019)) ([ab8d4af](https://github.com/taverns-red/toast-stats/commit/ab8d4af5836972d335fd8b768c5c1eeea4e084b9))
* **clubs:** loading skeleton instead of false empty state while dates load ([#1999](https://github.com/taverns-red/toast-stats/issues/1999)) ([#2031](https://github.com/taverns-red/toast-stats/issues/2031)) ([7442c13](https://github.com/taverns-red/toast-stats/commit/7442c133e906bac9fb1f922b87a00e68aeeaf75b))
* **e2e:** measure the map panel heading after the scroll settles ([#1993](https://github.com/taverns-red/toast-stats/issues/1993)) ([#1997](https://github.com/taverns-red/toast-stats/issues/1997)) ([94b0980](https://github.com/taverns-red/toast-stats/commit/94b0980c23732ba2723fb22431831e098d4ea10a))
* **e2e:** require BASE_URL for Playwright smokes ([#2010](https://github.com/taverns-red/toast-stats/issues/2010)) ([#2011](https://github.com/taverns-red/toast-stats/issues/2011)) ([73c1375](https://github.com/taverns-red/toast-stats/commit/73c137539ced22db8cfcb7dcd3d2f075cc222e61))
* **global-totals:** state a gap district left out of the world sums ([#2042](https://github.com/taverns-red/toast-stats/issues/2042)) ([#2050](https://github.com/taverns-red/toast-stats/issues/2050)) ([5620f1f](https://github.com/taverns-red/toast-stats/commit/5620f1fb5b897ddfc65b4bb99d1574a11cefd3f9))
* **ui:** header search input transparent in dark mode ([#2022](https://github.com/taverns-red/toast-stats/issues/2022)) ([#2023](https://github.com/taverns-red/toast-stats/issues/2023)) ([84068a9](https://github.com/taverns-red/toast-stats/commit/84068a9ca3a198b27d875f8a9fbd9ae10be53943))


### Performance

* **club:** prefetch the hero's data chain from the entry; read rankings once ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#2025](https://github.com/taverns-red/toast-stats/issues/2025)) ([c5d95c3](https://github.com/taverns-red/toast-stats/commit/c5d95c37ce5be4780b21bb201243ddde84a130c8))
* **hub:** request each CDN resource once per hub load ([#2027](https://github.com/taverns-red/toast-stats/issues/2027)) ([#2032](https://github.com/taverns-red/toast-stats/issues/2032)) ([18a605a](https://github.com/taverns-red/toast-stats/commit/18a605aa06a8aedbf4c3e3785f7ca1cba5e62725))
* **mobile:** /clubs stops downloading the Recharts chunk ([#1830](https://github.com/taverns-red/toast-stats/issues/1830)) ([#2009](https://github.com/taverns-red/toast-stats/issues/2009)) ([23b1ab8](https://github.com/taverns-red/toast-stats/commit/23b1ab8ca6b4e4857aab929be7250b1aa3cdac80))


### Tests

* **mobile:** 375 Playwright smoke gate — overflow, targets, text, first-content offset ([#1841](https://github.com/taverns-red/toast-stats/issues/1841)) ([#2007](https://github.com/taverns-red/toast-stats/issues/2007)) ([02269f1](https://github.com/taverns-red/toast-stats/commit/02269f167e888d1af3e45794518bc98a1c1f7c0e))

## [3.36.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.35.0...frontend-v3.36.0) (2026-10-13)


### Features

* **clubs:** coach flag on phone MobileRowList rows ([#1968](https://github.com/taverns-red/toast-stats/issues/1968)) ([#1988](https://github.com/taverns-red/toast-stats/issues/1988)) ([d64d747](https://github.com/taverns-red/toast-stats/commit/d64d74748a5d58a9ba3c3f4b519c82bbda4addf4))
* **map:** Enter on a pin moves focus into the side panel ([#1967](https://github.com/taverns-red/toast-stats/issues/1967)) ([#1987](https://github.com/taverns-red/toast-stats/issues/1987)) ([534651d](https://github.com/taverns-red/toast-stats/commit/534651d8a0271b2203fd42c8611776245a10dfda))
* **map:** extended pin colour modes — status, members, growth, DCP, club age ([#1787](https://github.com/taverns-red/toast-stats/issues/1787)) ([#1972](https://github.com/taverns-red/toast-stats/issues/1972)) ([2345616](https://github.com/taverns-red/toast-stats/commit/2345616f8e0a61707aeb5a700a1c4a212737914e))
* **pipeline:** education rollup from the ledger — district, region, world per PY ([#1801](https://github.com/taverns-red/toast-stats/issues/1801)) ([#1973](https://github.com/taverns-red/toast-stats/issues/1973)) ([aa7bb5b](https://github.com/taverns-red/toast-stats/commit/aa7bb5bd4e0c61199ea15351418828b32fad66b9))


### Bug Fixes

* **clubs:** pass coach and club status to the clubs CSV export ([#1978](https://github.com/taverns-red/toast-stats/issues/1978)) ([#1981](https://github.com/taverns-red/toast-stats/issues/1981)) ([0541650](https://github.com/taverns-red/toast-stats/commit/0541650c403f70349bcc5bea418f4abe3e63c8d1))
* **e2e:** measure map filter chips after the sheet settles ([#1984](https://github.com/taverns-red/toast-stats/issues/1984)) ([#1985](https://github.com/taverns-red/toast-stats/issues/1985)) ([46e3bfe](https://github.com/taverns-red/toast-stats/commit/46e3bfee94c4c74eff0a4411cf5a1896142e9032))
* **education:** count the CES vintage path in the leaderboards — one Pathways vocabulary ([#1976](https://github.com/taverns-red/toast-stats/issues/1976)) ([#1980](https://github.com/taverns-red/toast-stats/issues/1980)) ([1aefc96](https://github.com/taverns-red/toast-stats/commit/1aefc9677ba75755959682a380f59bdbe09f580a))
* **map:** realign area select honours the 44 px floor in WebKit ([#1974](https://github.com/taverns-red/toast-stats/issues/1974)) ([#1983](https://github.com/taverns-red/toast-stats/issues/1983)) ([8b08fad](https://github.com/taverns-red/toast-stats/commit/8b08fad535a2f584d05899ac9af19835b71b9712))
* **smoke:** shared fixture stubs GA collect so smokes never send real hits ([#1979](https://github.com/taverns-red/toast-stats/issues/1979)) ([#1982](https://github.com/taverns-red/toast-stats/issues/1982)) ([85a5bbd](https://github.com/taverns-red/toast-stats/commit/85a5bbd35ab4912af340d4a59c4cf3e5bfc3f6ab))

## [3.35.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.34.0...frontend-v3.35.0) (2026-10-13)


### Features

* **charts:** tap-to-pin chart readout on touch devices ([#1835](https://github.com/taverns-red/toast-stats/issues/1835)) ([#1939](https://github.com/taverns-red/toast-stats/issues/1939)) ([a54f297](https://github.com/taverns-red/toast-stats/commit/a54f297d8a3165353eb3bf79fa44051d044b9bf2))
* **club:** club page on the mobile primitives — hero ≤ 200 px, history row, static mini-map ([#1843](https://github.com/taverns-red/toast-stats/issues/1843)) ([#1950](https://github.com/taverns-red/toast-stats/issues/1950)) ([6a9150f](https://github.com/taverns-red/toast-stats/commit/6a9150fe609ad66c44740ce49083cf53dedea615))
* **club:** multi-year membership context on the club page ([#1791](https://github.com/taverns-red/toast-stats/issues/1791)) ([#1955](https://github.com/taverns-red/toast-stats/issues/1955)) ([a562eba](https://github.com/taverns-red/toast-stats/commit/a562ebac438ffd15826e0437c301ee21c77393c0))
* **clubs:** Coach column, filter, phone flag and CSV export ([#1954](https://github.com/taverns-red/toast-stats/issues/1954)) ([#1963](https://github.com/taverns-red/toast-stats/issues/1963)) ([0e84331](https://github.com/taverns-red/toast-stats/commit/0e843317fe6b9f030450f209d0526359f712825e))
* **growth:** district Club Growth funnel — /district/:id/growth ([#1794](https://github.com/taverns-red/toast-stats/issues/1794)) ([#1948](https://github.com/taverns-red/toast-stats/issues/1948)) ([587f56a](https://github.com/taverns-red/toast-stats/commit/587f56adc88df7cafeda3dbc882bfbac46a36106))
* **map:** ?view=list uses the shared MobileRowList rows ([#1945](https://github.com/taverns-red/toast-stats/issues/1945)) ([#1964](https://github.com/taverns-red/toast-stats/issues/1964)) ([36bddd3](https://github.com/taverns-red/toast-stats/commit/36bddd33790353962f7ea0e3276b30dc4da72ae9))
* **map:** keyboard navigation between map pins ([#1940](https://github.com/taverns-red/toast-stats/issues/1940)) ([#1966](https://github.com/taverns-red/toast-stats/issues/1966)) ([90e11f2](https://github.com/taverns-red/toast-stats/commit/90e11f22bdacf4dfacd357d571a19df6510a9447))
* **map:** realignment sandbox on the district map ([#1819](https://github.com/taverns-red/toast-stats/issues/1819)) ([#1951](https://github.com/taverns-red/toast-stats/issues/1951)) ([a68e450](https://github.com/taverns-red/toast-stats/commit/a68e450c8aa4ccfb783f50fe4dcc5e9e2ed74222))


### Bug Fixes

* **map:** 44px tap targets for the basemap credit links ([#1944](https://github.com/taverns-red/toast-stats/issues/1944)) ([#1961](https://github.com/taverns-red/toast-stats/issues/1961)) ([f44ceed](https://github.com/taverns-red/toast-stats/commit/f44ceede7329fa866acaf99aa05104023ff240a5))
* **map:** render 24-hour meeting times without an am/pm suffix ([#1958](https://github.com/taverns-red/toast-stats/issues/1958)) ([#1959](https://github.com/taverns-red/toast-stats/issues/1959)) ([881eaf9](https://github.com/taverns-red/toast-stats/commit/881eaf9e7a2cd0d92450095d38598100d9da5e2b))


### Performance

* **map:** static club preview while MapLibre loads; re-baseline first tile to ~4 s ([#1943](https://github.com/taverns-red/toast-stats/issues/1943)) ([#1965](https://github.com/taverns-red/toast-stats/issues/1965)) ([44e1bd7](https://github.com/taverns-red/toast-stats/commit/44e1bd725add4581dbcb87a2bf0519f370cae7f2))

## [3.34.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.33.0...frontend-v3.34.0) (2026-10-13)


### Features

* **clubs:** membership-trend sparkline column, sortable by net change ([#1792](https://github.com/taverns-red/toast-stats/issues/1792)) ([#1930](https://github.com/taverns-red/toast-stats/issues/1930)) ([c455a31](https://github.com/taverns-red/toast-stats/commit/c455a31c92d7f2b6cfa6f9d16b5deeb1a3e4fdc0))
* **map:** visit-round, online-capable, division/area filters + richer club summary ([#1788](https://github.com/taverns-red/toast-stats/issues/1788)) ([#1941](https://github.com/taverns-red/toast-stats/issues/1941)) ([b1e9061](https://github.com/taverns-red/toast-stats/commit/b1e90614c3a43272ccf184c10835028df4c38a2e))
* **trends:** membership trend spans the whole program year against prior years ([#1705](https://github.com/taverns-red/toast-stats/issues/1705)) ([#1937](https://github.com/taverns-red/toast-stats/issues/1937)) ([a3dd754](https://github.com/taverns-red/toast-stats/commit/a3dd754323907100b6a22004f80dc8b8a7946e0c))
* **world:** worldwide country choropleth on /history/countries ([#1797](https://github.com/taverns-red/toast-stats/issues/1797)) ([#1935](https://github.com/taverns-red/toast-stats/issues/1935)) ([be9b2ea](https://github.com/taverns-red/toast-stats/commit/be9b2eabc7585f2f2fd41e47fdb624ab7708dda6))


### Bug Fixes

* **analytics:** one GA page_view per load and per SPA navigation ([#1946](https://github.com/taverns-red/toast-stats/issues/1946)) ([#1949](https://github.com/taverns-red/toast-stats/issues/1949)) ([c420644](https://github.com/taverns-red/toast-stats/commit/c42064443fd49a2d37cfa53bbf3a65f54b8d1196))


### Tests

* **e2e:** wait for snapshot dates before asserting the date selector ([#1947](https://github.com/taverns-red/toast-stats/issues/1947)) ([#1952](https://github.com/taverns-red/toast-stats/issues/1952)) ([972c332](https://github.com/taverns-red/toast-stats/commit/972c3324a460b7ae2fde3f0300a8cae8b165bd9f))

## [3.33.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.32.0...frontend-v3.33.0) (2026-10-13)


### Features

* **map:** district club map — /district/:id/map with health/tier/division/area pins ([#1784](https://github.com/taverns-red/toast-stats/issues/1784)) ([#1925](https://github.com/taverns-red/toast-stats/issues/1925)) ([74f21e7](https://github.com/taverns-red/toast-stats/commit/74f21e77d219c58c762b8fe475e9594096049e65))
* **map:** self-hosted Protomaps PMTiles basemap groundwork + ADR-016 ([#1786](https://github.com/taverns-red/toast-stats/issues/1786)) ([#1919](https://github.com/taverns-red/toast-stats/issues/1919)) ([2e59344](https://github.com/taverns-red/toast-stats/commit/2e593440590aab4dd370fe4615e6ff119b7b7c89))
* **mobile:** Clubs first row at 188px in phone landscape — toolbar in the context bar ([#1912](https://github.com/taverns-red/toast-stats/issues/1912)) ([#1923](https://github.com/taverns-red/toast-stats/issues/1923)) ([f9d97c3](https://github.com/taverns-red/toast-stats/commit/f9d97c3079a712a75bcf4a6b046260d8b50631c2))


### Bug Fixes

* **landing:** stack the tablet header, keep nav links on one line ([#1917](https://github.com/taverns-red/toast-stats/issues/1917)) ([#1931](https://github.com/taverns-red/toast-stats/issues/1931)) ([0050a65](https://github.com/taverns-red/toast-stats/commit/0050a65cc15c40a85d52607899288d08311ad666))
* staging smoke passes against prod; BottomSheet returns focus in WebKit ([#1920](https://github.com/taverns-red/toast-stats/issues/1920)) ([#1921](https://github.com/taverns-red/toast-stats/issues/1921)) ([a69545f](https://github.com/taverns-red/toast-stats/commit/a69545f6739a17fa52f0276ea7a1c2cef1c09d25))


### Performance

* **district:** lazy-load GlobalRankingsTab so the hub stops waiting on Recharts ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#1924](https://github.com/taverns-red/toast-stats/issues/1924)) ([33eb2a9](https://github.com/taverns-red/toast-stats/commit/33eb2a92b534c9352d9c651b8a74695edd7e4807))
* **district:** paint the hub tiles in the /district/:id route fallback on phones ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#1926](https://github.com/taverns-red/toast-stats/issues/1926)) ([d6ff67d](https://github.com/taverns-red/toast-stats/commit/d6ff67d51acaee8d083899c2ccd0fca0cfc15ee0))


### Tests

* **mobile:** 375 smoke for the phone divisions page — rows, no area tables, ≤6,000px ([#1844](https://github.com/taverns-red/toast-stats/issues/1844)) ([#1929](https://github.com/taverns-red/toast-stats/issues/1929)) ([956060b](https://github.com/taverns-red/toast-stats/commit/956060b7308cd41fb150fa9cb03b97d0a9f50b97))

## [3.32.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.31.0...frontend-v3.32.0) (2026-10-12)


### Features

* **collector:** dated education ledger history backfill 2003-04 → 2018-19, staging only ([#1802](https://github.com/taverns-red/toast-stats/issues/1802)) ([#1908](https://github.com/taverns-red/toast-stats/issues/1908)) ([c62b07f](https://github.com/taverns-red/toast-stats/commit/c62b07fd6639a5515173e0ca83882ed8895ce245))
* **mobile:** club grid — names on tap in a sheet, 44px tiles, 14px legend ([#1845](https://github.com/taverns-red/toast-stats/issues/1845)) ([#1902](https://github.com/taverns-red/toast-stats/issues/1902)) ([e05978b](https://github.com/taverns-red/toast-stats/commit/e05978b419b2ff6a2999eb35583e750f64b555f5))
* **mobile:** landing first screen — search first, orientation in the context sheet, edge-aware chip fades ([#1846](https://github.com/taverns-red/toast-stats/issues/1846)) ([#1909](https://github.com/taverns-red/toast-stats/issues/1909)) ([984fa73](https://github.com/taverns-red/toast-stats/commit/984fa73cf4497e6bae4ac856c635ea82a7131d9f))
* **mobile:** safe-area + landscape — viewport-fit=cover, inset-padded chrome, dvh sheets, phone chrome in landscape ([#1847](https://github.com/taverns-red/toast-stats/issues/1847)) ([#1907](https://github.com/taverns-red/toast-stats/issues/1907)) ([3f00a94](https://github.com/taverns-red/toast-stats/commit/3f00a947a4935d706c226ce221327e2062f0391e))


### Bug Fixes

* **a11y:** AA contrast for chart legends and the dark projected pill at 768/1280 ([#1904](https://github.com/taverns-red/toast-stats/issues/1904)) ([#1914](https://github.com/taverns-red/toast-stats/issues/1914)) ([38b4236](https://github.com/taverns-red/toast-stats/commit/38b4236b2d5e4380d7fac5b06f09ee93f3bc50ef))
* **cls:** division/area pages keep their chrome while loading ([#1896](https://github.com/taverns-red/toast-stats/issues/1896)) ([#1915](https://github.com/taverns-red/toast-stats/issues/1915)) ([7fb331b](https://github.com/taverns-red/toast-stats/commit/7fb331b6e28a71bc4a26c94bd2822df6e9ef8f92))


### Performance

* **club:** paint the club hero from the district snapshot, load analytics after it ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#1910](https://github.com/taverns-red/toast-stats/issues/1910)) ([beb4110](https://github.com/taverns-red/toast-stats/commit/beb411097e9a83f0928f08da173e45bfddd5169f))
* **mobile:** load gtag after the first screen settles; 5 KB favicon set ([#1906](https://github.com/taverns-red/toast-stats/issues/1906)) ([#1916](https://github.com/taverns-red/toast-stats/issues/1916)) ([da6a566](https://github.com/taverns-red/toast-stats/commit/da6a566d05f8a210cdbacc816b685dfa205c36df))
* **mobile:** self-host the web fonts, drop the Google Fonts chain ([#1905](https://github.com/taverns-red/toast-stats/issues/1905)) ([#1918](https://github.com/taverns-red/toast-stats/issues/1918)) ([aa310d5](https://github.com/taverns-red/toast-stats/commit/aa310d59f8e68f439beaac68388545f924a65d35))


### Tests

* **e2e:** kpi-tier-labels drives the hub sheets and ?py= ([#1903](https://github.com/taverns-red/toast-stats/issues/1903)) ([#1913](https://github.com/taverns-red/toast-stats/issues/1913)) ([174183b](https://github.com/taverns-red/toast-stats/commit/174183b7095f0455ce6a78144c492f4edce4ca82))

## [3.31.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.30.0...frontend-v3.31.0) (2026-10-12)


### Features

* **mobile:** district Overview hub below 768 — 2x2 KPI tiles, Needs attention, sections as rows ([#1842](https://github.com/taverns-red/toast-stats/issues/1842)) ([#1893](https://github.com/taverns-red/toast-stats/issues/1893)) ([ea9bab4](https://github.com/taverns-red/toast-stats/commit/ea9bab453d70d78228852ae06d483f86dbba9e75))


### Bug Fixes

* **cls:** reserve district subpage data slots + CLS gate on every subpage ([#1837](https://github.com/taverns-red/toast-stats/issues/1837)) ([#1897](https://github.com/taverns-red/toast-stats/issues/1897)) ([4bc8efe](https://github.com/taverns-red/toast-stats/commit/4bc8efedb902c49a42df031ec17bdd00235b994f))
* **mobile:** ≥44px row/heading links and AA contrast fixes ([#1839](https://github.com/taverns-red/toast-stats/issues/1839)) ([#1894](https://github.com/taverns-red/toast-stats/issues/1894)) ([d4baa1c](https://github.com/taverns-red/toast-stats/commit/d4baa1c8f045534a854b444304905fe7224c980e))
* **mobile:** form controls 16px below 768 — no iOS focus zoom ([#1838](https://github.com/taverns-red/toast-stats/issues/1838)) ([#1892](https://github.com/taverns-red/toast-stats/issues/1892)) ([a1a44b0](https://github.com/taverns-red/toast-stats/commit/a1a44b0f9b3e8edb6471b31d993b839d0a5e1075))
* **mobile:** phone type floor — 14px data/links/pills, 12px eyebrows ([#1840](https://github.com/taverns-red/toast-stats/issues/1840)) ([#1898](https://github.com/taverns-red/toast-stats/issues/1898)) ([ab0beae](https://github.com/taverns-red/toast-stats/commit/ab0beae9f558062d24bcb534bc36a624f03653f6))
* **mobile:** retitle the Overview panel 'Details' under the phone hub ([#1842](https://github.com/taverns-red/toast-stats/issues/1842)) ([#1899](https://github.com/taverns-red/toast-stats/issues/1899)) ([696c211](https://github.com/taverns-red/toast-stats/commit/696c211e41a808579c994a55b69439d3d9842e3f))


### Tests

* **frontend:** de-flake rankingsCheckpoint thin-wrapper test ([#1779](https://github.com/taverns-red/toast-stats/issues/1779)) ([#1889](https://github.com/taverns-red/toast-stats/issues/1889)) ([7155d40](https://github.com/taverns-red/toast-stats/commit/7155d40bc7fe42603d46e4685882f164190f468c))
* **mobile:** 375 smoke for phone clubs rows + FilterSheet URL round-trip ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1890](https://github.com/taverns-red/toast-stats/issues/1890)) ([d1aa0b8](https://github.com/taverns-red/toast-stats/commit/d1aa0b81d09b5641f291d2d31f69832ff80c0525))

## [3.30.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.29.0...frontend-v3.30.0) (2026-10-12)


### Features

* **mobile:** landing rankings use priority columns; retire MOBILE_RANKINGS_CAP ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1883](https://github.com/taverns-red/toast-stats/issues/1883)) ([4a8e8c8](https://github.com/taverns-red/toast-stats/commit/4a8e8c85b2da775a340060651343b5843a9d554a))
* **mobile:** phone rankings reveal 25 at a time (?rows=, ?district= pin); landing budget in CI ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1887](https://github.com/taverns-red/toast-stats/issues/1887)) ([a2fdcec](https://github.com/taverns-red/toast-stats/commit/a2fdcec87dea28c879dad97f06e9d622701294c6))


### Bug Fixes

* **mobile:** section bar labels 14px with 8px between targets ([#1832](https://github.com/taverns-red/toast-stats/issues/1832)) ([#1884](https://github.com/taverns-red/toast-stats/issues/1884)) ([4a2cb42](https://github.com/taverns-red/toast-stats/commit/4a2cb42f6c305af560d58dd90dddb4c8f2659ab7))

## [3.29.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.28.0...frontend-v3.29.0) (2026-10-12)


### Features

* **club:** never display a club's online meeting link ([#1879](https://github.com/taverns-red/toast-stats/issues/1879)) ([#1882](https://github.com/taverns-red/toast-stats/issues/1882)) ([fdc6799](https://github.com/taverns-red/toast-stats/commit/fdc679956727e8fbe608d553feb659b6ef507a53))
* **mobile:** priority columns on the Division/Area area table ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1881](https://github.com/taverns-red/toast-stats/issues/1881)) ([c7642f6](https://github.com/taverns-red/toast-stats/commit/c7642f660b08ef887237b9557706e7c32b49d1f3))

## [3.28.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.27.0...frontend-v3.28.0) (2026-10-12)


### Features

* **mobile:** priority columns on history worldwide, club history, regions leaderboard ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1877](https://github.com/taverns-red/toast-stats/issues/1877)) ([af34dfd](https://github.com/taverns-red/toast-stats/commit/af34dfdfa4e935cd0c5f451090ac302dc41272ac))

## [3.27.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.26.1...frontend-v3.27.0) (2026-10-12)


### Features

* **club:** Compliance panel + Awards/Coach stat cells ([#1790](https://github.com/taverns-red/toast-stats/issues/1790)) ([#1855](https://github.com/taverns-red/toast-stats/issues/1855)) ([10f140c](https://github.com/taverns-red/toast-stats/commit/10f140c62957695c7ef8af360e9266f0312a8bb5))
* **club:** Education panel from the reports ledger (Legacy/Pathways/DTM) ([#1790](https://github.com/taverns-red/toast-stats/issues/1790)) ([#1826](https://github.com/taverns-red/toast-stats/issues/1826)) ([a04643c](https://github.com/taverns-red/toast-stats/commit/a04643cde72a2467da938efdd8f279780786ffa4))
* **club:** hero where-it-meets line + Contact on toastmasters.org, 3.2 layout order ([#1783](https://github.com/taverns-red/toast-stats/issues/1783)) ([#1823](https://github.com/taverns-red/toast-stats/issues/1823)) ([b923d30](https://github.com/taverns-red/toast-stats/commit/b923d30c9c5eb96b123d607f3722dcef00267631))
* **mobile:** action list and club mini-list use compact rows below 768 ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1871](https://github.com/taverns-red/toast-stats/issues/1871)) ([5261942](https://github.com/taverns-red/toast-stats/commit/5261942e30ebb95e182cc5c00eb12ab35b49560b))
* **mobile:** area page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1866](https://github.com/taverns-red/toast-stats/issues/1866)) ([1f4da98](https://github.com/taverns-red/toast-stats/commit/1f4da9879f77980f0e957ea65eba12f07f0c34be))
* **mobile:** bottom section bar — 4 routes + More sheet on district routes below 768 ([#1832](https://github.com/taverns-red/toast-stats/issues/1832)) ([#1864](https://github.com/taverns-red/toast-stats/issues/1864)) ([10a9376](https://github.com/taverns-red/toast-stats/commit/10a9376eed1411301537b5f463095e043e38d242))
* **mobile:** club history page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1868](https://github.com/taverns-red/toast-stats/issues/1868)) ([f6dd19f](https://github.com/taverns-red/toast-stats/commit/f6dd19fec0235d7f399b26c34063dd93f895a903))
* **mobile:** club page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1867](https://github.com/taverns-red/toast-stats/issues/1867)) ([fbda9f8](https://github.com/taverns-red/toast-stats/commit/fbda9f8737a030c169ec38e55af2498fe13a01f7))
* **mobile:** clubs-world bottom section bar — 3 routes + More below 768 ([#1832](https://github.com/taverns-red/toast-stats/issues/1832)) ([#1873](https://github.com/taverns-red/toast-stats/issues/1873)) ([11562cc](https://github.com/taverns-red/toast-stats/commit/11562cc74e10a70a470696bf55ed0073fb996349))
* **mobile:** clubs-world pages get the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1870](https://github.com/taverns-red/toast-stats/issues/1870)) ([1512937](https://github.com/taverns-red/toast-stats/commit/151293771b1a2a588b1d4de64fc54a288383ac32))
* **mobile:** division page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1863](https://github.com/taverns-red/toast-stats/issues/1863)) ([74e0dd5](https://github.com/taverns-red/toast-stats/commit/74e0dd5565576a7d1eac67e7116e688a98888214))
* **mobile:** divisions list as compact rows below 768 ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1861](https://github.com/taverns-red/toast-stats/issues/1861)) ([670a89a](https://github.com/taverns-red/toast-stats/commit/670a89a8c0e68b67df0a8fe1ca8f501a269c7a2e))
* **mobile:** MobileRowList + grouped clubs list below 768 ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1859](https://github.com/taverns-red/toast-stats/issues/1859)) ([d53375a](https://github.com/taverns-red/toast-stats/commit/d53375ab16709ec9249699bd00d1a11e36661adb))
* **mobile:** one-row phone toolbar on the clubs list — trigger beside search, preset in the sheet ([#1836](https://github.com/taverns-red/toast-stats/issues/1836)) ([#1876](https://github.com/taverns-red/toast-stats/issues/1876)) ([e5f2014](https://github.com/taverns-red/toast-stats/commit/e5f20142aefe44a808689e446359f1a0fd660ff8))
* **mobile:** phone context bar + bottom sheet replace the district header stack below 768 ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1860](https://github.com/taverns-red/toast-stats/issues/1860)) ([8c58183](https://github.com/taverns-red/toast-stats/commit/8c58183146e1d3ca01d0eac5c596232f8e8c28b9))
* **mobile:** PriorityColumnsTable primitive + region table adoption ([#1834](https://github.com/taverns-red/toast-stats/issues/1834)) ([#1875](https://github.com/taverns-red/toast-stats/issues/1875)) ([526d76a](https://github.com/taverns-red/toast-stats/commit/526d76a1f20f241e73092e27016d41d451e4c97d))
* **mobile:** progress summary collapses per division below 768 ([#1862](https://github.com/taverns-red/toast-stats/issues/1862)) ([#1865](https://github.com/taverns-red/toast-stats/issues/1865)) ([2f660ac](https://github.com/taverns-red/toast-stats/commit/2f660ac43f37ef95facb14c78c8b8bf81c452100))
* **mobile:** race table uses compact rows below 768 ([#1833](https://github.com/taverns-red/toast-stats/issues/1833)) ([#1872](https://github.com/taverns-red/toast-stats/issues/1872)) ([33f5add](https://github.com/taverns-red/toast-stats/commit/33f5add2a2955b723cebdcf8d1c19ead38e20ca0))
* **mobile:** region page gets the phone context bar ([#1831](https://github.com/taverns-red/toast-stats/issues/1831)) ([#1869](https://github.com/taverns-red/toast-stats/issues/1869)) ([4c970bc](https://github.com/taverns-red/toast-stats/commit/4c970bc45db541d352a0c73b8be64a7209621354))
* **mobile:** shared Filter & sort bottom sheet, adopted on the clubs list ([#1836](https://github.com/taverns-red/toast-stats/issues/1836)) ([#1874](https://github.com/taverns-red/toast-stats/issues/1874)) ([033122f](https://github.com/taverns-red/toast-stats/commit/033122f421aa0faca15ef68a864b334c56a77dee))


### Bug Fixes

* **mobile:** district KPI strip in flow below 768, never pinned over the Overview ([#1828](https://github.com/taverns-red/toast-stats/issues/1828)) ([#1848](https://github.com/taverns-red/toast-stats/issues/1848)) ([024e114](https://github.com/taverns-red/toast-stats/commit/024e11427f0fe17f18125522de1be03587001043))
* **mobile:** district KPI strip pins only from 1024, in flow on tablets ([#1828](https://github.com/taverns-red/toast-stats/issues/1828)) ([#1857](https://github.com/taverns-red/toast-stats/issues/1857)) ([826e529](https://github.com/taverns-red/toast-stats/commit/826e529e0897268e1f20284f8a9f2eccc61d3e9b))
* **mobile:** section nav centres the active link, with edge fade cues ([#1829](https://github.com/taverns-red/toast-stats/issues/1829)) ([#1849](https://github.com/taverns-red/toast-stats/issues/1849)) ([fd98361](https://github.com/taverns-red/toast-stats/commit/fd98361c0115164206ebbee8a89dc7fbd10140b0))
* **shell:** restore the CommandPalette CSS comment opener ([#1851](https://github.com/taverns-red/toast-stats/issues/1851)) ([#1854](https://github.com/taverns-red/toast-stats/issues/1854)) ([75fe7a6](https://github.com/taverns-red/toast-stats/commit/75fe7a6b7cd2ca21fd34c7ec17f62ddd4841ebe7))


### Performance

* **mobile:** club route drops club-index.json; landing reads v1/dates.json ([#1830](https://github.com/taverns-red/toast-stats/issues/1830)) ([#1827](https://github.com/taverns-red/toast-stats/issues/1827)) ([#1850](https://github.com/taverns-red/toast-stats/issues/1850)) ([230c8fe](https://github.com/taverns-red/toast-stats/commit/230c8fe720e3b3379e71a805fd438f275d7eaa07))
* **mobile:** GA after load, charts chunk route-only + critical-path CI check ([#1830](https://github.com/taverns-red/toast-stats/issues/1830)) ([#1827](https://github.com/taverns-red/toast-stats/issues/1827)) ([#1853](https://github.com/taverns-red/toast-stats/issues/1853)) ([50fdd33](https://github.com/taverns-red/toast-stats/commit/50fdd33fbc7858b5ee4c1bb6ebe3eaa5b34c24c3))


### Dependencies

* **deps:** bump the patch-and-minor group across 1 directory with 5 updates ([#1656](https://github.com/taverns-red/toast-stats/issues/1656)) ([3b055a7](https://github.com/taverns-red/toast-stats/commit/3b055a78e72a5cf4c79463ca956a0f731b31f6d2))

## [3.26.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.26.0...frontend-v3.26.1) (2026-10-07)


### Refactors

* delete 32 verified-dead frontend files ([#1687](https://github.com/taverns-red/toast-stats/issues/1687)) ([#1692](https://github.com/taverns-red/toast-stats/issues/1692)) ([f64d0ac](https://github.com/taverns-red/toast-stats/commit/f64d0ac0b2a1b4726edcaef15dc92c94e91001d4))


### Tests

* behavioural tests for cdnTimeSeries, transformServiceFactory, createVerboseLogger ([#1687](https://github.com/taverns-red/toast-stats/issues/1687)) ([#1690](https://github.com/taverns-red/toast-stats/issues/1690)) ([8316cb1](https://github.com/taverns-red/toast-stats/commit/8316cb16883f0a1186fe18d7fd674d19535a8045))
* behavioural tests for the collector-cli, mcp-server and frontend entrypoints ([#1687](https://github.com/taverns-red/toast-stats/issues/1687)) ([#1695](https://github.com/taverns-red/toast-stats/issues/1695)) ([f9d1f53](https://github.com/taverns-red/toast-stats/commit/f9d1f53ffa9cfa655a8a231f39aea4cbd45ea821))
* behavioural tests for useGlobalHistory, textEffectsRemover, TopGrowthClubs ([#1687](https://github.com/taverns-red/toast-stats/issues/1687)) ([#1693](https://github.com/taverns-red/toast-stats/issues/1693)) ([f214519](https://github.com/taverns-red/toast-stats/commit/f2145197a74fb132b1667a69f5580ec23b8db462))

## [3.26.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.25.2...frontend-v3.26.0) (2026-10-07)


### Features

* **awards:** District Club Growth Achievement recipients on /awards ([#1537](https://github.com/taverns-red/toast-stats/issues/1537)) ([#1680](https://github.com/taverns-red/toast-stats/issues/1680)) ([3533f3f](https://github.com/taverns-red/toast-stats/commit/3533f3f0557b7c6627c20024c6f67cb778607b4b))
* **landing:** Club Growth Achievement badge on the rankings table ([#1537](https://github.com/taverns-red/toast-stats/issues/1537)) ([#1684](https://github.com/taverns-red/toast-stats/issues/1684)) ([b0b3dd3](https://github.com/taverns-red/toast-stats/commit/b0b3dd3db78d7dcc2db851834ffe921a6927a8cb))
* **recognition:** register the District Club Growth Achievement ([#1537](https://github.com/taverns-red/toast-stats/issues/1537)) ([#1679](https://github.com/taverns-red/toast-stats/issues/1679)) ([1d8857f](https://github.com/taverns-red/toast-stats/commit/1d8857fca4be9cb29bd735fc3070b18df3dc6f0c))


### Bug Fixes

* **a11y:** clear AA on district pages in both themes ([#1660](https://github.com/taverns-red/toast-stats/issues/1660)) ([#1661](https://github.com/taverns-red/toast-stats/issues/1661)) ([f12996f](https://github.com/taverns-red/toast-stats/commit/f12996ff9713cd7111abfffe03b6e31487d343b6))
* **a11y:** club timeline note + footer link clear AA ([#1648](https://github.com/taverns-red/toast-stats/issues/1648)) ([#1654](https://github.com/taverns-red/toast-stats/issues/1654)) ([c2f3a8d](https://github.com/taverns-red/toast-stats/commit/c2f3a8dc41b266d1a8660dba0c4f454910caa1e0))
* **a11y:** composition bar counts clear AA in light mode ([#1652](https://github.com/taverns-red/toast-stats/issues/1652)) ([#1659](https://github.com/taverns-red/toast-stats/issues/1659)) ([0450656](https://github.com/taverns-red/toast-stats/commit/0450656071096af0297f41f1e4934a8f450deb18))
* **awards:** count only active clubs in the 20-Plus numerator ([#1611](https://github.com/taverns-red/toast-stats/issues/1611)) ([#1633](https://github.com/taverns-red/toast-stats/issues/1633)) ([2a6bdc2](https://github.com/taverns-red/toast-stats/commit/2a6bdc2eb246cd4ed96448547c8c55266241d5a3))
* **awards:** exclude undistricted 'U' from Club Strength; note its 1490 removal ([#1613](https://github.com/taverns-red/toast-stats/issues/1613)) ([#1629](https://github.com/taverns-red/toast-stats/issues/1629)) ([2f6d607](https://github.com/taverns-red/toast-stats/commit/2f6d6078de11fe53b8f2183f3487b7fa0aa256e1))
* **awards:** label tied Top-3 co-winners honestly ([#1610](https://github.com/taverns-red/toast-stats/issues/1610)) ([#1624](https://github.com/taverns-red/toast-stats/issues/1624)) ([46051bd](https://github.com/taverns-red/toast-stats/commit/46051bd5d83d950bb004b4a3f2ebd247a68949a9))
* **awards:** Leadership Excellence — no future-PY leak, award year counts, on track mid-year ([#1609](https://github.com/taverns-red/toast-stats/issues/1609)) ([#1635](https://github.com/taverns-red/toast-stats/issues/1635)) ([c66dbcc](https://github.com/taverns-red/toast-stats/commit/c66dbcc62547d1f89097098dfb5c03571dba7bd7))
* **awards:** scope June-close charter/suspension counts to the logical snapshot date ([#1622](https://github.com/taverns-red/toast-stats/issues/1622)) ([#1625](https://github.com/taverns-red/toast-stats/issues/1625)) ([e029fa7](https://github.com/taverns-red/toast-stats/commit/e029fa7d24fa46788fdce34a3ffb3f56f2997f1d))
* **clubs:** dark-mode tier chart fills clear 3:1 ([#1636](https://github.com/taverns-red/toast-stats/issues/1636)) ([#1641](https://github.com/taverns-red/toast-stats/issues/1641)) ([91c84e5](https://github.com/taverns-red/toast-stats/commit/91c84e590385aaa9462fcb1be61b82ee4f99c02f))
* **clubs:** podium district chip renders as a compact pill ([#1617](https://github.com/taverns-red/toast-stats/issues/1617)) ([#1634](https://github.com/taverns-red/toast-stats/issues/1634)) ([19ae5d8](https://github.com/taverns-red/toast-stats/commit/19ae5d82e25b31916ee1aa67ccbb9cf34aeee1eb))
* **clubs:** race chart legend text in neutral ink ([#1616](https://github.com/taverns-red/toast-stats/issues/1616)) ([#1630](https://github.com/taverns-red/toast-stats/issues/1630)) ([576f8a9](https://github.com/taverns-red/toast-stats/commit/576f8a90364b6f604bc17b23d3a9d3b1469ef559))
* **clubs:** restyle /clubs on legacy chrome tokens ([#1606](https://github.com/taverns-red/toast-stats/issues/1606)) ([#1607](https://github.com/taverns-red/toast-stats/issues/1607)) ([220703d](https://github.com/taverns-red/toast-stats/commit/220703dfcdf07e08504db3f3857dc2275fe8e4c6))
* **district:** KPI strip waits for performance targets, fixing the flaky 1350px CLS ([#1685](https://github.com/taverns-red/toast-stats/issues/1685)) ([#1686](https://github.com/taverns-red/toast-stats/issues/1686)) ([9f622c0](https://github.com/taverns-red/toast-stats/commit/9f622c07ac75b9b159df35db4fbec85be4e19b4f))
* **district:** no horizontal scroll on /district/:id at 375/768 ([#1655](https://github.com/taverns-red/toast-stats/issues/1655)) ([#1663](https://github.com/taverns-red/toast-stats/issues/1663)) ([524ab1a](https://github.com/taverns-red/toast-stats/commit/524ab1aa2b2bc8b84ad113c63d199736389a4d76))
* every page defaults to the data-resolved program year ([#1618](https://github.com/taverns-red/toast-stats/issues/1618)) ([#1627](https://github.com/taverns-red/toast-stats/issues/1627)) ([f78ad8a](https://github.com/taverns-red/toast-stats/commit/f78ad8a8c8a3e3336b959eabf797e96eeca8e0d5))
* **frontend:** guard browser storage so the app renders when storage is blocked ([#1646](https://github.com/taverns-red/toast-stats/issues/1646)) ([#1653](https://github.com/taverns-red/toast-stats/issues/1653)) ([aba37c0](https://github.com/taverns-red/toast-stats/commit/aba37c0bb7c69d119d287d443ea8eeeb433d6c79))
* **shell:** no horizontal page scroll at 375/768 — top bar fits the viewport ([#1651](https://github.com/taverns-red/toast-stats/issues/1651)) ([#1657](https://github.com/taverns-red/toast-stats/issues/1657)) ([6cd7aab](https://github.com/taverns-red/toast-stats/commit/6cd7aabb0acf734db0caf6b2b16e3c9fb280a573))
* **theme:** page canvas paints --bg in both themes ([#1662](https://github.com/taverns-red/toast-stats/issues/1662)) ([#1664](https://github.com/taverns-red/toast-stats/issues/1664)) ([36da73f](https://github.com/taverns-red/toast-stats/commit/36da73f15d290f30e8c4485ca12c786abda60446))


### Performance

* **district:** reserve every Overview slot — /district/:id CLS under 0.1 ([#1647](https://github.com/taverns-red/toast-stats/issues/1647)) ([#1658](https://github.com/taverns-red/toast-stats/issues/1658)) ([3320e5d](https://github.com/taverns-red/toast-stats/commit/3320e5dabc5a27b009052fcf9202ac0bfb84d06c))


### Documentation

* **methodology:** Distinguished Percent divides by club base ([#1615](https://github.com/taverns-red/toast-stats/issues/1615)) ([#1631](https://github.com/taverns-red/toast-stats/issues/1631)) ([205455e](https://github.com/taverns-red/toast-stats/commit/205455e5401c8453c2ac7a0b3d956c7c42bc11fa))

## [3.25.2](https://github.com/taverns-red/toast-stats/compare/frontend-v3.25.1...frontend-v3.25.2) (2026-10-03)


### Dependencies

* **deps:** bump the patch-and-minor group across 1 directory with 18 updates ([#1604](https://github.com/taverns-red/toast-stats/issues/1604)) ([0f42c54](https://github.com/taverns-red/toast-stats/commit/0f42c548ffb240d7496945b09c9ea7b21b3cbd7b))
* **deps:** bump the prod-deps group across 1 directory with 6 updates ([#1582](https://github.com/taverns-red/toast-stats/issues/1582)) ([0c9fe54](https://github.com/taverns-red/toast-stats/commit/0c9fe5459f2e77b78e862235877b66237a8f7a9d))

## [3.25.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.25.0...frontend-v3.25.1) (2026-10-03)


### Bug Fixes

* **collector:** count education-award members only for counted awards ([#1599](https://github.com/taverns-red/toast-stats/issues/1599)) ([#1600](https://github.com/taverns-red/toast-stats/issues/1600)) ([9abaae2](https://github.com/taverns-red/toast-stats/commit/9abaae2c859e7ac0548a3f3a848f0bf23cc33c87))

## [3.25.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.24.1...frontend-v3.25.0) (2026-10-02)


### Features

* **analytics:** education award leaderboards ([#1592](https://github.com/taverns-red/toast-stats/issues/1592)) ([#1593](https://github.com/taverns-red/toast-stats/issues/1593)) ([504f792](https://github.com/taverns-red/toast-stats/commit/504f7926f2ae5a3970863669e505a301e64ee59d))

## [3.24.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.24.0...frontend-v3.24.1) (2026-09-29)


### Bug Fixes

* **clubs:** apply a verified renewal only within the dues period it pays for ([#1586](https://github.com/taverns-red/toast-stats/issues/1586)) ([#1587](https://github.com/taverns-red/toast-stats/issues/1587)) ([6282da2](https://github.com/taverns-red/toast-stats/commit/6282da27b1c880ba1b148e4fe79cc2f441d2d3c5))

## [3.24.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.23.0...frontend-v3.24.0) (2026-09-14)


### Features

* **action-list:** restructure the four sections into aligned 28px tables ([#1577](https://github.com/taverns-red/toast-stats/issues/1577)) ([#1578](https://github.com/taverns-red/toast-stats/issues/1578)) ([6c0389a](https://github.com/taverns-red/toast-stats/commit/6c0389ae0b41bd83ed3e69ec812c7db926c6bad7))


### Dependencies

* **deps:** bump the patch-and-minor group with 13 updates ([#1576](https://github.com/taverns-red/toast-stats/issues/1576)) ([89caddc](https://github.com/taverns-red/toast-stats/commit/89caddc2e6bd254d79a926d276a730cbbdfa3a34))

## [3.23.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.22.0...frontend-v3.23.0) (2026-09-13)


### Features

* **action-list:** collapsible sections, with the Club Success Plan section pinned first while actionable ([#1569](https://github.com/taverns-red/toast-stats/issues/1569)) ([#1571](https://github.com/taverns-red/toast-stats/issues/1571)) ([56d8194](https://github.com/taverns-red/toast-stats/commit/56d81947be779023c4b13a6d4179e8c4c76cb1f8))


### Bug Fixes

* **clubs:** count each club once at its top tier; stack the pack chart ([#1570](https://github.com/taverns-red/toast-stats/issues/1570)) ([#1573](https://github.com/taverns-red/toast-stats/issues/1573)) ([ac5fa9d](https://github.com/taverns-red/toast-stats/commit/ac5fa9d061467121edfecc0f4af71bdd0c8d6b3f))

## [3.22.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.21.2...frontend-v3.22.0) (2026-09-13)


### Features

* action-list section + CSV export for clubs without a Club Success Plan ([#1555](https://github.com/taverns-red/toast-stats/issues/1555), 3/4) ([#1561](https://github.com/taverns-red/toast-stats/issues/1561)) ([52109a3](https://github.com/taverns-red/toast-stats/commit/52109a3c72b37fc54a1523c1b08e5ab496b4205d))
* Club Success Plan clauses in the area and division narratives ([#1555](https://github.com/taverns-red/toast-stats/issues/1555), 2/4) ([#1559](https://github.com/taverns-red/toast-stats/issues/1559)) ([d507dac](https://github.com/taverns-red/toast-stats/commit/d507dac6146397e15befe16440d7c60544e1d3a9))
* **clubs:** /clubs hub and /clubs/race/:tier routed subpages ([#1556](https://github.com/taverns-red/toast-stats/issues/1556), 3/4) ([#1562](https://github.com/taverns-red/toast-stats/issues/1562)) ([5dab761](https://github.com/taverns-red/toast-stats/commit/5dab761c062debdac2745bd487cbcf27c6e42b98))
* **clubs:** club-page Worldwide standing card + /methodology#club-race basis ([#1556](https://github.com/taverns-red/toast-stats/issues/1556), 4/4) ([#1564](https://github.com/taverns-red/toast-stats/issues/1564)) ([f42a422](https://github.com/taverns-red/toast-stats/commit/f42a422c6847d404943436ba1ccbda9f2827fc35))
* district overview Club Success Plan completion line ([#1555](https://github.com/taverns-red/toast-stats/issues/1555), 4/4) ([#1563](https://github.com/taverns-red/toast-stats/issues/1563)) ([4be5745](https://github.com/taverns-red/toast-stats/commit/4be5745fc7c1ac9fb9fda690244619060c9a2e7a))
* isCspRequired rule + per-area/division Club Success Plan completion fields ([#1555](https://github.com/taverns-red/toast-stats/issues/1555), 1/4) ([#1557](https://github.com/taverns-red/toast-stats/issues/1557)) ([af2bf25](https://github.com/taverns-red/toast-stats/commit/af2bf2533567db27437a576f1aec3021a2bf00e9))


### Bug Fixes

* **csp:** per-club Club Success Plan due dates and deadline-aware copy ([#1565](https://github.com/taverns-red/toast-stats/issues/1565)) ([#1567](https://github.com/taverns-red/toast-stats/issues/1567)) ([d32d7b0](https://github.com/taverns-red/toast-stats/commit/d32d7b05b5e35f77195767c71fc791b379ec2cad))

## [3.21.2](https://github.com/taverns-red/toast-stats/compare/frontend-v3.21.1...frontend-v3.21.2) (2026-09-09)


### Bug Fixes

* **analytics:** DCP goals 5-6 unreadable for five program years — restore the 2020-07 → 2025-06 header aliases ([#1539](https://github.com/taverns-red/toast-stats/issues/1539)) ([#1546](https://github.com/taverns-red/toast-stats/issues/1546)) ([f6b0efa](https://github.com/taverns-red/toast-stats/commit/f6b0efadf7c769c11777446cd22ec945eb91ae35))

## [3.21.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.21.0...frontend-v3.21.1) (2026-09-02)


### Bug Fixes

* **ui:** lift KPI tier thresholds off the bullet bar into a flow legend ([#1517](https://github.com/taverns-red/toast-stats/issues/1517)) ([#1518](https://github.com/taverns-red/toast-stats/issues/1518)) ([8786e9e](https://github.com/taverns-red/toast-stats/commit/8786e9e842b3672a7cf5f55f1735d93129fa32b6))

## [3.21.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.20.0...frontend-v3.21.0) (2026-09-01)


### Features

* **frontend:** the worldwide scoreboard extends /history + methodology definitions ([#1500](https://github.com/taverns-red/toast-stats/issues/1500)) ([#1513](https://github.com/taverns-red/toast-stats/issues/1513)) ([b24c3b5](https://github.com/taverns-red/toast-stats/commit/b24c3b56927aae51606c3e2dcf15f7df85231bae))
* **pipeline:** snapshots/{date}/global-totals.json — the per-date worldwide rollup ([#1498](https://github.com/taverns-red/toast-stats/issues/1498)) ([#1509](https://github.com/taverns-red/toast-stats/issues/1509)) ([b7fdeb3](https://github.com/taverns-red/toast-stats/commit/b7fdeb3ab99a406a6a7e37687d1eb2a829712941))


### Bug Fixes

* **analytics:** a known reformation boundary is the evidence a realignment happened, not the roster's size ([#1470](https://github.com/taverns-red/toast-stats/issues/1470)) ([#1507](https://github.com/taverns-red/toast-stats/issues/1507)) ([2e552d0](https://github.com/taverns-red/toast-stats/commit/2e552d04f2130a13b1d30ce02560b13ce23442e4))
* **recognition:** a district-wide zeroed charter count is 'not collected', not 'no milestone reached' ([#1501](https://github.com/taverns-red/toast-stats/issues/1501)) ([#1505](https://github.com/taverns-red/toast-stats/issues/1505)) ([53bd75e](https://github.com/taverns-red/toast-stats/commit/53bd75ef6c2ab2dbd37d59c0693a164e6a784132))
* **test-utils:** unmount each accessibility check's render so ids stay unique ([#1503](https://github.com/taverns-red/toast-stats/issues/1503)) ([#1506](https://github.com/taverns-red/toast-stats/issues/1506)) ([d147c54](https://github.com/taverns-red/toast-stats/commit/d147c549cce85ad3416dd0b3c7e5226528ce4f0d))

## [3.20.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.19.0...frontend-v3.20.0) (2026-09-01)


### Features

* **whats-changed:** Club Success Plan submission events in the change feed ([#1460](https://github.com/taverns-red/toast-stats/issues/1460)) ([#1494](https://github.com/taverns-red/toast-stats/issues/1494)) ([8e339e5](https://github.com/taverns-red/toast-stats/commit/8e339e5d25e023eef60c2755440c1fc15aebee78))
* **whats-changed:** CSV export on the What's Changed page, with a change-events section ([#1461](https://github.com/taverns-red/toast-stats/issues/1461)) ([#1492](https://github.com/taverns-red/toast-stats/issues/1492)) ([0d27d71](https://github.com/taverns-red/toast-stats/commit/0d27d71921802572f4a9ab262da95c5c769e82a7))
* **whats-changed:** per-club payment events with payment-type attribution ([#1459](https://github.com/taverns-red/toast-stats/issues/1459)) ([#1485](https://github.com/taverns-red/toast-stats/issues/1485)) ([b4a029f](https://github.com/taverns-red/toast-stats/commit/b4a029f2b4fdd14b0362c25b3a170bbd96f716ce))
* **whats-changed:** signed net-delta summaries in change-group headings ([#1463](https://github.com/taverns-red/toast-stats/issues/1463)) ([#1493](https://github.com/taverns-red/toast-stats/issues/1493)) ([d28e289](https://github.com/taverns-red/toast-stats/commit/d28e289e5b191fea748056a889e530d5787f8f7b))

## [3.19.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.18.1...frontend-v3.19.0) (2026-08-31)


### Features

* **frontend:** surface newCharteredClubs + a checkpoint-count resolution hook for Club Growth Achievement ([#1475](https://github.com/taverns-red/toast-stats/issues/1475)) () ([abc0af6](https://github.com/taverns-red/toast-stats/commit/abc0af67183af0e7a7099046e1bcdaf499499afd))
* **recognition:** Club Growth Achievement predicate (PY-gated) + program-year rule-change log entry ([#1474](https://github.com/taverns-red/toast-stats/issues/1474)) () ([e1489b7](https://github.com/taverns-red/toast-stats/commit/e1489b7198ff63081d5a0c30b866b967d817652a))
* **ui:** Club Growth Achievement card on the District Overview ([#1476](https://github.com/taverns-red/toast-stats/issues/1476)) ([#1487](https://github.com/taverns-red/toast-stats/issues/1487)) ([186255a](https://github.com/taverns-red/toast-stats/commit/186255aaa78598e8c42f306fa456a87a4f8c69f8))
* **whats-changed:** time-window preset chips for the date pair picker ([#1462](https://github.com/taverns-red/toast-stats/issues/1462)) ([#1486](https://github.com/taverns-red/toast-stats/issues/1486)) ([a7a7a87](https://github.com/taverns-red/toast-stats/commit/a7a7a87c3363d87ae7bec60270f1fe88676266f3))


### Bug Fixes

* **pipeline:** a snapshot directory holds only the districts that existed on its own date ([#1465](https://github.com/taverns-red/toast-stats/issues/1465)) ([#1480](https://github.com/taverns-red/toast-stats/issues/1480)) ([fcb05aa](https://github.com/taverns-red/toast-stats/commit/fcb05aa39165ef22a27de8997439a47e8cb2b75d))

## [3.18.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.18.0...frontend-v3.18.1) (2026-08-31)


### Documentation

* PY 2021-22 archive coverage is proven, not an unverified prerequisite ([#1456](https://github.com/taverns-red/toast-stats/issues/1456)) ([#1457](https://github.com/taverns-red/toast-stats/issues/1457)) ([0863a4b](https://github.com/taverns-red/toast-stats/commit/0863a4bfbc627303be9a37d692a3819faad1be53))

## [3.18.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.17.0...frontend-v3.18.0) (2026-08-23)


### Features

* **frontend:** omni-search finds every district that has ever existed, landing each on its most recent year ([#1403](https://github.com/taverns-red/toast-stats/issues/1403)) ([#1404](https://github.com/taverns-red/toast-stats/issues/1404)) ([7e4b268](https://github.com/taverns-red/toast-stats/commit/7e4b268b3fdac5233f32b0b1ec1b4618e17fa61c))
* **frontend:** OR multi-select the region filter — plain click toggles ([#1374](https://github.com/taverns-red/toast-stats/issues/1374)) ([#1379](https://github.com/taverns-red/toast-stats/issues/1379)) ([1152d49](https://github.com/taverns-red/toast-stats/commit/1152d491a70b9db3fdb1adbd6ed835bf7596e905))
* **methodology:** a tracked log of program-year rule changes ([#1400](https://github.com/taverns-red/toast-stats/issues/1400)) ([#1407](https://github.com/taverns-red/toast-stats/issues/1407)) ([75606ed](https://github.com/taverns-red/toast-stats/commit/75606ed953b89480399d85e1c8fe87dfe9d567ed))


### Bug Fixes

* **a11y:** clear every axe violation on the landing page ([#1360](https://github.com/taverns-red/toast-stats/issues/1360)) ([#1382](https://github.com/taverns-red/toast-stats/issues/1382)) ([ec97c30](https://github.com/taverns-red/toast-stats/commit/ec97c30d2681e15dc5b3d14ae5b9ef7545932513))
* **analytics:** DCP goals 2-3 read 0 for PY 2026-27 — resolve TI's 'or EOM' column rename ([#1399](https://github.com/taverns-red/toast-stats/issues/1399)) ([#1402](https://github.com/taverns-red/toast-stats/issues/1402)) ([f7ac01e](https://github.com/taverns-red/toast-stats/commit/f7ac01eeb0bfe7e18d34bce9363206294daaea8a))
* **analytics:** resolve club recognition tiers per program year — Smedley is unreachable before PY 2025-26 ([#1406](https://github.com/taverns-red/toast-stats/issues/1406)) ([#1409](https://github.com/taverns-red/toast-stats/issues/1409)) ([d77c9db](https://github.com/taverns-red/toast-stats/commit/d77c9dbdf0f9a2e357313b1a5b63896d0197b6cb))
* **frontend:** a club that moved districts no longer dead-ends on its old-district URL ([#1441](https://github.com/taverns-red/toast-stats/issues/1441)) ([#1445](https://github.com/taverns-red/toast-stats/issues/1445)) ([0a7d009](https://github.com/taverns-red/toast-stats/commit/0a7d009ea0b9789d6da56b6333c11836bdd9c271))
* **frontend:** classify distinguished word forms by substring ([#1431](https://github.com/taverns-red/toast-stats/issues/1431)) ([#1433](https://github.com/taverns-red/toast-stats/issues/1433)) ([cec5e54](https://github.com/taverns-red/toast-stats/commit/cec5e5429b395bb844a812fb949714ba2940af10))
* **frontend:** club history is keyed on the club number, and every skipped year says why ([#1437](https://github.com/taverns-red/toast-stats/issues/1437)) ([#1446](https://github.com/taverns-red/toast-stats/issues/1446)) ([4c30e85](https://github.com/taverns-red/toast-stats/commit/4c30e8590c7ddb262fb996b995899d0671b097be))
* **frontend:** give the degraded district view a program-year selector ([#1436](https://github.com/taverns-red/toast-stats/issues/1436)) ([#1444](https://github.com/taverns-red/toast-stats/issues/1444)) ([e2160d5](https://github.com/taverns-red/toast-stats/commit/e2160d5abc2523654a2bb9c8a01bd6c052896844))
* **frontend:** Payment Composition + trophy-case integers follow the selected program year ([#1396](https://github.com/taverns-red/toast-stats/issues/1396)) ([#1397](https://github.com/taverns-red/toast-stats/issues/1397)) ([5e032ca](https://github.com/taverns-red/toast-stats/commit/5e032caf02185ae8aa4d1720460f662a8894c613))
* **frontend:** the browsable district list follows the displayed program year ([#1398](https://github.com/taverns-red/toast-stats/issues/1398)) ([#1401](https://github.com/taverns-red/toast-stats/issues/1401)) ([8c9d10a](https://github.com/taverns-red/toast-stats/commit/8c9d10a29929327dfbfee96706e1bd06b30cfcc4))
* one canonical club id across the eight identity sites ([#1440](https://github.com/taverns-red/toast-stats/issues/1440)) ([#1447](https://github.com/taverns-red/toast-stats/issues/1447)) ([2577eaa](https://github.com/taverns-red/toast-stats/commit/2577eaac146fc04d49d6002ebaa91c141d844721))
* say when a district realignment moved the boundary instead of calling transfers roster churn ([#1443](https://github.com/taverns-red/toast-stats/issues/1443)) ([#1448](https://github.com/taverns-red/toast-stats/issues/1448)) ([9914555](https://github.com/taverns-red/toast-stats/commit/99145553883f9c56e8a47735e7664679b7a49a69))
* suppress district year-over-year across the 2026 reformation boundary ([#1442](https://github.com/taverns-red/toast-stats/issues/1442)) ([#1449](https://github.com/taverns-red/toast-stats/issues/1449)) ([09b36a5](https://github.com/taverns-red/toast-stats/commit/09b36a5f018ffde63bdb7d0b199c3dbec0c82383))
* **test-infra:** type the jest-axe shim's axe() options parameter ([#1389](https://github.com/taverns-red/toast-stats/issues/1389)) ([#1392](https://github.com/taverns-red/toast-stats/issues/1392)) ([430641a](https://github.com/taverns-red/toast-stats/commit/430641ab25a52c805574c58485696a8bc28da11a))
* **ui:** centre breadcrumb links inside their touch-target box — one baseline again ([#1387](https://github.com/taverns-red/toast-stats/issues/1387)) ([#1390](https://github.com/taverns-red/toast-stats/issues/1390)) ([0625428](https://github.com/taverns-red/toast-stats/commit/06254286fec94dec442d4c7bbabd21ed168d87fb))
* **ui:** clamp shared tooltip panels inside the viewport ([#1405](https://github.com/taverns-red/toast-stats/issues/1405)) ([#1410](https://github.com/taverns-red/toast-stats/issues/1410)) ([c00e09a](https://github.com/taverns-red/toast-stats/commit/c00e09ab23fd16b359864ffd9f2490a2e484e57c))


### Performance

* **fonts:** metric-matched swap fallbacks take 375px CLS 0.141 -&gt; 0.002, plus a gate that can see mobile ([#1373](https://github.com/taverns-red/toast-stats/issues/1373)) ([#1381](https://github.com/taverns-red/toast-stats/issues/1381)) ([ab797f9](https://github.com/taverns-red/toast-stats/commit/ab797f9a2cb7df3a78db141699c6be788aad8555))

## [3.17.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.16.1...frontend-v3.17.0) (2026-08-02)


### Features

* **frontend:** filter the rankings table by Recognition ([#1362](https://github.com/taverns-red/toast-stats/issues/1362)) ([#1369](https://github.com/taverns-red/toast-stats/issues/1369)) ([9a13e1b](https://github.com/taverns-red/toast-stats/commit/9a13e1bc106a2328d86d2a6aead8435cfef8015c))


### Bug Fixes

* **dark-mode:** recolour the first divide-y divider too ([#1370](https://github.com/taverns-red/toast-stats/issues/1370)); pin the lessons-index locale ([#1372](https://github.com/taverns-red/toast-stats/issues/1372)) ([#1371](https://github.com/taverns-red/toast-stats/issues/1371)) ([df9ae67](https://github.com/taverns-red/toast-stats/commit/df9ae6795760f9cfbb4574975fc183ac18e092fe))
* **frontend:** NaN program year ([#1353](https://github.com/taverns-red/toast-stats/issues/1353)), year-driven DD checklist ([#1354](https://github.com/taverns-red/toast-stats/issues/1354)), contact path ([#1356](https://github.com/taverns-red/toast-stats/issues/1356)), 640px column dead zone ([#1358](https://github.com/taverns-red/toast-stats/issues/1358)), landing CLS 0.265 → 0.004 ([#1359](https://github.com/taverns-red/toast-stats/issues/1359)) ([#1357](https://github.com/taverns-red/toast-stats/issues/1357)) ([50d858f](https://github.com/taverns-red/toast-stats/commit/50d858fdf7a8920715aba286c2f2e2708041151b))

## [3.16.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.16.0...frontend-v3.16.1) (2026-07-07)


### Bug Fixes

* **region:** key competitive-awards on snapshot date, not sourceCsvDate ([#1315](https://github.com/taverns-red/toast-stats/issues/1315)) ([#1316](https://github.com/taverns-red/toast-stats/issues/1316)) ([2ea597e](https://github.com/taverns-red/toast-stats/commit/2ea597e989bc261b45effcba25a3baed9008f484))

## [3.16.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.15.0...frontend-v3.16.0) (2026-07-04)


### Features

* **frontend:** normalize freshness pill on every page ([#1310](https://github.com/taverns-red/toast-stats/issues/1310)) ([#1311](https://github.com/taverns-red/toast-stats/issues/1311)) ([cd513f1](https://github.com/taverns-red/toast-stats/commit/cd513f1ed53d7686b94f27250756306ae7146c63))

## [3.15.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.14.0...frontend-v3.15.0) (2026-07-04)


### Features

* **frontend:** PY selector on Division, Area, Club detail/history pages ([#1302](https://github.com/taverns-red/toast-stats/issues/1302)) ([#1308](https://github.com/taverns-red/toast-stats/issues/1308)) ([089c2f0](https://github.com/taverns-red/toast-stats/commit/089c2f0a4c4b80e3cccd40cf75ecaca4e7cb251c))
* **frontend:** PY selector on Regions, Region, and Awards pages ([#1301](https://github.com/taverns-red/toast-stats/issues/1301)) ([#1305](https://github.com/taverns-red/toast-stats/issues/1305)) ([cc6a19e](https://github.com/taverns-red/toast-stats/commit/cc6a19eb19eacdad9a34cf228ad9809279de1e8c))

## [3.14.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.13.0...frontend-v3.14.0) (2026-07-03)


### Features

* **frontend:** data-driven default program year — unblock release [#1253](https://github.com/taverns-red/toast-stats/issues/1253) ([#1300](https://github.com/taverns-red/toast-stats/issues/1300)) ([#1304](https://github.com/taverns-red/toast-stats/issues/1304)) ([e42675b](https://github.com/taverns-red/toast-stats/commit/e42675bee3937cdbfcd84bd7634921622caaf82d))


### Bug Fixes

* July program-year rollover — resolve active PY by data + de-couple tests from the clock ([#1284](https://github.com/taverns-red/toast-stats/issues/1284), [#1285](https://github.com/taverns-red/toast-stats/issues/1285)) ([#1286](https://github.com/taverns-red/toast-stats/issues/1286)) ([982f045](https://github.com/taverns-red/toast-stats/commit/982f0450d41c5577c315c1c7a6c61881a96ba5a1))
* **ui:** freshness badge shows as-of date + month-end reconciliation ([#1296](https://github.com/taverns-red/toast-stats/issues/1296)) ([#1297](https://github.com/taverns-red/toast-stats/issues/1297)) ([1d3ffeb](https://github.com/taverns-red/toast-stats/commit/1d3ffeb4143a6f233c33f5f3410f51f99ad84052))


### Refactors

* rename @toastmasters/{analytics-core,shared-contracts,collector-cli} → @taverns-red/* ([#1258](https://github.com/taverns-red/toast-stats/issues/1258)) ([#1259](https://github.com/taverns-red/toast-stats/issues/1259)) ([5e33f2d](https://github.com/taverns-red/toast-stats/commit/5e33f2d7546e72eef1146b8ae84bf8a6df4903d9))


### Tests

* **ui:** pin current PY in DistrictClubsPage test to unblock release [#1253](https://github.com/taverns-red/toast-stats/issues/1253) ([#1303](https://github.com/taverns-red/toast-stats/issues/1303)) ([0dc30c5](https://github.com/taverns-red/toast-stats/commit/0dc30c5f01d885afa90165e5e4e1944f5ce0817a))

## [3.13.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.12.0...frontend-v3.13.0) (2026-06-27)


### Features

* **changes:** add 'Club status changes' group — club operational-status transitions ([#1247](https://github.com/taverns-red/toast-stats/issues/1247)) ([#1248](https://github.com/taverns-red/toast-stats/issues/1248)) ([b9c1a72](https://github.com/taverns-red/toast-stats/commit/b9c1a7255888c7258a90cf2ec148defe53a498e3))

## [3.12.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.11.2...frontend-v3.12.0) (2026-06-21)


### Features

* **area:** Area Director action list — shareable 'what to do next' ([#1231](https://github.com/taverns-red/toast-stats/issues/1231)) ([#1239](https://github.com/taverns-red/toast-stats/issues/1239)) ([7d9a998](https://github.com/taverns-red/toast-stats/commit/7d9a998363e25fb27df138828dcc0494d414d9c4))
* **club:** per-club historical view — multi-year DCP / Distinguished / membership timeline ([#1229](https://github.com/taverns-red/toast-stats/issues/1229)) ([#1235](https://github.com/taverns-red/toast-stats/issues/1235)) ([06a00d0](https://github.com/taverns-red/toast-stats/commit/06a00d0f338f0a1e3eb1945f0f3737f05cee16b8))
* **club:** restore DCP per-goal 'what's missing' breakdown on club detail ([#1227](https://github.com/taverns-red/toast-stats/issues/1227)) ([#1234](https://github.com/taverns-red/toast-stats/issues/1234)) ([37c53cf](https://github.com/taverns-red/toast-stats/commit/37c53cf7966236639543335284ac19ea6fa4d8f0))
* **district:** at-a-glance club grid (Chiclet / LEO board) — one tile per club ([#1230](https://github.com/taverns-red/toast-stats/issues/1230)) ([#1237](https://github.com/taverns-red/toast-stats/issues/1237)) ([017327d](https://github.com/taverns-red/toast-stats/commit/017327db54545a8d8675e046ab648cb058ee4502))


### Bug Fixes

* **changes:** label tier M as 'Smedley Distinguished' in change feed + CSV export ([#1226](https://github.com/taverns-red/toast-stats/issues/1226)) ([#1233](https://github.com/taverns-red/toast-stats/issues/1233)) ([c482b07](https://github.com/taverns-red/toast-stats/commit/c482b071de15872245fb2f63d343b38f2ccc6459))

## [3.11.2](https://github.com/taverns-red/toast-stats/compare/frontend-v3.11.1...frontend-v3.11.2) (2026-06-14)


### Bug Fixes

* **a11y:** darken amber focus rings to clear WCAG 1.4.11 3:1 on light surfaces ([#1106](https://github.com/taverns-red/toast-stats/issues/1106)) ([#1206](https://github.com/taverns-red/toast-stats/issues/1206)) ([53a2585](https://github.com/taverns-red/toast-stats/commit/53a2585f24abd737a188f213d58e328d3fa50c40))
* **analytics:** secondary correctness bundle — YoY same-PY, timezone month, dcpProjections, inline thresholds ([#1116](https://github.com/taverns-red/toast-stats/issues/1116)) ([#1207](https://github.com/taverns-red/toast-stats/issues/1207)) ([8b5261e](https://github.com/taverns-red/toast-stats/commit/8b5261ef94b8cf481cd86f525049d0de45c99044))
* **copy:** derive landing district count from data; label composition denominator as clubs ([#1107](https://github.com/taverns-red/toast-stats/issues/1107)) ([#1204](https://github.com/taverns-red/toast-stats/issues/1204)) ([cab797b](https://github.com/taverns-red/toast-stats/commit/cab797bcbc8f4a22995800026999804cd4292400))
* CSP-gate frontend distinguished projections ([#1139](https://github.com/taverns-red/toast-stats/issues/1139)) ([#1205](https://github.com/taverns-red/toast-stats/issues/1205)) ([8446933](https://github.com/taverns-red/toast-stats/commit/8446933182bdad0cb9eab74131f31a382b1ba2be))
* **district-hub:** reserve DistinguishedDistrictTrophyCase slot while awards query loads ([#1105](https://github.com/taverns-red/toast-stats/issues/1105)) ([#1202](https://github.com/taverns-red/toast-stats/issues/1202)) ([a39dd81](https://github.com/taverns-red/toast-stats/commit/a39dd817b92a1ddf04351df19e8c4dbeaa7f1d5a))
* **pages:** district subpages surface retryable fetch errors ([#1104](https://github.com/taverns-red/toast-stats/issues/1104)) ([#1201](https://github.com/taverns-red/toast-stats/issues/1201)) ([79df908](https://github.com/taverns-red/toast-stats/commit/79df908f258e31be9e933361421dd0295b62531a))
* **routing:** add ScrollRestoration — navigations land at top, Back restores scroll ([#1103](https://github.com/taverns-red/toast-stats/issues/1103)) ([#1203](https://github.com/taverns-red/toast-stats/issues/1203)) ([ef33d54](https://github.com/taverns-red/toast-stats/commit/ef33d549a450b66e53dbf47a9bbe643ca7a1203b))
* **trends:** program-year selector now drives useTimeSeries ([#1184](https://github.com/taverns-red/toast-stats/issues/1184)) ([#1198](https://github.com/taverns-red/toast-stats/issues/1198)) ([78754a4](https://github.com/taverns-red/toast-stats/commit/78754a4eb65a131e260451313a9967431c14ab70))

## [3.11.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.11.0...frontend-v3.11.1) (2026-06-12)


### Bug Fixes

* **rankings:** per-program-year DD rules — Unknown for unknowable prerequisites, no Smedley pre-2025-26 ([#1116](https://github.com/taverns-red/toast-stats/issues/1116)) ([#1166](https://github.com/taverns-red/toast-stats/issues/1166)) ([b3052d8](https://github.com/taverns-red/toast-stats/commit/b3052d815548022ce6601bc353cfdeb0a1308434))

## [3.11.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.10.0...frontend-v3.11.0) (2026-06-10)


### Features

* frontend dcpGoals consumes shared DCP goal definitions — per-goal panel == TI Goals Met ([#1119](https://github.com/taverns-red/toast-stats/issues/1119)) ([#1137](https://github.com/taverns-red/toast-stats/issues/1137)) ([ba892ce](https://github.com/taverns-red/toast-stats/commit/ba892cea2beef8a3ed1c6e8f7fce386b5d3a9cde))

## [3.10.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.9.0...frontend-v3.10.0) (2026-06-01)


### Features

* broaden CommandPalette to the unified omni-search index ([#1057](https://github.com/taverns-red/toast-stats/issues/1057)) ([#1060](https://github.com/taverns-red/toast-stats/issues/1060)) ([4c3559f](https://github.com/taverns-red/toast-stats/commit/4c3559f4ae50bdf7f0709cf2f0f824c228ea3782))
* disambiguate Overview & Trends net-change cards (metric + baseline) ([#1023](https://github.com/taverns-red/toast-stats/issues/1023)) ([#1039](https://github.com/taverns-red/toast-stats/issues/1039)) ([8607f08](https://github.com/taverns-red/toast-stats/commit/8607f0898ebd38c2a8b2664f669abaee75b2c86e))
* **search:** header omni-search bar — desktop combobox + mobile icon→modal ([#1058](https://github.com/taverns-red/toast-stats/issues/1058)) ([#1061](https://github.com/taverns-red/toast-stats/issues/1061)) ([22cf197](https://github.com/taverns-red/toast-stats/commit/22cf197cd05c1576018b1f9a8269bb8fc93fb21f))
* unified search index + matcher — omni-search Sprint 1 ([#1056](https://github.com/taverns-red/toast-stats/issues/1056)) ([#1059](https://github.com/taverns-red/toast-stats/issues/1059)) ([5dd8290](https://github.com/taverns-red/toast-stats/commit/5dd8290567a6ba6786f432a8824b0e602f8ccbea))

## [3.9.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.8.0...frontend-v3.9.0) (2026-05-31)


### Features

* **area:** AreaPage parity with the divisions overview + scoped narrative ([#1016](https://github.com/taverns-red/toast-stats/issues/1016)) ([#1027](https://github.com/taverns-red/toast-stats/issues/1027)) ([6effa10](https://github.com/taverns-red/toast-stats/commit/6effa1086d55024fb08bc580ae01effb7f386a1d))
* **changes:** area & division status-transition events in the What-Changed feed ([#1014](https://github.com/taverns-red/toast-stats/issues/1014)) ([#1025](https://github.com/taverns-red/toast-stats/issues/1025)) ([94df6f4](https://github.com/taverns-red/toast-stats/commit/94df6f4ecd0d8a18bfe1ab30bf7ef60ee5b6d389))
* **division:** DivisionPage data parity with the divisions overview ([#1015](https://github.com/taverns-red/toast-stats/issues/1015)) ([#1026](https://github.com/taverns-red/toast-stats/issues/1026)) ([25a1445](https://github.com/taverns-red/toast-stats/commit/25a1445d2f1189c5adfad11dd0cb1b4afe850b07))
* **error-page:** branded root errorElement — 404 + runtime boundary ([#1011](https://github.com/taverns-red/toast-stats/issues/1011)) ([#1019](https://github.com/taverns-red/toast-stats/issues/1019)) ([c34a751](https://github.com/taverns-red/toast-stats/commit/c34a7516c49cef989f258e5ae73795d848bded02))
* **error-page:** route-aware smart recovery — suggest valid destinations for malformed /district/:id ([#1012](https://github.com/taverns-red/toast-stats/issues/1012)) ([#1021](https://github.com/taverns-red/toast-stats/issues/1021)) ([91f3e30](https://github.com/taverns-red/toast-stats/commit/91f3e302cd4ed793c1a30b8b5c7c6f504b33cc26))
* link club names in the What-Changed feed ([#1013](https://github.com/taverns-red/toast-stats/issues/1013)) ([#1024](https://github.com/taverns-red/toast-stats/issues/1024)) ([2fa06a4](https://github.com/taverns-red/toast-stats/commit/2fa06a46dbc84d6ef0eb2ff22ee8a9efcc8d39c2))
* **wayfinding:** scoped Division/Area breadcrumbs, bad-slug 404s, flat area alias ([#1017](https://github.com/taverns-red/toast-stats/issues/1017)) ([#1028](https://github.com/taverns-red/toast-stats/issues/1028)) ([4ae32db](https://github.com/taverns-red/toast-stats/commit/4ae32db0ab34878de320bde2cd7a824a99e7358b))

## [3.8.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.7.0...frontend-v3.8.0) (2026-05-31)


### Features

* **a11y:** deep-link Methodology open-section state via URL ([#981](https://github.com/taverns-red/toast-stats/issues/981)) ([#990](https://github.com/taverns-red/toast-stats/issues/990)) ([a928620](https://github.com/taverns-red/toast-stats/commit/a9286208cd062c8b0001bb8fe71aeb79f4a3af68))
* **clubs:** move "Close to Distinguished" preset into the toolbar, after Columns ([#967](https://github.com/taverns-red/toast-stats/issues/967)) ([#977](https://github.com/taverns-red/toast-stats/issues/977)) ([c3ee944](https://github.com/taverns-red/toast-stats/commit/c3ee944c058b4f4a5193aac414089f88fd143f8c))
* **divisions:** area text — name clubs still needing a visit + state visit qualifying metric & Distinguished impact ([#974](https://github.com/taverns-red/toast-stats/issues/974)) ([#1001](https://github.com/taverns-red/toast-stats/issues/1001)) ([f67b6a8](https://github.com/taverns-red/toast-stats/commit/f67b6a89a42cfd797609e6fe236bbf3772d3c4e6))
* **divisions:** surface per-area current-round missing club-visit list on AreaPerformance ([#973](https://github.com/taverns-red/toast-stats/issues/973)) ([#997](https://github.com/taverns-red/toast-stats/issues/997)) ([f2b8121](https://github.com/taverns-red/toast-stats/commit/f2b81215dd3947d037b065d257bd8c06f3fb798a))
* **regions:** restore the /regions leaderboard table — sortable, URL-synced ([#964](https://github.com/taverns-red/toast-stats/issues/964)) ([#994](https://github.com/taverns-red/toast-stats/issues/994)) ([e8c41a2](https://github.com/taverns-red/toast-stats/commit/e8c41a2b09f1525313f17f4d6699dbb0bf89b60f))
* **regions:** sticky region-identity column + responsive/dark-mode verify + docs ([#965](https://github.com/taverns-red/toast-stats/issues/965)) ([#995](https://github.com/taverns-red/toast-stats/issues/995)) ([1d8a814](https://github.com/taverns-red/toast-stats/commit/1d8a814a667674bacb23d24f032c02122cad9aaf))
* **ux:** decide storage-only prefs stay off the URL — keep all 3 as storage ([#982](https://github.com/taverns-red/toast-stats/issues/982)) ([#993](https://github.com/taverns-red/toast-stats/issues/993)) ([15e3522](https://github.com/taverns-red/toast-stats/commit/15e35220de010c34d96843779a4f6299d94cae53))
* **ux:** deep-link Clubs 'Close to Distinguished' preset + RegionsPage region finder ([#979](https://github.com/taverns-red/toast-stats/issues/979)) ([#988](https://github.com/taverns-red/toast-stats/issues/988)) ([5659acd](https://github.com/taverns-red/toast-stats/commit/5659acd1c4c6f65862e48cbf844203a9b0f37497))
* **ux:** deep-link disclosure & expand-collapse state across routes ([#980](https://github.com/taverns-red/toast-stats/issues/980)) ([#989](https://github.com/taverns-red/toast-stats/issues/989)) ([4120d80](https://github.com/taverns-red/toast-stats/commit/4120d805f0367efd089ac21f84bd900c2df29f0d))
* **ux:** deep-link landing region filter, search & comparison pins ([#978](https://github.com/taverns-red/toast-stats/issues/978)) ([#984](https://github.com/taverns-red/toast-stats/issues/984)) ([cb41349](https://github.com/taverns-red/toast-stats/commit/cb41349f05ef6acce85414eab8574b818f1ea8fe))


### Bug Fixes

* **clubs:** restyle "Close to Distinguished" preset to match toolbar buttons ([#966](https://github.com/taverns-red/toast-stats/issues/966)) ([#971](https://github.com/taverns-red/toast-stats/issues/971)) ([5451eeb](https://github.com/taverns-red/toast-stats/commit/5451eebb03ce5b503fc402a3638b3a605cf440dd))

## [3.7.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.6.0...frontend-v3.7.0) (2026-05-30)


### Features

* **a11y:** tablist arrow-key navigation + tabpanel linkage ([#384](https://github.com/taverns-red/toast-stats/issues/384)) ([#476](https://github.com/taverns-red/toast-stats/issues/476)) ([dfc06f0](https://github.com/taverns-red/toast-stats/commit/dfc06f0e32f70a3a116b206477762cfabbba6e7a))
* accessibility & mobile responsiveness ([#216](https://github.com/taverns-red/toast-stats/issues/216), [#217](https://github.com/taverns-red/toast-stats/issues/217), [#218](https://github.com/taverns-red/toast-stats/issues/218)) ([9a63787](https://github.com/taverns-red/toast-stats/commit/9a63787939405240f2048d8ecc9f8c4f88502e62))
* accessibility & mobile responsiveness ([#216](https://github.com/taverns-red/toast-stats/issues/216), [#217](https://github.com/taverns-red/toast-stats/issues/217), [#218](https://github.com/taverns-red/toast-stats/issues/218)) ([7931882](https://github.com/taverns-red/toast-stats/commit/793188218581381f7d5355d51dc3b6675d9e05a6))
* add client-side provisional Distinguished utility ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([ee83434](https://github.com/taverns-red/toast-stats/commit/ee8343444dd7292dc6822c200031c10fd31d968d))
* add club detail subpage with routing ([#208](https://github.com/taverns-red/toast-stats/issues/208)) ([4829b4b](https://github.com/taverns-red/toast-stats/commit/4829b4b8c74e63879f53ab51a3acec1547c9edb6))
* add ClubsNeedingMembersCard to Overview tab ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([951b186](https://github.com/taverns-red/toast-stats/commit/951b186cf87184dd5346e4b8e47dd57e3713090b))
* add computeMembersToDistinguished utility ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([942c551](https://github.com/taverns-red/toast-stats/commit/942c55132d7c7400a318ab6d615df05ddd62278a))
* add CSP submission status card to ClubDetailPage ([#298](https://github.com/taverns-red/toast-stats/issues/298)) ([302e080](https://github.com/taverns-red/toast-stats/commit/302e08017117839241a46808db909e9b3402c291))
* add data freshness indicators ([#213](https://github.com/taverns-red/toast-stats/issues/213), [#214](https://github.com/taverns-red/toast-stats/issues/214), [#215](https://github.com/taverns-red/toast-stats/issues/215)) ([881b4e2](https://github.com/taverns-red/toast-stats/commit/881b4e2e6d4016acf8237cde6b9cf11e85ae4b4e))
* add deriveGoalContext and findClubsNeedingMembers helpers ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([44644fe](https://github.com/taverns-red/toast-stats/commit/44644febb7fa2912b1bd9593014c8ea20dcff1fa))
* add remote error reporting to ErrorBoundary ([#254](https://github.com/taverns-red/toast-stats/issues/254)) ([39a2a0c](https://github.com/taverns-red/toast-stats/commit/39a2a0c98f405fa9d9b9188c604d74948219e442))
* add responsive X-axis tick density for mobile charts ([#237](https://github.com/taverns-red/toast-stats/issues/237)) ([821dded](https://github.com/taverns-red/toast-stats/commit/821dded09edb74c6e5324a3b04c78fbc67b80f9c))
* add tie-aware ranking for Top Growth and DCP lists ([#236](https://github.com/taverns-red/toast-stats/issues/236)) ([d5655f0](https://github.com/taverns-red/toast-stats/commit/d5655f0aa0c07f05ba8134868fd674fd40348f14))
* add useUrlState hook for URL-synced state ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([6a852f7](https://github.com/taverns-red/toast-stats/commit/6a852f702258b4d96f32d67ee11449c30e08786a))
* **analytics:** district remaining-to-min-Distinguished as absolute counts ([#686](https://github.com/taverns-red/toast-stats/issues/686)) ([#697](https://github.com/taverns-red/toast-stats/issues/697)) ([3fcc23a](https://github.com/taverns-red/toast-stats/commit/3fcc23aaea5e2b287aaff5806fd82692156b35df))
* **anniversary:** hero badge + clubs-table Years column ([#445](https://github.com/taverns-red/toast-stats/issues/445) [#448](https://github.com/taverns-red/toast-stats/issues/448) [#443](https://github.com/taverns-red/toast-stats/issues/443)) ([#506](https://github.com/taverns-red/toast-stats/issues/506)) ([0f9b45b](https://github.com/taverns-red/toast-stats/commit/0f9b45b8c2ca22d49ac0bb30ed8a999ea265486d))
* **app-shell:** move ThemeToggle from footer to header ([#565](https://github.com/taverns-red/toast-stats/issues/565)) ([#566](https://github.com/taverns-red/toast-stats/issues/566)) ([175ade1](https://github.com/taverns-red/toast-stats/commit/175ade185a8faff0d1aa0dc3ade6d80bd8080261))
* **awards-race:** add progress bars + threshold sub-line per design ([#357](https://github.com/taverns-red/toast-stats/issues/357)) ([#404](https://github.com/taverns-red/toast-stats/issues/404)) ([e9de6a3](https://github.com/taverns-red/toast-stats/commit/e9de6a371dcd001eed8f0c45b190d7e22cac31d8))
* **awards-race:** wrap 3 cards in single bordered panel + timestamp meta ([#406](https://github.com/taverns-red/toast-stats/issues/406)) ([75046f7](https://github.com/taverns-red/toast-stats/commit/75046f7eee4c9f3596a0b426173249a58b628887))
* **awards:** rebuild AwardsRaceSection as 3-card contender summary ([#357](https://github.com/taverns-red/toast-stats/issues/357)) ([#382](https://github.com/taverns-red/toast-stats/issues/382)) ([130ac87](https://github.com/taverns-red/toast-stats/commit/130ac87a7e86066f534d5faf50b53bef7977646d))
* **awards:** ship /awards page with top-10 leaderboards ([#370](https://github.com/taverns-red/toast-stats/issues/370) [#371](https://github.com/taverns-red/toast-stats/issues/371) [#372](https://github.com/taverns-red/toast-stats/issues/372) [#373](https://github.com/taverns-red/toast-stats/issues/373)) ([#392](https://github.com/taverns-red/toast-stats/issues/392)) ([0a3129d](https://github.com/taverns-red/toast-stats/commit/0a3129d70051f1a69b416542f053e573cca9b011))
* **brand:** [#339](https://github.com/taverns-red/toast-stats/issues/339) adopt Red Taverns Brand v1.0 tokens — Phase 1 (additive) ([#595](https://github.com/taverns-red/toast-stats/issues/595)) ([ab3d83a](https://github.com/taverns-red/toast-stats/commit/ab3d83ac1aab21bcc4404bd2eaa9852436b138b5))
* **brand:** link footer Red Taverns attribution to portal ([#779](https://github.com/taverns-red/toast-stats/issues/779)) ([#789](https://github.com/taverns-red/toast-stats/issues/789)) ([cb745ec](https://github.com/taverns-red/toast-stats/commit/cb745ece25a63db0e9c6065829e20a1a1f061c2e))
* **cd:** release-gated production deploy (ADR-004) ([#707](https://github.com/taverns-red/toast-stats/issues/707)) ([#722](https://github.com/taverns-red/toast-stats/issues/722)) ([b20f426](https://github.com/taverns-red/toast-stats/commit/b20f426efd55762c0d9bdd42ea68c7db1fdd98cb))
* **changes:** Phase 1 — snapshot diff engine + default district digest ([#793](https://github.com/taverns-red/toast-stats/issues/793)) ([#801](https://github.com/taverns-red/toast-stats/issues/801)) ([86d4ccb](https://github.com/taverns-red/toast-stats/commit/86d4ccb920a59160f42584b923a515eaf377ebeb))
* **changes:** Phase 2 — arbitrary date-pair picker (from/to, URL-synced) ([#794](https://github.com/taverns-red/toast-stats/issues/794)) ([#807](https://github.com/taverns-red/toast-stats/issues/807)) ([97f5894](https://github.com/taverns-red/toast-stats/commit/97f589486767576ea066060f9ad24790cca42e92))
* **charts:** apply sparkline-then-expand to District Trends, Club detail, Rankings ([#875](https://github.com/taverns-red/toast-stats/issues/875)) ([#927](https://github.com/taverns-red/toast-stats/issues/927)) ([286f5b7](https://github.com/taverns-red/toast-stats/commit/286f5b787e884072c1e002888fce860949f303f8))
* **charts:** sparkline-then-expand wrapper for mobile ([#874](https://github.com/taverns-red/toast-stats/issues/874)) ([#926](https://github.com/taverns-red/toast-stats/issues/926)) ([a5c978a](https://github.com/taverns-red/toast-stats/commit/a5c978a6fe12f978ffa699e36015a78f265b730c))
* **chrome:** collapse page header sub-line into title on mobile ([#890](https://github.com/taverns-red/toast-stats/issues/890)) ([#946](https://github.com/taverns-red/toast-stats/issues/946)) ([71673bf](https://github.com/taverns-red/toast-stats/commit/71673bf4986c29a15614e8da5ed15a2bcce2fbf8))
* **chrome:** drop full footer on mobile; version+license behind 'About ▾' in hamburger ([#889](https://github.com/taverns-red/toast-stats/issues/889)) ([#945](https://github.com/taverns-red/toast-stats/issues/945)) ([61d621a](https://github.com/taverns-red/toast-stats/commit/61d621a8c1805219627312c554cf2b313bed0fe7))
* **ci:** harden Lighthouse/CLS gate against CDN flakes ([#915](https://github.com/taverns-red/toast-stats/issues/915)) ([#921](https://github.com/taverns-red/toast-stats/issues/921)) ([035290c](https://github.com/taverns-red/toast-stats/commit/035290c9bb98d6c7fab42de91a0394f1b9b897d8))
* **close-to-distinguished:** tighten threshold to ≤4 + unify across views ([#433](https://github.com/taverns-red/toast-stats/issues/433)) ([#441](https://github.com/taverns-red/toast-stats/issues/441)) ([c8190f4](https://github.com/taverns-red/toast-stats/commit/c8190f4022a8359f8c0e9dbf0a2c93c6658f7689))
* **club:** [#618](https://github.com/taverns-red/toast-stats/issues/618) Sprint 1 — gradient hero, 8-stat grid, back-link ([#638](https://github.com/taverns-red/toast-stats/issues/638)) ([f397956](https://github.com/taverns-red/toast-stats/commit/f3979565eaaadfb9451a05b65996226d911270c6))
* **club:** [#619](https://github.com/taverns-red/toast-stats/issues/619) Sprint 2 — Membership Trend chart + DCP Status panel (2/3 + 1/3) ([#641](https://github.com/taverns-red/toast-stats/issues/641)) ([1a24bc7](https://github.com/taverns-red/toast-stats/commit/1a24bc7d10e0a9598991f635102acbe8452ef4ac))
* **club:** [#620](https://github.com/taverns-red/toast-stats/issues/620) Close-to-Distinguished callout reposition + DCP Goals Progress panel ([#642](https://github.com/taverns-red/toast-stats/issues/642)) ([2baf744](https://github.com/taverns-red/toast-stats/commit/2baf744eb626d19039b9901431014715d1addb5b))
* **club:** [#621](https://github.com/taverns-red/toast-stats/issues/621) Sprint 4 — Goal Achievement Timeline ([#643](https://github.com/taverns-red/toast-stats/issues/643)) ([62f8309](https://github.com/taverns-red/toast-stats/commit/62f830986629796c63d194f246774c9acefe9597))
* **club:** apply redesign panel chrome to ClubDetailPage ([#366](https://github.com/taverns-red/toast-stats/issues/366)) ([#389](https://github.com/taverns-red/toast-stats/issues/389)) ([071f970](https://github.com/taverns-red/toast-stats/commit/071f9709508881980b505ad16304255e13a8900a))
* **club:** redesign Close-to-Distinguished call-out + move under hero ([#366](https://github.com/taverns-red/toast-stats/issues/366)) ([#401](https://github.com/taverns-red/toast-stats/issues/401)) ([7ac4fe8](https://github.com/taverns-red/toast-stats/commit/7ac4fe86715b11ecee1a697144db8ef725ff72a5))
* **club:** redesign Club detail hero header per handoff ([#23](https://github.com/taverns-red/toast-stats/issues/23) follow-up to [#366](https://github.com/taverns-red/toast-stats/issues/366)) ([#398](https://github.com/taverns-red/toast-stats/issues/398)) ([1cdf649](https://github.com/taverns-red/toast-stats/commit/1cdf64921d8bf620f647904bb280b44ae6755f8f))
* **clubs-table:** column model to handoff — DCP bar, cur/base, status & tier pills (epic [#665](https://github.com/taverns-red/toast-stats/issues/665), Sprint 3) ([#729](https://github.com/taverns-red/toast-stats/issues/729)) ([3e2fb7e](https://github.com/taverns-red/toast-stats/commit/3e2fb7e13c819dabb2dba09d00ffee701553fff7))
* **clubs-table:** re-skin controls row — search, segmented filter, quick chips (epic [#665](https://github.com/taverns-red/toast-stats/issues/665) Sprint 4) ([#731](https://github.com/taverns-red/toast-stats/issues/731)) ([e928449](https://github.com/taverns-red/toast-stats/commit/e928449227862b11ee7b17e9565ab8b4c1def2d8))
* **clubs-table:** re-skin table chrome to redesign tokens (epic [#665](https://github.com/taverns-red/toast-stats/issues/665), Sprint 2) ([#727](https://github.com/taverns-red/toast-stats/issues/727)) ([5ecdce3](https://github.com/taverns-red/toast-stats/commit/5ecdce3df15e6b87d9ac396829770b757d9dba48))
* **clubs-table:** remove pagination — single sticky-header table (epic [#665](https://github.com/taverns-red/toast-stats/issues/665), Sprint 1) ([#725](https://github.com/taverns-red/toast-stats/issues/725)) ([36b68a3](https://github.com/taverns-red/toast-stats/commit/36b68a3f5a5f6adb44834a750998d982c3779848))
* **clubs-table:** responsive — 640px card collapse + re-skinned cards (epic [#665](https://github.com/taverns-red/toast-stats/issues/665), Sprint 5) ([#732](https://github.com/taverns-red/toast-stats/issues/732)) ([859d7a2](https://github.com/taverns-red/toast-stats/commit/859d7a296c5feca48266e21ff07fcd7b71a072dd))
* **clubs-table:** status segmented filter with counts ([#361](https://github.com/taverns-red/toast-stats/issues/361)) ([#470](https://github.com/taverns-red/toast-stats/issues/470)) ([4bc8e39](https://github.com/taverns-red/toast-stats/commit/4bc8e3945c66d8ba2fae4b5353a8283310a87412))
* **clubs:** active-filters bar + zero-results state + URL-sync all filters ([#817](https://github.com/taverns-red/toast-stats/issues/817)) ([#831](https://github.com/taverns-red/toast-stats/issues/831)) ([e81fe16](https://github.com/taverns-red/toast-stats/commit/e81fe165090a2cdf40abaa40eb7535df315e7166))
* **clubs:** adopt TanStack Table for the club table ([#835](https://github.com/taverns-red/toast-stats/issues/835)) ([#836](https://github.com/taverns-red/toast-stats/issues/836)) ([c6c7063](https://github.com/taverns-red/toast-stats/commit/c6c706363cfa56245af7ad3aa4bd1b298f5e0619))
* **clubs:** column-group show/hide on TanStack columnVisibility ([#819](https://github.com/taverns-red/toast-stats/issues/819)) ([#837](https://github.com/taverns-red/toast-stats/issues/837)) ([9e925b1](https://github.com/taverns-red/toast-stats/commit/9e925b18c7f739bfc5af192df1a4867ec9ca5cb5))
* **clubs:** dedicated Filters drawer with instant-apply ([#816](https://github.com/taverns-red/toast-stats/issues/816)) ([#830](https://github.com/taverns-red/toast-stats/issues/830)) ([e837673](https://github.com/taverns-red/toast-stats/commit/e8376730d023bc6a5d982498b4b4df69e9cf7676))
* **clubs:** merge the two quick-filter sets into one preset row; kill hidden auto-sort ([#815](https://github.com/taverns-red/toast-stats/issues/815)) ([#829](https://github.com/taverns-red/toast-stats/issues/829)) ([806f338](https://github.com/taverns-red/toast-stats/commit/806f3388b33b57185afd3772fcf27b828a4c7ba9))
* **clubs:** opt-in 'Changes' column group + diff CSV export ([#795](https://github.com/taverns-red/toast-stats/issues/795)) ([#838](https://github.com/taverns-red/toast-stats/issues/838)) ([b32773b](https://github.com/taverns-red/toast-stats/commit/b32773be71367c361775a801938e200ac75c37cc))
* **clubs:** redesign quick-filter chips on Clubs tab ([#24](https://github.com/taverns-red/toast-stats/issues/24) follow-up to [#361](https://github.com/taverns-red/toast-stats/issues/361)) ([#399](https://github.com/taverns-red/toast-stats/issues/399)) ([649acdc](https://github.com/taverns-red/toast-stats/commit/649acdcdd78bfd2d53a188300868a621a7444fe1))
* **clubs:** visible search box for the club table ([#814](https://github.com/taverns-red/toast-stats/issues/814)) ([#828](https://github.com/taverns-red/toast-stats/issues/828)) ([2e5e19c](https://github.com/taverns-red/toast-stats/commit/2e5e19c3aa2cb9c24b136da84dcf98c6f004d187))
* **components:** RegionsLeaderboard + RegionGrid — Sprint B of /regions epic ([#494](https://github.com/taverns-red/toast-stats/issues/494) [#495](https://github.com/taverns-red/toast-stats/issues/495) [#492](https://github.com/taverns-red/toast-stats/issues/492)) ([#499](https://github.com/taverns-red/toast-stats/issues/499)) ([66d1872](https://github.com/taverns-red/toast-stats/commit/66d18720d2625fa7da4bcbdbd5955d08aae13f96))
* **comprehension:** rename Methodology→How it works, wire help icon, add KPI/Awards-Race tooltips ([#412](https://github.com/taverns-red/toast-stats/issues/412) [#410](https://github.com/taverns-red/toast-stats/issues/410) [#413](https://github.com/taverns-red/toast-stats/issues/413)) ([#457](https://github.com/taverns-red/toast-stats/issues/457)) ([6c0a189](https://github.com/taverns-red/toast-stats/commit/6c0a18959ae3c05c9ffddc2fe0081c9f1c473e24))
* display threshold + officer awards in trophy case ([#333](https://github.com/taverns-red/toast-stats/issues/333)) ([91bafe3](https://github.com/taverns-red/toast-stats/commit/91bafe36a7ee2a730f8dc783e4a03d74fa21df8b))
* Distinguished District tier tracking + trophy case ([#332](https://github.com/taverns-red/toast-stats/issues/332)) ([1e12e5c](https://github.com/taverns-red/toast-stats/commit/1e12e5cd696c9303dae58c5a17e61b89394e9b59))
* **district-clubs:** [#489](https://github.com/taverns-red/toast-stats/issues/489) surface FAC-only clubs (ATOs / prospective) ([#594](https://github.com/taverns-red/toast-stats/issues/594)) ([d076fba](https://github.com/taverns-red/toast-stats/commit/d076fba705466ce3dd4765eecd32c8e2cd209a51))
* **district-detail:** tighten Distinguished Status panel + collapse empty notable-dates cards ([#551](https://github.com/taverns-red/toast-stats/issues/551)) ([#553](https://github.com/taverns-red/toast-stats/issues/553)) ([9cfbbad](https://github.com/taverns-red/toast-stats/commit/9cfbbadff9f692106314acb76cb5d48f014d1ec5))
* district-free club URL + club index ([#320](https://github.com/taverns-red/toast-stats/issues/320)) ([7f12903](https://github.com/taverns-red/toast-stats/commit/7f12903c8f85a2c270cb6bb47efdf4442ee5d3ae))
* **district-ia:** back-to-district breadcrumb on every routed sub-page ([#577](https://github.com/taverns-red/toast-stats/issues/577)) ([#622](https://github.com/taverns-red/toast-stats/issues/622)) ([f6dedb3](https://github.com/taverns-red/toast-stats/commit/f6dedb30fe640bb6699a77574deb515d5404e7fb))
* **district-overview:** Distinguished Composition stack-bar ([#360](https://github.com/taverns-red/toast-stats/issues/360) slice 2) ([#466](https://github.com/taverns-red/toast-stats/issues/466)) ([94ec825](https://github.com/taverns-red/toast-stats/commit/94ec8258663c0a75199f191bda2ba3c59d660919))
* **district-overview:** Payment Composition donut ([#360](https://github.com/taverns-red/toast-stats/issues/360) slice 3) ([#467](https://github.com/taverns-red/toast-stats/issues/467)) ([ea917b8](https://github.com/taverns-red/toast-stats/commit/ea917b877767a26970e4b2f7ed0049b7bba9c6b5))
* **district-overview:** top-right rank badge on KPI cards ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#465](https://github.com/taverns-red/toast-stats/issues/465)) ([5ddb49c](https://github.com/taverns-red/toast-stats/commit/5ddb49c34b944c97406d9479da864696e2847a0c))
* **district-overview:** wire all 5 payment types in donut ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#469](https://github.com/taverns-red/toast-stats/issues/469)) ([16be673](https://github.com/taverns-red/toast-stats/commit/16be6734badd7b8c1894779cdb4d4fe112e259ed))
* **district-status:** concrete units + reorder + drop net in gap tiles ([#555](https://github.com/taverns-red/toast-stats/issues/555), [#556](https://github.com/taverns-red/toast-stats/issues/556)) ([#560](https://github.com/taverns-red/toast-stats/issues/560)) ([921d427](https://github.com/taverns-red/toast-stats/commit/921d4274d457b3451888ae69c2421e9e67f12de1))
* **district-tabs:** discoverability — bigger, bolder, hover preview ([#437](https://github.com/taverns-red/toast-stats/issues/437)) ([#453](https://github.com/taverns-red/toast-stats/issues/453)) ([fac3695](https://github.com/taverns-red/toast-stats/commit/fac3695373fe6189960068c8c08176604626184a))
* **district:** [#449](https://github.com/taverns-red/toast-stats/issues/449) longest-serving clubs leaderboard ([#593](https://github.com/taverns-red/toast-stats/issues/593)) ([7eb021f](https://github.com/taverns-red/toast-stats/commit/7eb021f202d6ea9709649fa7d75c6a0a3fa8a335))
* **district:** /district/:id/division/:divId + .../area/:areaId pages ([#424](https://github.com/taverns-red/toast-stats/issues/424) [#425](https://github.com/taverns-red/toast-stats/issues/425)) ([#464](https://github.com/taverns-red/toast-stats/issues/464)) ([c87f2eb](https://github.com/taverns-red/toast-stats/commit/c87f2eb91ffeb62a8fe8c283c87e7e21da126b85))
* **district:** 2×2 KPI grid on mobile ([#866](https://github.com/taverns-red/toast-stats/issues/866)) ([#899](https://github.com/taverns-red/toast-stats/issues/899)) ([6322716](https://github.com/taverns-red/toast-stats/commit/6322716073777346072fe833043466ea21861e31))
* **district:** apply 2026 redesign chrome to DistrictDetailPage header ([#358](https://github.com/taverns-red/toast-stats/issues/358)) ([#383](https://github.com/taverns-red/toast-stats/issues/383)) ([9c5df23](https://github.com/taverns-red/toast-stats/commit/9c5df2368b0353d576af5dd73caafcfe8d72f33a))
* **district:** cap upcoming renewals to Next 3 on mobile with 'Show all →' ([#869](https://github.com/taverns-red/toast-stats/issues/869)) ([#907](https://github.com/taverns-red/toast-stats/issues/907)) ([97c2950](https://github.com/taverns-red/toast-stats/commit/97c2950e9d43d5b4db364495476b36ea4ce6ad06))
* **district:** Education Levels rollup on Analytics tab ([#426](https://github.com/taverns-red/toast-stats/issues/426)) ([#481](https://github.com/taverns-red/toast-stats/issues/481)) ([3376dc9](https://github.com/taverns-red/toast-stats/commit/3376dc9693feb654740f9f220dbcb7827760f71f))
* **district:** extract DistrictDetailTabs primitive ([#359](https://github.com/taverns-red/toast-stats/issues/359)) ([#385](https://github.com/taverns-red/toast-stats/issues/385)) ([8c51940](https://github.com/taverns-red/toast-stats/commit/8c51940d6172cf778e23aa0da1462fa7a9ca0236))
* **district:** fold Milestones + Longest-Serving Clubs on mobile ([#867](https://github.com/taverns-red/toast-stats/issues/867)) ([#905](https://github.com/taverns-red/toast-stats/issues/905)) ([c18c7f8](https://github.com/taverns-red/toast-stats/commit/c18c7f83a9040ef6c29c0c4595f524f27d215ba1))
* **district:** IA Phase 1 — stack Overview/Trends/Analytics into scrollable narrative ([#569](https://github.com/taverns-red/toast-stats/issues/569)) ([#573](https://github.com/taverns-red/toast-stats/issues/573)) ([29cb3dc](https://github.com/taverns-red/toast-stats/commit/29cb3dc240e4fd9a686663526450125e0e5e1a04))
* **district:** IA Phase 2 — /district/:id/clubs route with URL-param filter state ([#570](https://github.com/taverns-red/toast-stats/issues/570)) ([#576](https://github.com/taverns-red/toast-stats/issues/576)) ([970be3e](https://github.com/taverns-red/toast-stats/commit/970be3e774283ae34fa2ea31cc3de00eeca438dc))
* **district:** IA Phase 3 — route Divisions/Rankings + retire tab strip ([#571](https://github.com/taverns-red/toast-stats/issues/571)) ([#578](https://github.com/taverns-red/toast-stats/issues/578)) ([c71354b](https://github.com/taverns-red/toast-stats/commit/c71354bbdc1bc0f1b20a4c272feb25ffe2599364))
* **district:** IA Phase 4 — sticky KPI strip + anchor TOC + smooth scroll ([#572](https://github.com/taverns-red/toast-stats/issues/572)) ([#579](https://github.com/taverns-red/toast-stats/issues/579)) ([653d7bb](https://github.com/taverns-red/toast-stats/commit/653d7bbf05a70e9633d4c7006a825fb38712fd1d))
* **district:** KPI strip to spec — 4th card + tier legend (epic [#674](https://github.com/taverns-red/toast-stats/issues/674) Sprint 7) ([#681](https://github.com/taverns-red/toast-stats/issues/681)) ([#747](https://github.com/taverns-red/toast-stats/issues/747)) ([03c2cb9](https://github.com/taverns-red/toast-stats/commit/03c2cb943c8b2af18ff6d7fc965ccc2d24b970ac))
* **district:** lean Overview hub + delete On-this-page rail (epic [#674](https://github.com/taverns-red/toast-stats/issues/674), Sprint 5) ([#745](https://github.com/taverns-red/toast-stats/issues/745)) ([3a058fe](https://github.com/taverns-red/toast-stats/commit/3a058fe75b904b9923bf63793dcba492c69eb63e))
* **district:** promote Trends + Analytics to own routes (epic [#674](https://github.com/taverns-red/toast-stats/issues/674) Sprint 6) ([#746](https://github.com/taverns-red/toast-stats/issues/746)) ([6074f16](https://github.com/taverns-red/toast-stats/commit/6074f16ce9684484ca93ea333ab7038d9247be7d))
* **district:** replace payment composition donut with inline sparkbar at 375px ([#868](https://github.com/taverns-red/toast-stats/issues/868)) ([#906](https://github.com/taverns-red/toast-stats/issues/906)) ([842de71](https://github.com/taverns-red/toast-stats/commit/842de711944feeb5af94345fd17739f2aac76d80))
* **districts:** add Export CSV + Share buttons to action cluster ([#357](https://github.com/taverns-red/toast-stats/issues/357)) ([#405](https://github.com/taverns-red/toast-stats/issues/405)) ([64b99e8](https://github.com/taverns-red/toast-stats/commit/64b99e863f96fd7a2bda566ee79e24b5302dde85))
* **districts:** apply 2026 redesign chrome to LandingPage in place ([#356](https://github.com/taverns-red/toast-stats/issues/356)) ([#381](https://github.com/taverns-red/toast-stats/issues/381)) ([9dc6662](https://github.com/taverns-red/toast-stats/commit/9dc6662fdb4ac5928fb295746626d04cd2c7a612))
* **districts:** DDP tier chip + row density on rankings page ([#546](https://github.com/taverns-red/toast-stats/issues/546)) ([#549](https://github.com/taverns-red/toast-stats/issues/549)) ([e538da4](https://github.com/taverns-red/toast-stats/commit/e538da4fb5c4cd791ab918bef73f8542fe22c1b2))
* **districts:** District Search prominence — '/' shortcut + type-ahead + hero styling ([#435](https://github.com/taverns-red/toast-stats/issues/435)) ([#451](https://github.com/taverns-red/toast-stats/issues/451)) ([475912d](https://github.com/taverns-red/toast-stats/commit/475912d26893fd7f2c71c4fc5724eb175722e33d))
* **district:** secondary route-nav primitive (epic [#674](https://github.com/taverns-red/toast-stats/issues/674), Sprint 4) ([#678](https://github.com/taverns-red/toast-stats/issues/678)) ([#744](https://github.com/taverns-red/toast-stats/issues/744)) ([0746fc5](https://github.com/taverns-red/toast-stats/commit/0746fc575cbbcbc661e012dc9431e5e94497d6a2))
* **districts:** localStorage primitive + my-district sticky pin ([#420](https://github.com/taverns-red/toast-stats/issues/420) [#417](https://github.com/taverns-red/toast-stats/issues/417)) ([#458](https://github.com/taverns-red/toast-stats/issues/458)) ([01ba0c9](https://github.com/taverns-red/toast-stats/commit/01ba0c928bf8a4e930b434e6e834df8342274a7b))
* **districts:** orientation strip below lede ([#415](https://github.com/taverns-red/toast-stats/issues/415)) ([#459](https://github.com/taverns-red/toast-stats/issues/459)) ([24017ae](https://github.com/taverns-red/toast-stats/commit/24017aeb31da8781b34345cc9c612f8b69f81358))
* **districts:** persist sort/regions + 'what changed since last visit' diff strip ([#416](https://github.com/taverns-red/toast-stats/issues/416) [#418](https://github.com/taverns-red/toast-stats/issues/418)) ([#461](https://github.com/taverns-red/toast-stats/issues/461)) ([8f48f47](https://github.com/taverns-red/toast-stats/commit/8f48f47fab56b670543258200d05844b75e3790d))
* **districts:** rankings table — District first + standalone number chip ([#436](https://github.com/taverns-red/toast-stats/issues/436)) ([#452](https://github.com/taverns-red/toast-stats/issues/452)) ([65c669d](https://github.com/taverns-red/toast-stats/commit/65c669da3800a4c5d8ba4807d49c6ad8c8ca7927))
* **districts:** region filter — solo-select + state badge ([#434](https://github.com/taverns-red/toast-stats/issues/434)) ([#450](https://github.com/taverns-red/toast-stats/issues/450)) ([c1c5168](https://github.com/taverns-red/toast-stats/commit/c1c5168ad9005c42cd80f6e34b97de96f1b553ec))
* **district:** Total Members KPI card on District Detail ([#428](https://github.com/taverns-red/toast-stats/issues/428)) ([#460](https://github.com/taverns-red/toast-stats/issues/460)) ([29e36af](https://github.com/taverns-red/toast-stats/commit/29e36aff34773b09753f6be967e427809c62c8ce))
* **district:** upcoming anniversaries panel + milestones callout ([#446](https://github.com/taverns-red/toast-stats/issues/446) [#447](https://github.com/taverns-red/toast-stats/issues/447) [#443](https://github.com/taverns-red/toast-stats/issues/443)) ([#507](https://github.com/taverns-red/toast-stats/issues/507)) ([71d2dbb](https://github.com/taverns-red/toast-stats/commit/71d2dbbad5624458cf6a49d240228a967d8851da))
* **divisions:** Distinguished Program criteria explainer ([#362](https://github.com/taverns-red/toast-stats/issues/362) Divisions & Areas redesign) ([#471](https://github.com/taverns-red/toast-stats/issues/471)) ([f5b087c](https://github.com/taverns-red/toast-stats/commit/f5b087c83775f257d1f5458a826e2a9557fd0dc6))
* **find-a-club:** schema bump + Club hero CHARTERED + disable pre-push ([#429](https://github.com/taverns-red/toast-stats/issues/429) [#431](https://github.com/taverns-red/toast-stats/issues/431) [#432](https://github.com/taverns-red/toast-stats/issues/432)) ([#483](https://github.com/taverns-red/toast-stats/issues/483)) ([ca573cd](https://github.com/taverns-red/toast-stats/commit/ca573cd9f457a9a6f3e4954c7f932bf1a3d26531))
* **flake:** flake-detection harness, quarantine mechanism & baseline metric ([#913](https://github.com/taverns-red/toast-stats/issues/913)) ([#919](https://github.com/taverns-red/toast-stats/issues/919)) ([b105ac7](https://github.com/taverns-red/toast-stats/commit/b105ac7e013067ef19b123036cc24568a8661a23))
* **frontend:** growth velocity card and division heatmap ([#219](https://github.com/taverns-red/toast-stats/issues/219), [#220](https://github.com/taverns-red/toast-stats/issues/220)) ([d812125](https://github.com/taverns-red/toast-stats/commit/d8121259fa7eb218f5be8899d7a1efaaf75a302c))
* **frontend:** prioritize exact goal flags for members to distinguished logic ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([3b5f686](https://github.com/taverns-red/toast-stats/commit/3b5f6867d0e56001854a4bf4de5a8a5559bbb146))
* GlobalRankingsTab uses per-date rankings for accuracy ([#302](https://github.com/taverns-red/toast-stats/issues/302)) ([46c7b28](https://github.com/taverns-red/toast-stats/commit/46c7b28bb6e8f43f0ff58a9150b369c915781fdc))
* Google Analytics 4 + release notes link in footer ([#314](https://github.com/taverns-red/toast-stats/issues/314), [#312](https://github.com/taverns-red/toast-stats/issues/312)) ([fa5a2be](https://github.com/taverns-red/toast-stats/commit/fa5a2be45e8fc2bd5aa5bcc596d7bd6d6fba63f8))
* **history,methodology:** ship History year strip + full Methodology content ([#367](https://github.com/taverns-red/toast-stats/issues/367) [#368](https://github.com/taverns-red/toast-stats/issues/368)) ([#390](https://github.com/taverns-red/toast-stats/issues/390)) ([dbf6b0c](https://github.com/taverns-red/toast-stats/commit/dbf6b0c06ff7b283c094f437d69a818639b990f3))
* **history:** per-year summary cards on /history ([#892](https://github.com/taverns-red/toast-stats/issues/892)) ([#947](https://github.com/taverns-red/toast-stats/issues/947)) ([e912a0c](https://github.com/taverns-red/toast-stats/commit/e912a0c4c6b41e38f582f532ef2f3c58544f0502))
* **landing:** cap districts list to top-20 on mobile with 'Show all' disclosure ([#863](https://github.com/taverns-red/toast-stats/issues/863)) ([#896](https://github.com/taverns-red/toast-stats/issues/896)) ([3674cbf](https://github.com/taverns-red/toast-stats/commit/3674cbfe7f0a859a19e8c48729497709468a1185))
* **landing:** defer Awards Race behind a 'See Awards →' link on mobile ([#862](https://github.com/taverns-red/toast-stats/issues/862)) ([#895](https://github.com/taverns-red/toast-stats/issues/895)) ([5829c47](https://github.com/taverns-red/toast-stats/commit/5829c47c6808d66fdcb49e50dc26df6b376665d1))
* **landing:** hoist 'Find your district' picker above the fold; demote KPI strip to a single tile on mobile ([#861](https://github.com/taverns-red/toast-stats/issues/861)) ([#894](https://github.com/taverns-red/toast-stats/issues/894)) ([9c0b968](https://github.com/taverns-red/toast-stats/commit/9c0b968570d581246ecc1c01daa06431c3b190d3))
* **long-text:** 'what does this page answer?' lede on /methodology + /history ([#879](https://github.com/taverns-red/toast-stats/issues/879)) ([#936](https://github.com/taverns-red/toast-stats/issues/936)) ([7d40f44](https://github.com/taverns-red/toast-stats/commit/7d40f4406ba578ec288fb748887521768df55aba))
* **long-text:** mobile-collapsed H2 sections + TOC anchor expand on /methodology ([#877](https://github.com/taverns-red/toast-stats/issues/877)) ([#934](https://github.com/taverns-red/toast-stats/issues/934)) ([ab668bd](https://github.com/taverns-red/toast-stats/commit/ab668bd86009f3bc15838885d705b6d97e8ab196))
* **long-text:** sticky 'Jump to ▾' chip under the page header ([#878](https://github.com/taverns-red/toast-stats/issues/878)) ([#935](https://github.com/taverns-red/toast-stats/issues/935)) ([41a4b7e](https://github.com/taverns-red/toast-stats/commit/41a4b7e820284b2a2efdb06a85eee7fb73cb0f9a))
* mark area Distinguished as provisional when visits incomplete ([#325](https://github.com/taverns-red/toast-stats/issues/325)) ([3459456](https://github.com/taverns-red/toast-stats/commit/3459456fef2df5db73749858de6cedf4e3086259))
* **membership-trend:** GREEN — methodology surfacing on chart + /methodology section ([#438](https://github.com/taverns-red/toast-stats/issues/438)) ([#454](https://github.com/taverns-red/toast-stats/issues/454)) ([8b7e64f](https://github.com/taverns-red/toast-stats/commit/8b7e64fc40cde0a92415d60112add411c8e726d8))
* multi-year trend comparison overlay on membership chart ([#238](https://github.com/taverns-red/toast-stats/issues/238)) ([29aa42f](https://github.com/taverns-red/toast-stats/commit/29aa42f333345c6040d3fdc64fe8bee86f95333e))
* **overview:** apply redesign panel chrome to Overview tab components ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#387](https://github.com/taverns-red/toast-stats/issues/387)) ([b6de4bc](https://github.com/taverns-red/toast-stats/commit/b6de4bcf708dca5857d8160758896857e9ace3b5))
* **overview:** District Overview KPI redesign — bullet bars + lean 3-card layout ([#550](https://github.com/taverns-red/toast-stats/issues/550)) ([#552](https://github.com/taverns-red/toast-stats/issues/552)) ([03615a2](https://github.com/taverns-red/toast-stats/commit/03615a2e65dd756791c32f510b8f576d11f77fee))
* **page+shell:** /regions page + enable Regions nav — Sprint C of /regions epic ([#496](https://github.com/taverns-red/toast-stats/issues/496) [#497](https://github.com/taverns-red/toast-stats/issues/497) [#492](https://github.com/taverns-red/toast-stats/issues/492)) ([#500](https://github.com/taverns-red/toast-stats/issues/500)) ([75a9be4](https://github.com/taverns-red/toast-stats/commit/75a9be472a1ced639ec04c5404dca880b3b21d11))
* PaymentCompositionCard on District Detail Overview ([#327](https://github.com/taverns-red/toast-stats/issues/327)) ([25c0fcc](https://github.com/taverns-red/toast-stats/commit/25c0fcc28f36be41dec28bd0cbaa810f93cf8871))
* per-club DCP goal progress card on club detail page ([#242](https://github.com/taverns-red/toast-stats/issues/242)) ([591f733](https://github.com/taverns-red/toast-stats/commit/591f733b47c716c1cae5ad71ded480767d803b00))
* performance & observability — Lighthouse CI, code-split Recharts, CDN monitoring, error telemetry ([#222](https://github.com/taverns-red/toast-stats/issues/222), [#223](https://github.com/taverns-red/toast-stats/issues/223), [#224](https://github.com/taverns-red/toast-stats/issues/224), [#225](https://github.com/taverns-red/toast-stats/issues/225)) ([1edc44a](https://github.com/taverns-red/toast-stats/commit/1edc44a28cd6dde583dbcbe790c92d4793694464))
* persist tab & sort state in URL search params ([#230](https://github.com/taverns-red/toast-stats/issues/230)) ([f025c62](https://github.com/taverns-red/toast-stats/commit/f025c629bd14d95ff62adbfb177107b83cf76ba9))
* **print:** print stylesheet for clean board-meeting handouts ([#427](https://github.com/taverns-red/toast-stats/issues/427)) ([#477](https://github.com/taverns-red/toast-stats/issues/477)) ([cbb01db](https://github.com/taverns-red/toast-stats/commit/cbb01db5c4a4cd39262581a5af2d7b9c7d0f12cd))
* **region:** /region/:n landing page ([#423](https://github.com/taverns-red/toast-stats/issues/423)) ([#463](https://github.com/taverns-red/toast-stats/issues/463)) ([6bb558b](https://github.com/taverns-red/toast-stats/commit/6bb558b664b0dadc4caaabc7d8c2f2b9961aabf6))
* **region:** card-based empty/error states for /region/:n ([#883](https://github.com/taverns-red/toast-stats/issues/883)) ([#941](https://github.com/taverns-red/toast-stats/issues/941)) ([5866875](https://github.com/taverns-red/toast-stats/commit/5866875d5024a01fe08434888ff31ab5059ba8f4))
* **region:** Club Growth % column + CGD officer-award rename ([#534](https://github.com/taverns-red/toast-stats/issues/534)) ([#540](https://github.com/taverns-red/toast-stats/issues/540)) ([98c8abf](https://github.com/taverns-red/toast-stats/commit/98c8abfa756b1ae33b3675afc821eefa6a438fe6))
* **region:** Distinguished countdown + Tier columns — closes Epic [#513](https://github.com/taverns-red/toast-stats/issues/513) ([#516](https://github.com/taverns-red/toast-stats/issues/516) [#517](https://github.com/taverns-red/toast-stats/issues/517)) ([#535](https://github.com/taverns-red/toast-stats/issues/535)) ([2aceb41](https://github.com/taverns-red/toast-stats/commit/2aceb4188312fdbdda7b4570bda44c5beaf29ed8))
* **region:** rollup KPIs + rank column + linkified chip — Sprint A of epic [#513](https://github.com/taverns-red/toast-stats/issues/513) ([#514](https://github.com/taverns-red/toast-stats/issues/514) [#515](https://github.com/taverns-red/toast-stats/issues/515) [#518](https://github.com/taverns-red/toast-stats/issues/518)) ([#526](https://github.com/taverns-red/toast-stats/issues/526)) ([49a6214](https://github.com/taverns-red/toast-stats/commit/49a6214ef337e039b3a127d5bb90e1f01febbbd7))
* **regions:** delete leaderboard table, keep card grid (CC-9, [#881](https://github.com/taverns-red/toast-stats/issues/881)) ([#937](https://github.com/taverns-red/toast-stats/issues/937)) ([f19ef32](https://github.com/taverns-red/toast-stats/commit/f19ef321a891f6c3919410f4964310054c469f2d))
* **regions:** sort region cards by a documented metric — region number asc ([#882](https://github.com/taverns-red/toast-stats/issues/882)) ([#938](https://github.com/taverns-red/toast-stats/issues/938)) ([4b963f7](https://github.com/taverns-red/toast-stats/commit/4b963f7e986ad978445a4c355a238cdee51e06a9))
* **region:** table base → current → Δ column model (epic [#683](https://github.com/taverns-red/toast-stats/issues/683), Sprint 4) ([#698](https://github.com/taverns-red/toast-stats/issues/698)) ([caa8feb](https://github.com/taverns-red/toast-stats/commit/caa8febcdff2af8b673b6038855f5efb01eeb6c0))
* **region:** three Distinguished-remaining columns, absolute not % (epic [#683](https://github.com/taverns-red/toast-stats/issues/683), Sprint 5) ([#688](https://github.com/taverns-red/toast-stats/issues/688)) ([#702](https://github.com/taverns-red/toast-stats/issues/702)) ([7691f8f](https://github.com/taverns-red/toast-stats/commit/7691f8f0f0b31245124a0dbbb30919dd0f619851))
* replace region filter disclosure with pill toggle bar ([#326](https://github.com/taverns-red/toast-stats/issues/326)) ([1a1ce01](https://github.com/taverns-red/toast-stats/commit/1a1ce0148c8914f0155ae94db4b27b8cb72e83ca))
* **routing:** wire /history + /methodology placeholder routes ([#355](https://github.com/taverns-red/toast-stats/issues/355)) ([#379](https://github.com/taverns-red/toast-stats/issues/379)) ([919f58e](https://github.com/taverns-red/toast-stats/commit/919f58e7a5ebf09a64af12f130bf50842f9086be))
* **seo:** per-route document titles ([#780](https://github.com/taverns-red/toast-stats/issues/780)) ([#790](https://github.com/taverns-red/toast-stats/issues/790)) ([2d2225b](https://github.com/taverns-red/toast-stats/commit/2d2225b9d2f56f423f8e9a77d1be6d85efaadf6f))
* **seo:** static share + SEO metadata in index.html ([#778](https://github.com/taverns-red/toast-stats/issues/778)) ([#788](https://github.com/taverns-red/toast-stats/issues/788)) ([2a94bbc](https://github.com/taverns-red/toast-stats/commit/2a94bbcc6c1077abff2a1dab6698230795fe10eb))
* shared Close-to-Distinguished predicate + clubs-table preset ([#903](https://github.com/taverns-red/toast-stats/issues/903)) ([#952](https://github.com/taverns-red/toast-stats/issues/952)) ([618c712](https://github.com/taverns-red/toast-stats/commit/618c71270bba57299322e3eacd55650e304adf72))
* **shell:** build AppShell — sticky top bar + minimalist footer ([#354](https://github.com/taverns-red/toast-stats/issues/354)) ([#378](https://github.com/taverns-red/toast-stats/issues/378)) ([bacbfe2](https://github.com/taverns-red/toast-stats/commit/bacbfe25cdb2cc2b316972ecf632a5c1056687a2))
* **shell:** universal search palette opened with Cmd-K / Ctrl-K ([#422](https://github.com/taverns-red/toast-stats/issues/422)) ([#462](https://github.com/taverns-red/toast-stats/issues/462)) ([44f4877](https://github.com/taverns-red/toast-stats/commit/44f4877af850236dd30cab7370b4fe1198875199))
* show 'Provisional' subtitle with confirmed fallback level ([#297](https://github.com/taverns-red/toast-stats/issues/297)) ([36512e9](https://github.com/taverns-red/toast-stats/commit/36512e9d88d7f6930f2fb57a038423a2651e70a9))
* show average members per club on district overview ([#318](https://github.com/taverns-red/toast-stats/issues/318)) ([186a257](https://github.com/taverns-red/toast-stats/commit/186a2575cd244f1a58a8dd35e7f4d0fe28bce5cc))
* show CSP status on club detail modal ([#288](https://github.com/taverns-red/toast-stats/issues/288)) ([4478b01](https://github.com/taverns-red/toast-stats/commit/4478b01c6d35a50923faf304d9a3c33a11da82c3))
* show provisional Distinguished badge with asterisk + tooltip ([#287](https://github.com/taverns-red/toast-stats/issues/287)) ([6096a1e](https://github.com/taverns-red/toast-stats/commit/6096a1ec41b1659aa224b76ac9359f99ecc6d1ab))
* staging environment — Phase 1+2 infrastructure + pipeline ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([0be241b](https://github.com/taverns-red/toast-stats/commit/0be241b9041470037070affb96c3737173535fb0))
* surface competitive award standings on landing page ([#331](https://github.com/taverns-red/toast-stats/issues/331)) ([9451faf](https://github.com/taverns-red/toast-stats/commit/9451faf9f35b16e0d1770b1ced48bee13e77f897))
* sync additional tables with URL params ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([a68c640](https://github.com/taverns-red/toast-stats/commit/a68c64070a289340ace0aca69a6a225b8f636a13))
* sync ClubsTable pagination with URL params ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([a6da02e](https://github.com/taverns-red/toast-stats/commit/a6da02e0fff08fc3c061b5dd936f65fe99e26864))
* sync column filters to URL for deep links ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([9b76f70](https://github.com/taverns-red/toast-stats/commit/9b76f702f14515b33337e44d0afc311a80f8aa21))
* sync program year and date to URL for deep links ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([8222d46](https://github.com/taverns-red/toast-stats/commit/8222d46cbf356ca0e12393ac713210eb6b24b2b2))
* **tables:** click-any-column-to-sort + URL-synced sort across all data tables ([#851](https://github.com/taverns-red/toast-stats/issues/851)) ([#857](https://github.com/taverns-red/toast-stats/issues/857)) ([e7681a5](https://github.com/taverns-red/toast-stats/commit/e7681a5034a8845a3b54fb9d7644283a37f11783))
* **tables:** club table — priority-column responsive model + tablet tier ([#812](https://github.com/taverns-red/toast-stats/issues/812)) ([#827](https://github.com/taverns-red/toast-stats/issues/827)) ([58203b3](https://github.com/taverns-red/toast-stats/commit/58203b323f94aacbec8a4abc2f1ed767be3a432b))
* **tables:** full-width (~1600) container policy for data-table pages ([#810](https://github.com/taverns-red/toast-stats/issues/810)) ([#824](https://github.com/taverns-red/toast-stats/issues/824)) ([c4869c1](https://github.com/taverns-red/toast-stats/commit/c4869c1c9be2b4add720746848fad6117fd87cb5))
* **tables:** landing rankings table — priority-column responsive model + sticky fix ([#811](https://github.com/taverns-red/toast-stats/issues/811)) ([#825](https://github.com/taverns-red/toast-stats/issues/825)) ([1892f7b](https://github.com/taverns-red/toast-stats/commit/1892f7b6a6c31731483fbe8d641110562f95683e))
* **tables:** Status column renders as a chip at &lt;768px (CC-4) ([#871](https://github.com/taverns-red/toast-stats/issues/871)) ([#908](https://github.com/taverns-red/toast-stats/issues/908)) ([ed7ccaa](https://github.com/taverns-red/toast-stats/commit/ed7ccaa5d2eb7c2e4819111366c6340e2847e592))
* **tabs:** bulk redesign panel chrome across all tab components ([#361](https://github.com/taverns-red/toast-stats/issues/361) [#362](https://github.com/taverns-red/toast-stats/issues/362) [#363](https://github.com/taverns-red/toast-stats/issues/363) [#364](https://github.com/taverns-red/toast-stats/issues/364) [#365](https://github.com/taverns-red/toast-stats/issues/365)) ([#388](https://github.com/taverns-red/toast-stats/issues/388)) ([26c4d10](https://github.com/taverns-red/toast-stats/commit/26c4d102bb36f8b6d42a7816ba02774d1027154e))
* **test-infra:** split vitest into unit + integration projects, restore pre-push gate ([#482](https://github.com/taverns-red/toast-stats/issues/482)) ([#635](https://github.com/taverns-red/toast-stats/issues/635)) ([7f49558](https://github.com/taverns-red/toast-stats/commit/7f4955846456b423b0abd11415c24ca49675afe6))
* **tokens:** add 2026 redesign token system alongside tm-* ([#353](https://github.com/taverns-red/toast-stats/issues/353)) ([#374](https://github.com/taverns-red/toast-stats/issues/374)) ([00a25d9](https://github.com/taverns-red/toast-stats/commit/00a25d9020ecdedac0fabb401d33365717497802))
* **ui:** add 'close to distinguished' card ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([d4e08aa](https://github.com/taverns-red/toast-stats/commit/d4e08aa166303ca7d5f8ead7275283fec81a68d9))
* **ui:** add members needed column and retain pagination state ([#272](https://github.com/taverns-red/toast-stats/issues/272), [#273](https://github.com/taverns-red/toast-stats/issues/273)) ([7269e4d](https://github.com/taverns-red/toast-stats/commit/7269e4dde54b53d021251fcd3dd3ea0e10fa17e6))
* **ui:** unified DataControlsBar across DistrictsPage + DistrictDetailPage ([#528](https://github.com/taverns-red/toast-stats/issues/528) [#529](https://github.com/taverns-red/toast-stats/issues/529) [#530](https://github.com/taverns-red/toast-stats/issues/530) [#531](https://github.com/taverns-red/toast-stats/issues/531)) ([#532](https://github.com/taverns-red/toast-stats/issues/532)) ([a7e5543](https://github.com/taverns-red/toast-stats/commit/a7e554313964d40644777e16706b055e359c2b48))
* unify chart loading skeletons with animated bars ([#235](https://github.com/taverns-red/toast-stats/issues/235)) ([30c99c0](https://github.com/taverns-red/toast-stats/commit/30c99c02b66aab2abd78ca4929eaa60af41ac9fe))
* use client-side provisional detection in all badge views ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([06314f7](https://github.com/taverns-red/toast-stats/commit/06314f748916df2998ea05f43a71f7b36b344b71))
* **util:** aggregateRegions — Sprint A of /regions epic ([#493](https://github.com/taverns-red/toast-stats/issues/493), [#492](https://github.com/taverns-red/toast-stats/issues/492)) ([#498](https://github.com/taverns-red/toast-stats/issues/498)) ([668df67](https://github.com/taverns-red/toast-stats/commit/668df678f1433b7245f016bb9ecf26426befa002))
* **util:** getClubAnniversary — Sprint A of anniversaries epic ([#444](https://github.com/taverns-red/toast-stats/issues/444) [#443](https://github.com/taverns-red/toast-stats/issues/443)) ([#505](https://github.com/taverns-red/toast-stats/issues/505)) ([cad79c4](https://github.com/taverns-red/toast-stats/commit/cad79c4c504e2ec894f2b54d9bf732dbd49f5863))
* **ux:** real &lt;Link&gt; navigation for club & division cards (CC-7) ([#872](https://github.com/taverns-red/toast-stats/issues/872)) ([#911](https://github.com/taverns-red/toast-stats/issues/911)) ([b1614f5](https://github.com/taverns-red/toast-stats/commit/b1614f5693293dff219b97b59da776abc2f20192))
* wire CDN cache monitoring into fetch layer ([#255](https://github.com/taverns-red/toast-stats/issues/255)) ([c7136bf](https://github.com/taverns-red/toast-stats/commit/c7136bf3ee26580b29e63bf2d5707369d3aa7fa5))
* wire YoY comparison from CDN time-series data ([#170](https://github.com/taverns-red/toast-stats/issues/170)) ([f9d6ba7](https://github.com/taverns-red/toast-stats/commit/f9d6ba70824e3068b142adc613acf15f9f626d16))


### Bug Fixes

* 'Close to Distinguished' button syncs sort state to URL ([5133273](https://github.com/taverns-red/toast-stats/commit/513327339ab13993ca12b3964d248bab5a53b137))
* **a11y:** [#611](https://github.com/taverns-red/toast-stats/issues/611) Methodology / History / Landing dark-mode sweep (Track D final) ([#655](https://github.com/taverns-red/toast-stats/issues/655)) ([5cc19da](https://github.com/taverns-red/toast-stats/commit/5cc19dac1c271fc6cb08fcbdc475563f1e3a5c27))
* **a11y:** lift chip touch targets to the 44px floor — families A/B/C ([#886](https://github.com/taverns-red/toast-stats/issues/886)) ([#943](https://github.com/taverns-red/toast-stats/issues/943)) ([e02bc69](https://github.com/taverns-red/toast-stats/commit/e02bc6980f3e033dacef7ad45173fb4c3b446ace))
* add missing fetchCdnSnapshotIndex mock to LandingPage tests ([#233](https://github.com/taverns-red/toast-stats/issues/233)) ([c03f194](https://github.com/taverns-red/toast-stats/commit/c03f194e40e7478b03f2e5fa5d61a226532a9fb1))
* **anniversary:** every multiple of 5 is a milestone, unbounded ([#509](https://github.com/taverns-red/toast-stats/issues/509)) ([#510](https://github.com/taverns-red/toast-stats/issues/510)) ([5bdf7f5](https://github.com/taverns-red/toast-stats/commit/5bdf7f501ed7c1088a03712a3c4c979024dd2f12))
* **anniversary:** tighter, denser layout per design handoff ([#511](https://github.com/taverns-red/toast-stats/issues/511)) ([#512](https://github.com/taverns-red/toast-stats/issues/512)) ([eb4086b](https://github.com/taverns-red/toast-stats/commit/eb4086bee8d8e852cc520275dabf0e74e4de612e))
* **app-shell:** collapse primary nav into a disclosure menu &lt;768px ([#735](https://github.com/taverns-red/toast-stats/issues/735)) ([#764](https://github.com/taverns-red/toast-stats/issues/764)) ([21d185d](https://github.com/taverns-red/toast-stats/commit/21d185d6368974fe8d86b317398b93852c3513fa))
* **area:** gate area recognition on club-visit requirement — deadline-aware provisional state ([#832](https://github.com/taverns-red/toast-stats/issues/832)) ([#839](https://github.com/taverns-red/toast-stats/issues/839)) ([3005ae0](https://github.com/taverns-red/toast-stats/commit/3005ae094094b7fa59b5f6c3b6acc9001ce0bfe2))
* **awards:** [#608](https://github.com/taverns-red/toast-stats/issues/608) Awards section dark-mode contrast sweep ([#646](https://github.com/taverns-red/toast-stats/issues/646)) ([7b749c4](https://github.com/taverns-red/toast-stats/commit/7b749c47ed18e6a9ddb0d5b4ebcc7b60aaa6f46e))
* **breadcrumbs:** drop redundant top-level crumb on district + club detail ([#442](https://github.com/taverns-red/toast-stats/issues/442)) ([#455](https://github.com/taverns-red/toast-stats/issues/455)) ([5184313](https://github.com/taverns-red/toast-stats/commit/5184313932ba274577af645ad2dcc89ed292bf42))
* **chrome:** theme-toggle icon invisible in light mode ([#700](https://github.com/taverns-red/toast-stats/issues/700)) ([#717](https://github.com/taverns-red/toast-stats/issues/717)) ([120b13f](https://github.com/taverns-red/toast-stats/commit/120b13f6bef91f4bd5f3d235a4a959940b87b0be))
* club net change uses base vs current membership ([#194](https://github.com/taverns-red/toast-stats/issues/194)) ([21e07bc](https://github.com/taverns-red/toast-stats/commit/21e07bcc140d2db4689496546f77a7dcd3734160))
* club.membershipBase ?? membershipTrend[0].count ?? currentMembers ([d7109df](https://github.com/taverns-red/toast-stats/commit/d7109df4ec34912d779ec45854a9b14d9b75d7c0))
* **club:** [#610](https://github.com/taverns-red/toast-stats/issues/610) ClubDetailPage dark-mode contrast sweep ([#654](https://github.com/taverns-red/toast-stats/issues/654)) ([f1b8090](https://github.com/taverns-red/toast-stats/commit/f1b8090c78455b3daa8a44d3d7a339baa57464ad))
* **club:** [#618](https://github.com/taverns-red/toast-stats/issues/618) pin hero pill text to AA-safe literals on the white pill ([#639](https://github.com/taverns-red/toast-stats/issues/639)) ([1dac46c](https://github.com/taverns-red/toast-stats/commit/1dac46c174ec26d17cb1083aff9faf7635d82546))
* ClubDCPGoalsCard not visible — data path and column names ([#242](https://github.com/taverns-red/toast-stats/issues/242)) ([e23e92d](https://github.com/taverns-red/toast-stats/commit/e23e92db62d8003f7f8cfe15c5eb49dbed2dbbd6))
* compute payment YoY from time-series data ([#269](https://github.com/taverns-red/toast-stats/issues/269)) ([3e3975b](https://github.com/taverns-red/toast-stats/commit/3e3975b4b2d98c72c935f4e9fb4cade5cea68eec))
* **css:** tailwind preflight was overriding every brand class — split layers ([#403](https://github.com/taverns-red/toast-stats/issues/403)) ([00ae821](https://github.com/taverns-red/toast-stats/commit/00ae821bbef9597f433b3388f3771b9e4ca3e414))
* **dark-mode:** migrate remaining components off prefers-scheme `dark:` to the theme toggle ([#715](https://github.com/taverns-red/toast-stats/issues/715)) ([#766](https://github.com/taverns-red/toast-stats/issues/766)) ([791bac0](https://github.com/taverns-red/toast-stats/commit/791bac0384c59d2dd0590fbe1bdf4b694b55ed2c))
* date count inconsistency between landing and district pages ([#233](https://github.com/taverns-red/toast-stats/issues/233)) ([e8b968d](https://github.com/taverns-red/toast-stats/commit/e8b968dae5ec235d2d5200f4a0f0f59807c02d9f))
* **deploy:** footer version was rendering as bare "v" — fix yaml/shell quoting ([#397](https://github.com/taverns-red/toast-stats/issues/397)) ([103d2b2](https://github.com/taverns-red/toast-stats/commit/103d2b290f05a7ef0070bc3e1497a8f1e23b132f))
* **district-overview:** payment donut denominator is payments, not members ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#468](https://github.com/taverns-red/toast-stats/issues/468)) ([f4aaa69](https://github.com/taverns-red/toast-stats/commit/f4aaa69afb89ce1dc2c087334df2b8fe8001b7e8))
* **district:** consolidate header action cluster into an overflow menu (epic [#674](https://github.com/taverns-red/toast-stats/issues/674) Sprint 2) ([#742](https://github.com/taverns-red/toast-stats/issues/742)) ([4b6e31e](https://github.com/taverns-red/toast-stats/commit/4b6e31edba13bf885e1df659fcb08e6b45be90ba))
* **district:** rename "District Recognition" → "Distinguished District Status" ([#358](https://github.com/taverns-red/toast-stats/issues/358)) ([#408](https://github.com/taverns-red/toast-stats/issues/408)) ([2ee1ef3](https://github.com/taverns-red/toast-stats/commit/2ee1ef3e2354cea57e0a1730820bf158b9b89754))
* **districts-page:** wrap isError branches in stable geometry ([#826](https://github.com/taverns-red/toast-stats/issues/826)) ([#846](https://github.com/taverns-red/toast-stats/issues/846)) ([084ba39](https://github.com/taverns-red/toast-stats/commit/084ba39d724dcdca79e27ba6cc6ecb4ed5aafc13))
* **districts:** drop Analytics chip + redundant district number, no-op [#521](https://github.com/taverns-red/toast-stats/issues/521) ([#519](https://github.com/taverns-red/toast-stats/issues/519) [#520](https://github.com/taverns-red/toast-stats/issues/520) [#521](https://github.com/taverns-red/toast-stats/issues/521)) ([#523](https://github.com/taverns-red/toast-stats/issues/523)) ([4ae84a3](https://github.com/taverns-red/toast-stats/commit/4ae84a317352bd90f4f1f5d43fcc519f9611373c))
* **district:** un-gate trend charts from viewport + theme-aware skeleton (epic [#674](https://github.com/taverns-red/toast-stats/issues/674) Sprint 1) ([#739](https://github.com/taverns-red/toast-stats/issues/739)) ([86c390c](https://github.com/taverns-red/toast-stats/commit/86c390cf80ca5952a4f1638a320f4b3c633edae8))
* **district:** use canonical countdown for Distinguished tiles ([#840](https://github.com/taverns-red/toast-stats/issues/840)) ([#844](https://github.com/taverns-red/toast-stats/issues/844)) ([90872cf](https://github.com/taverns-red/toast-stats/commit/90872cfe7ed7e470a2e3de38cba4d46511a04b1d))
* **division:** recognition badge derives tier from the DDP single source ([#798](https://github.com/taverns-red/toast-stats/issues/798)) ([#805](https://github.com/taverns-red/toast-stats/issues/805)) ([07a6629](https://github.com/taverns-red/toast-stats/commit/07a662938a53947d6902ada2da313d83b6695180))
* exclude new charters from District Club Retention Award ([#336](https://github.com/taverns-red/toast-stats/issues/336)) ([#337](https://github.com/taverns-red/toast-stats/issues/337)) ([239a31a](https://github.com/taverns-red/toast-stats/commit/239a31acbb424483ea546c76c85f129d6e6b5707))
* **fac:** propagate FAC enrichment through ClubTrend so CHARTERED actually renders ([#503](https://github.com/taverns-red/toast-stats/issues/503)) ([#504](https://github.com/taverns-red/toast-stats/issues/504)) ([3c4a96c](https://github.com/taverns-red/toast-stats/commit/3c4a96c56795cdd97b5b293d559225669bd478cc))
* gap-to-tier now accounts for net growth alternative ([#239](https://github.com/taverns-red/toast-stats/issues/239)) ([af6b7a0](https://github.com/taverns-red/toast-stats/commit/af6b7a0f8510e877df2f88c48fd7009d960c018e))
* gap-to-tier uses membershipBase instead of trend[0] ([#241](https://github.com/taverns-red/toast-stats/issues/241)) ([d7109df](https://github.com/taverns-red/toast-stats/commit/d7109df4ec34912d779ec45854a9b14d9b75d7c0))
* HistoricalRankChart uses selected program year for label ([#232](https://github.com/taverns-red/toast-stats/issues/232)) ([9c8eb41](https://github.com/taverns-red/toast-stats/commit/9c8eb41268bcea4fe7731488b47b64ed9165abea))
* **hooks:** 5 setState-in-effect violations → render-phase sync ([#340](https://github.com/taverns-red/toast-stats/issues/340)) ([#475](https://github.com/taverns-red/toast-stats/issues/475)) ([70eabce](https://github.com/taverns-red/toast-stats/commit/70eabcea5fe92b596c99296e18e807070734d7ce))
* landing page rankings table now loads per-date data ([#301](https://github.com/taverns-red/toast-stats/issues/301)) ([f1d58dc](https://github.com/taverns-red/toast-stats/commit/f1d58dc9eb87dee2123892117ee518d4404424d4))
* landing page table uses overallRank from data instead of array index ([#303](https://github.com/taverns-red/toast-stats/issues/303)) ([3b01f62](https://github.com/taverns-red/toast-stats/commit/3b01f628e3089a30c95cbc6a48baa2ec78179102))
* **landing:** reserve AwardsRaceSection slot to kill 0.198 landing-page CLS ([#750](https://github.com/taverns-red/toast-stats/issues/750)) ([#765](https://github.com/taverns-red/toast-stats/issues/765)) ([3d961f1](https://github.com/taverns-red/toast-stats/commit/3d961f1ee28f4d4f57ca19ee7e2811b78e80aa88))
* **methodology:** correct DCP tier definitions + club health classifications ([#439](https://github.com/taverns-red/toast-stats/issues/439), [#440](https://github.com/taverns-red/toast-stats/issues/440)) ([#456](https://github.com/taverns-red/toast-stats/issues/456)) ([a46fb00](https://github.com/taverns-red/toast-stats/commit/a46fb00ffd069e501a5e988658cde3d0453507a9))
* mirror level-aware provisional thresholds in client-side fallback ([#296](https://github.com/taverns-red/toast-stats/issues/296)) ([8959305](https://github.com/taverns-red/toast-stats/commit/8959305bb099a07d92e4c7c0eda6b0b08e61468d))
* multi-year chart uses merged dataset for proper X-axis alignment ([#243](https://github.com/taverns-red/toast-stats/issues/243)) ([ed8fad3](https://github.com/taverns-red/toast-stats/commit/ed8fad32bce5680886447d3bf4722c7093448c09))
* multi-year payments chart uses timeSeries CDN data ([#243](https://github.com/taverns-red/toast-stats/issues/243)) ([c5909d9](https://github.com/taverns-red/toast-stats/commit/c5909d9da4938e220c2adf6ca45fb51be1ce4eca))
* neutralize Borda count for tied categories and fix copy/date selector ([#197](https://github.com/taverns-red/toast-stats/issues/197), [#198](https://github.com/taverns-red/toast-stats/issues/198), [#180](https://github.com/taverns-red/toast-stats/issues/180)) ([b26e514](https://github.com/taverns-red/toast-stats/commit/b26e514515080ec0b9ffc8b0917247b13a57240f))
* **overview:** bullet-bar zoom scale + region rank inline restyle ([#557](https://github.com/taverns-red/toast-stats/issues/557), [#558](https://github.com/taverns-red/toast-stats/issues/558)) ([#559](https://github.com/taverns-red/toast-stats/issues/559)) ([7d3176f](https://github.com/taverns-red/toast-stats/commit/7d3176fcbb82d8a319a6e28a0253e743d0e9689b))
* **overview:** tier-tick positioning — hotfix [#559](https://github.com/taverns-red/toast-stats/issues/559) visual regression ([#562](https://github.com/taverns-red/toast-stats/issues/562)) ([3a95f32](https://github.com/taverns-red/toast-stats/commit/3a95f32f699eb3e1bf9f8520fc0ce52e417ab6fd))
* **perf:** [#488](https://github.com/taverns-red/toast-stats/issues/488) short-circuit LazyComparisonPanel — drops CLS 0.217 → 0.01 ([#590](https://github.com/taverns-red/toast-stats/issues/590)) ([f2aa04c](https://github.com/taverns-red/toast-stats/commit/f2aa04c42e5da34fabc807a1f6ba1a28b1929cc9))
* provisional badge in area performance table row ([#325](https://github.com/taverns-red/toast-stats/issues/325)) ([9f60720](https://github.com/taverns-red/toast-stats/commit/9f60720a405bc414343c8142e95a75b1e8ee5dc6))
* **recognition:** consolidate division-recognition onto DDP source of truth + correct rules doc ([#799](https://github.com/taverns-red/toast-stats/issues/799)) ([#806](https://github.com/taverns-red/toast-stats/issues/806)) ([1433ed9](https://github.com/taverns-red/toast-stats/commit/1433ed9b3f6dc1f5c532f1cedc16a07572d72c2e))
* **region:** /regions leaderboard invisible when OS=dark + app=light (epic [#683](https://github.com/taverns-red/toast-stats/issues/683), Sprint 8) ([#716](https://github.com/taverns-red/toast-stats/issues/716)) ([9a5a5b3](https://github.com/taverns-red/toast-stats/commit/9a5a5b36428873f86327e9fe5c1658896d61a168))
* **region:** district chip dark-mode contrast (epic [#683](https://github.com/taverns-red/toast-stats/issues/683), Sprint 7) ([#699](https://github.com/taverns-red/toast-stats/issues/699)) ([#714](https://github.com/taverns-red/toast-stats/issues/714)) ([231b879](https://github.com/taverns-red/toast-stats/commit/231b879cbacea83664d376c65b7f344cd6f8b91a))
* **region:** Net Club Growth shows signed net change, not distinguished-gap ([#684](https://github.com/taverns-red/toast-stats/issues/684)) ([#695](https://github.com/taverns-red/toast-stats/issues/695)) ([0f5e859](https://github.com/taverns-red/toast-stats/commit/0f5e859d688f83119d4c00906185684c65ba7fd1))
* **region:** RegionPage gets the wide --page-max-wide cap ([#848](https://github.com/taverns-red/toast-stats/issues/848)) ([#850](https://github.com/taverns-red/toast-stats/issues/850)) ([e08bcd2](https://github.com/taverns-red/toast-stats/commit/e08bcd2202b52d9000f3a6964ff25aad632d537e))
* **regions:** [#609](https://github.com/taverns-red/toast-stats/issues/609) Region pages dark-mode contrast sweep ([#652](https://github.com/taverns-red/toast-stats/issues/652)) ([37a96ee](https://github.com/taverns-red/toast-stats/commit/37a96ee2de31e349ced94549fb9b26895222a507))
* **regions:** Borda-count region scoring + /methodology section ([#501](https://github.com/taverns-red/toast-stats/issues/501)) ([#502](https://github.com/taverns-red/toast-stats/issues/502)) ([06434c8](https://github.com/taverns-red/toast-stats/commit/06434c846f6a14774ad1847400d6decb492560a4))
* **regions:** index findability — jump-to-region finder + dark focus/hover contrast (epic [#683](https://github.com/taverns-red/toast-stats/issues/683)) ([#696](https://github.com/taverns-red/toast-stats/issues/696)) ([2fab238](https://github.com/taverns-red/toast-stats/commit/2fab238338b93430f99d2d95cd82d721b5aeee7d))
* replace membership projections with health-based distinguished outlook ([#231](https://github.com/taverns-red/toast-stats/issues/231)) ([8409fbd](https://github.com/taverns-red/toast-stats/commit/8409fbd75409113a895fb221578f8f429ee08015))
* replace misleading 'Top X%' with ordinal percentile ([#305](https://github.com/taverns-red/toast-stats/issues/305)) ([4595547](https://github.com/taverns-red/toast-stats/commit/459554726768c004da06a21eabd361376c117f8b))
* **shell:** drop double-v prefix on footer version ([#354](https://github.com/taverns-red/toast-stats/issues/354)) ([#380](https://github.com/taverns-red/toast-stats/issues/380)) ([50ae0cd](https://github.com/taverns-red/toast-stats/commit/50ae0cd2a7c0efd8d4bc0dc758d3b43114284b4d))
* stabilize club detail smoke test selector ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([6534f48](https://github.com/taverns-red/toast-stats/commit/6534f48df657e591067d1af52c4781d401c77092))
* staging CDN URL detection survives Vite build optimization ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([4c628f7](https://github.com/taverns-red/toast-stats/commit/4c628f74969456c7559544fb2c81dc2f009a582a))
* **theme:** [#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 2 — opacity-variant dark-mode sweep + inert bg-amber-50/N fix ([#581](https://github.com/taverns-red/toast-stats/issues/581)) ([38720bd](https://github.com/taverns-red/toast-stats/commit/38720bd49dafdfb53c9ed38b270dc96c4c655c92))
* **theme:** [#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 3 — light-mode small-text tightening ([#582](https://github.com/taverns-red/toast-stats/issues/582)) ([fe74ddb](https://github.com/taverns-red/toast-stats/commit/fe74ddbe9f15ae394a7d4ca38ef7e56c51d2c993))
* **theme:** [#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 4 — axe-core regression coverage + unmitigated-utilities guard ([#584](https://github.com/taverns-red/toast-stats/issues/584)) ([a8ff059](https://github.com/taverns-red/toast-stats/commit/a8ff059465e76a42fc88e362ad87465477814b24))
* **theme:** dark-mode overrides for District Detail surface ([#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 1) ([#567](https://github.com/taverns-red/toast-stats/issues/567)) ([aa18542](https://github.com/taverns-red/toast-stats/commit/aa1854269c1aa6ef9921c6ac6bf1c9f0f3ebb9ac))
* Trends tab uses consistent data sources across all sections ([#319](https://github.com/taverns-red/toast-stats/issues/319)) ([3cd3689](https://github.com/taverns-red/toast-stats/commit/3cd36898f3f9301f715ff8b3195351c0c10fdfce))
* **ui:** add membersNeeded to applyFilter switch statement ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([5c37ef4](https://github.com/taverns-red/toast-stats/commit/5c37ef4b0c1b949c93630e102565d42cd44c83da))
* use build-time VITE_CDN_BASE_URL for staging CDN ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([ae8fea2](https://github.com/taverns-red/toast-stats/commit/ae8fea25b9c392bf80f885a4b3165d07377ebe94))
* use correct CDN field name 'May Visit award' for second-round visits ([#268](https://github.com/taverns-red/toast-stats/issues/268)) ([c6b9113](https://github.com/taverns-red/toast-stats/commit/c6b911383d3b205aca41502482dc64ef4a7a73f8))
* **visual:** post-audit visual regressions — Awards data, top bar, History chips, Districts toolbar/table ([#394](https://github.com/taverns-red/toast-stats/issues/394)) ([28c7e34](https://github.com/taverns-red/toast-stats/commit/28c7e346b4e0fbb3e2c773cd06dfc73f1bd5a3a0))


### Refactors

* **clubs:** remove the quick-filter chip row, keep the Filters drawer ([#902](https://github.com/taverns-red/toast-stats/issues/902)) ([#951](https://github.com/taverns-red/toast-stats/issues/951)) ([3a682a8](https://github.com/taverns-red/toast-stats/commit/3a682a8e2cafa2b6d83a5d5b3e9b5baa6a939d7b))
* extract &lt;DistrictChipAndName&gt; ([#522](https://github.com/taverns-red/toast-stats/issues/522)) ([#586](https://github.com/taverns-red/toast-stats/issues/586)) ([b632278](https://github.com/taverns-red/toast-stats/commit/b6322781d15ea8880979680bbccb1aef201dafb2))
* **rankings:** chrome refresh on Global Rankings chart + multi-year table ([#365](https://github.com/taverns-red/toast-stats/issues/365)) ([#400](https://github.com/taverns-red/toast-stats/issues/400)) ([8e7f350](https://github.com/taverns-red/toast-stats/commit/8e7f350dda9c33a4b0a927eadbdd78de48ddc28f))
* remove DCPProjectionsTable from Analytics tab ([#187](https://github.com/taverns-red/toast-stats/issues/187)) ([61ed46a](https://github.com/taverns-red/toast-stats/commit/61ed46a3c89b35d1c5d9e419c80f2931eec5c180))
* remove stale Express API references ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([071fa67](https://github.com/taverns-red/toast-stats/commit/071fa676d2d7898834bde63677a18d1df222b166))
* retire legacy district overview panels + fix flaky pre-push ([#472](https://github.com/taverns-red/toast-stats/issues/472) [#473](https://github.com/taverns-red/toast-stats/issues/473)) ([#474](https://github.com/taverns-red/toast-stats/issues/474)) ([ae7485e](https://github.com/taverns-red/toast-stats/commit/ae7485e06c8d1907b354e23d142b56a60ab5a413))
* split LazyCharts into individual files to fix fast refresh warning ([#251](https://github.com/taverns-red/toast-stats/issues/251)) ([9a8139d](https://github.com/taverns-red/toast-stats/commit/9a8139d7a4e3ef40f135cad9456cfba9ce145530))


### Documentation

* **clubs:** document Close-to-Distinguished preset + verify ([#904](https://github.com/taverns-red/toast-stats/issues/904)) ([#954](https://github.com/taverns-red/toast-stats/issues/954)) ([405c12b](https://github.com/taverns-red/toast-stats/commit/405c12bfebdb6113f42c008e62cc18f47cadf6bf))
* **methodology:** reciprocal /awards links from Borda/DCP/Caveats ([#373](https://github.com/taverns-red/toast-stats/issues/373)) ([#478](https://github.com/taverns-red/toast-stats/issues/478)) ([a8d212e](https://github.com/taverns-red/toast-stats/commit/a8d212e92e58cff067a8eb2e1b695414a7ef2569))


### Tests

* **a11y:** dual-engine 44px touch-target tripwire — Epic G Sprint 3 ([#887](https://github.com/taverns-red/toast-stats/issues/887)) ([#944](https://github.com/taverns-red/toast-stats/issues/944)) ([879fcaf](https://github.com/taverns-red/toast-stats/commit/879fcaf74be34d87ebdb802896e51d6e3e03d118))
* add aprilRenewals to integration test mocks ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([bf23a00](https://github.com/taverns-red/toast-stats/commit/bf23a0064d99d27aab6d22760f5c7e77d5b0e875))
* add comprehensive CSV export test coverage ([#282](https://github.com/taverns-red/toast-stats/issues/282)) ([f086c95](https://github.com/taverns-red/toast-stats/commit/f086c95f4eaeab2949de5cb42d029f585d7f28ce))
* add integration test suite for critical user journeys ([#261](https://github.com/taverns-red/toast-stats/issues/261)) ([f5909df](https://github.com/taverns-red/toast-stats/commit/f5909dff46c7fad65680ead0836df4985a1fee47))
* add unit coverage for Sprint 15 UX utilities ([a5de16e](https://github.com/taverns-red/toast-stats/commit/a5de16e8925382f7288aed1327f8e9ecf09ebd08))
* align ClubsTable integration tests with Members Needed column layout ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([f0c44b8](https://github.com/taverns-red/toast-stats/commit/f0c44b86ac7f255bead974bca53e231e29faab43))
* **clubs-table:** a11y + verification pass (epic [#665](https://github.com/taverns-red/toast-stats/issues/665) Sprint 6) ([#672](https://github.com/taverns-red/toast-stats/issues/672)) ([#737](https://github.com/taverns-red/toast-stats/issues/737)) ([259f734](https://github.com/taverns-red/toast-stats/commit/259f734d4ebad19c84d7edfed39ced9ef14fa2d7))
* fix useResponsiveChartTicks logic and add a11y DOM tests ([#18](https://github.com/taverns-red/toast-stats/issues/18)) ([ba9a668](https://github.com/taverns-red/toast-stats/commit/ba9a6688ac1157496fb849a1add777178548534a))
* **flake:** eradicate contention & isolation root causes ([#914](https://github.com/taverns-red/toast-stats/issues/914)) ([#920](https://github.com/taverns-red/toast-stats/issues/920)) ([8cb1319](https://github.com/taverns-red/toast-stats/commit/8cb13190a432ca3485a5b43d1fc63914ca7c0a78))
* **landing:** mobile scroll-length regression guard ([#864](https://github.com/taverns-red/toast-stats/issues/864)) ([#898](https://github.com/taverns-red/toast-stats/issues/898)) ([186a04c](https://github.com/taverns-red/toast-stats/commit/186a04c46f78f9109c2a7bc894e04fb639a4043c))
* migrate provisional Distinguished tests to ClubDetailPage ([#299](https://github.com/taverns-red/toast-stats/issues/299)) ([4a39390](https://github.com/taverns-red/toast-stats/commit/4a393908e1cbf349dcd8e68b2606d4bdd77ea2ee))
* red phase — getLatestPayments helper for time-series consistency ([#319](https://github.com/taverns-red/toast-stats/issues/319)) ([569b5a0](https://github.com/taverns-red/toast-stats/commit/569b5a0d1c9d8b743e50ac1e7423bd8b7d7a4923))
* red phase — Multi-Year table should use per-date rankings ([#302](https://github.com/taverns-red/toast-stats/issues/302)) ([d44c6c7](https://github.com/taverns-red/toast-stats/commit/d44c6c7e3b4674af92012eb71a7057592fc62d40))
* red phase — per-date rankings override in GlobalRankingsTab ([#302](https://github.com/taverns-red/toast-stats/issues/302)) ([413ed83](https://github.com/taverns-red/toast-stats/commit/413ed83bf36bf84807dc5bc6fa89c29868b021ac))
* red phase — provisional Distinguished badge tests ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([0056f67](https://github.com/taverns-red/toast-stats/commit/0056f6731bae8a7b1f3ed9b1ec34f734e53cf764))
* red phase — replace 'Top X%' with ordinal percentile ([#305](https://github.com/taverns-red/toast-stats/issues/305)) ([8d4e077](https://github.com/taverns-red/toast-stats/commit/8d4e0774de0f8fcb17f0dcc08759d0329f5219f1))
* update DCP section test for renamed component ([#231](https://github.com/taverns-red/toast-stats/issues/231)) ([3cd715b](https://github.com/taverns-red/toast-stats/commit/3cd715baf362fe99f9c2c06b5ac61139e3032b38))
* update test spies from console.* to logger ([#283](https://github.com/taverns-red/toast-stats/issues/283)) ([9201c50](https://github.com/taverns-red/toast-stats/commit/9201c500365cc72627188f49cbc685dfb5a47e24))

## [3.6.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.5.1...frontend-v3.6.0) (2026-05-30)


### Features

* **charts:** apply sparkline-then-expand to District Trends, Club detail, Rankings ([#875](https://github.com/taverns-red/toast-stats/issues/875)) ([#927](https://github.com/taverns-red/toast-stats/issues/927)) ([286f5b7](https://github.com/taverns-red/toast-stats/commit/286f5b787e884072c1e002888fce860949f303f8))
* **charts:** sparkline-then-expand wrapper for mobile ([#874](https://github.com/taverns-red/toast-stats/issues/874)) ([#926](https://github.com/taverns-red/toast-stats/issues/926)) ([a5c978a](https://github.com/taverns-red/toast-stats/commit/a5c978a6fe12f978ffa699e36015a78f265b730c))
* **chrome:** collapse page header sub-line into title on mobile ([#890](https://github.com/taverns-red/toast-stats/issues/890)) ([#946](https://github.com/taverns-red/toast-stats/issues/946)) ([71673bf](https://github.com/taverns-red/toast-stats/commit/71673bf4986c29a15614e8da5ed15a2bcce2fbf8))
* **chrome:** drop full footer on mobile; version+license behind 'About ▾' in hamburger ([#889](https://github.com/taverns-red/toast-stats/issues/889)) ([#945](https://github.com/taverns-red/toast-stats/issues/945)) ([61d621a](https://github.com/taverns-red/toast-stats/commit/61d621a8c1805219627312c554cf2b313bed0fe7))
* **ci:** harden Lighthouse/CLS gate against CDN flakes ([#915](https://github.com/taverns-red/toast-stats/issues/915)) ([#921](https://github.com/taverns-red/toast-stats/issues/921)) ([035290c](https://github.com/taverns-red/toast-stats/commit/035290c9bb98d6c7fab42de91a0394f1b9b897d8))
* **district:** 2×2 KPI grid on mobile ([#866](https://github.com/taverns-red/toast-stats/issues/866)) ([#899](https://github.com/taverns-red/toast-stats/issues/899)) ([6322716](https://github.com/taverns-red/toast-stats/commit/6322716073777346072fe833043466ea21861e31))
* **district:** cap upcoming renewals to Next 3 on mobile with 'Show all →' ([#869](https://github.com/taverns-red/toast-stats/issues/869)) ([#907](https://github.com/taverns-red/toast-stats/issues/907)) ([97c2950](https://github.com/taverns-red/toast-stats/commit/97c2950e9d43d5b4db364495476b36ea4ce6ad06))
* **district:** fold Milestones + Longest-Serving Clubs on mobile ([#867](https://github.com/taverns-red/toast-stats/issues/867)) ([#905](https://github.com/taverns-red/toast-stats/issues/905)) ([c18c7f8](https://github.com/taverns-red/toast-stats/commit/c18c7f83a9040ef6c29c0c4595f524f27d215ba1))
* **district:** replace payment composition donut with inline sparkbar at 375px ([#868](https://github.com/taverns-red/toast-stats/issues/868)) ([#906](https://github.com/taverns-red/toast-stats/issues/906)) ([842de71](https://github.com/taverns-red/toast-stats/commit/842de711944feeb5af94345fd17739f2aac76d80))
* **flake:** flake-detection harness, quarantine mechanism & baseline metric ([#913](https://github.com/taverns-red/toast-stats/issues/913)) ([#919](https://github.com/taverns-red/toast-stats/issues/919)) ([b105ac7](https://github.com/taverns-red/toast-stats/commit/b105ac7e013067ef19b123036cc24568a8661a23))
* **landing:** cap districts list to top-20 on mobile with 'Show all' disclosure ([#863](https://github.com/taverns-red/toast-stats/issues/863)) ([#896](https://github.com/taverns-red/toast-stats/issues/896)) ([3674cbf](https://github.com/taverns-red/toast-stats/commit/3674cbfe7f0a859a19e8c48729497709468a1185))
* **landing:** defer Awards Race behind a 'See Awards →' link on mobile ([#862](https://github.com/taverns-red/toast-stats/issues/862)) ([#895](https://github.com/taverns-red/toast-stats/issues/895)) ([5829c47](https://github.com/taverns-red/toast-stats/commit/5829c47c6808d66fdcb49e50dc26df6b376665d1))
* **landing:** hoist 'Find your district' picker above the fold; demote KPI strip to a single tile on mobile ([#861](https://github.com/taverns-red/toast-stats/issues/861)) ([#894](https://github.com/taverns-red/toast-stats/issues/894)) ([9c0b968](https://github.com/taverns-red/toast-stats/commit/9c0b968570d581246ecc1c01daa06431c3b190d3))
* **long-text:** 'what does this page answer?' lede on /methodology + /history ([#879](https://github.com/taverns-red/toast-stats/issues/879)) ([#936](https://github.com/taverns-red/toast-stats/issues/936)) ([7d40f44](https://github.com/taverns-red/toast-stats/commit/7d40f4406ba578ec288fb748887521768df55aba))
* **long-text:** mobile-collapsed H2 sections + TOC anchor expand on /methodology ([#877](https://github.com/taverns-red/toast-stats/issues/877)) ([#934](https://github.com/taverns-red/toast-stats/issues/934)) ([ab668bd](https://github.com/taverns-red/toast-stats/commit/ab668bd86009f3bc15838885d705b6d97e8ab196))
* **long-text:** sticky 'Jump to ▾' chip under the page header ([#878](https://github.com/taverns-red/toast-stats/issues/878)) ([#935](https://github.com/taverns-red/toast-stats/issues/935)) ([41a4b7e](https://github.com/taverns-red/toast-stats/commit/41a4b7e820284b2a2efdb06a85eee7fb73cb0f9a))
* **region:** card-based empty/error states for /region/:n ([#883](https://github.com/taverns-red/toast-stats/issues/883)) ([#941](https://github.com/taverns-red/toast-stats/issues/941)) ([5866875](https://github.com/taverns-red/toast-stats/commit/5866875d5024a01fe08434888ff31ab5059ba8f4))
* **regions:** delete leaderboard table, keep card grid (CC-9, [#881](https://github.com/taverns-red/toast-stats/issues/881)) ([#937](https://github.com/taverns-red/toast-stats/issues/937)) ([f19ef32](https://github.com/taverns-red/toast-stats/commit/f19ef321a891f6c3919410f4964310054c469f2d))
* **regions:** sort region cards by a documented metric — region number asc ([#882](https://github.com/taverns-red/toast-stats/issues/882)) ([#938](https://github.com/taverns-red/toast-stats/issues/938)) ([4b963f7](https://github.com/taverns-red/toast-stats/commit/4b963f7e986ad978445a4c355a238cdee51e06a9))
* **tables:** click-any-column-to-sort + URL-synced sort across all data tables ([#851](https://github.com/taverns-red/toast-stats/issues/851)) ([#857](https://github.com/taverns-red/toast-stats/issues/857)) ([e7681a5](https://github.com/taverns-red/toast-stats/commit/e7681a5034a8845a3b54fb9d7644283a37f11783))
* **tables:** Status column renders as a chip at &lt;768px (CC-4) ([#871](https://github.com/taverns-red/toast-stats/issues/871)) ([#908](https://github.com/taverns-red/toast-stats/issues/908)) ([ed7ccaa](https://github.com/taverns-red/toast-stats/commit/ed7ccaa5d2eb7c2e4819111366c6340e2847e592))
* **ux:** real &lt;Link&gt; navigation for club & division cards (CC-7) ([#872](https://github.com/taverns-red/toast-stats/issues/872)) ([#911](https://github.com/taverns-red/toast-stats/issues/911)) ([b1614f5](https://github.com/taverns-red/toast-stats/commit/b1614f5693293dff219b97b59da776abc2f20192))


### Bug Fixes

* **a11y:** lift chip touch targets to the 44px floor — families A/B/C ([#886](https://github.com/taverns-red/toast-stats/issues/886)) ([#943](https://github.com/taverns-red/toast-stats/issues/943)) ([e02bc69](https://github.com/taverns-red/toast-stats/commit/e02bc6980f3e033dacef7ad45173fb4c3b446ace))


### Tests

* **a11y:** dual-engine 44px touch-target tripwire — Epic G Sprint 3 ([#887](https://github.com/taverns-red/toast-stats/issues/887)) ([#944](https://github.com/taverns-red/toast-stats/issues/944)) ([879fcaf](https://github.com/taverns-red/toast-stats/commit/879fcaf74be34d87ebdb802896e51d6e3e03d118))
* **flake:** eradicate contention & isolation root causes ([#914](https://github.com/taverns-red/toast-stats/issues/914)) ([#920](https://github.com/taverns-red/toast-stats/issues/920)) ([8cb1319](https://github.com/taverns-red/toast-stats/commit/8cb13190a432ca3485a5b43d1fc63914ca7c0a78))
* **landing:** mobile scroll-length regression guard ([#864](https://github.com/taverns-red/toast-stats/issues/864)) ([#898](https://github.com/taverns-red/toast-stats/issues/898)) ([186a04c](https://github.com/taverns-red/toast-stats/commit/186a04c46f78f9109c2a7bc894e04fb639a4043c))

## [3.5.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.5.0...frontend-v3.5.1) (2026-05-28)


### Bug Fixes

* **districts-page:** wrap isError branches in stable geometry ([#826](https://github.com/taverns-red/toast-stats/issues/826)) ([#846](https://github.com/taverns-red/toast-stats/issues/846)) ([084ba39](https://github.com/taverns-red/toast-stats/commit/084ba39d724dcdca79e27ba6cc6ecb4ed5aafc13))
* **district:** use canonical countdown for Distinguished tiles ([#840](https://github.com/taverns-red/toast-stats/issues/840)) ([#844](https://github.com/taverns-red/toast-stats/issues/844)) ([90872cf](https://github.com/taverns-red/toast-stats/commit/90872cfe7ed7e470a2e3de38cba4d46511a04b1d))
* **region:** RegionPage gets the wide --page-max-wide cap ([#848](https://github.com/taverns-red/toast-stats/issues/848)) ([#850](https://github.com/taverns-red/toast-stats/issues/850)) ([e08bcd2](https://github.com/taverns-red/toast-stats/commit/e08bcd2202b52d9000f3a6964ff25aad632d537e))

## [3.5.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.4.0...frontend-v3.5.0) (2026-05-28)


### Features

* **changes:** Phase 2 — arbitrary date-pair picker (from/to, URL-synced) ([#794](https://github.com/taverns-red/toast-stats/issues/794)) ([#807](https://github.com/taverns-red/toast-stats/issues/807)) ([97f5894](https://github.com/taverns-red/toast-stats/commit/97f589486767576ea066060f9ad24790cca42e92))
* **clubs:** active-filters bar + zero-results state + URL-sync all filters ([#817](https://github.com/taverns-red/toast-stats/issues/817)) ([#831](https://github.com/taverns-red/toast-stats/issues/831)) ([e81fe16](https://github.com/taverns-red/toast-stats/commit/e81fe165090a2cdf40abaa40eb7535df315e7166))
* **clubs:** adopt TanStack Table for the club table ([#835](https://github.com/taverns-red/toast-stats/issues/835)) ([#836](https://github.com/taverns-red/toast-stats/issues/836)) ([c6c7063](https://github.com/taverns-red/toast-stats/commit/c6c706363cfa56245af7ad3aa4bd1b298f5e0619))
* **clubs:** column-group show/hide on TanStack columnVisibility ([#819](https://github.com/taverns-red/toast-stats/issues/819)) ([#837](https://github.com/taverns-red/toast-stats/issues/837)) ([9e925b1](https://github.com/taverns-red/toast-stats/commit/9e925b18c7f739bfc5af192df1a4867ec9ca5cb5))
* **clubs:** dedicated Filters drawer with instant-apply ([#816](https://github.com/taverns-red/toast-stats/issues/816)) ([#830](https://github.com/taverns-red/toast-stats/issues/830)) ([e837673](https://github.com/taverns-red/toast-stats/commit/e8376730d023bc6a5d982498b4b4df69e9cf7676))
* **clubs:** merge the two quick-filter sets into one preset row; kill hidden auto-sort ([#815](https://github.com/taverns-red/toast-stats/issues/815)) ([#829](https://github.com/taverns-red/toast-stats/issues/829)) ([806f338](https://github.com/taverns-red/toast-stats/commit/806f3388b33b57185afd3772fcf27b828a4c7ba9))
* **clubs:** opt-in 'Changes' column group + diff CSV export ([#795](https://github.com/taverns-red/toast-stats/issues/795)) ([#838](https://github.com/taverns-red/toast-stats/issues/838)) ([b32773b](https://github.com/taverns-red/toast-stats/commit/b32773be71367c361775a801938e200ac75c37cc))
* **clubs:** visible search box for the club table ([#814](https://github.com/taverns-red/toast-stats/issues/814)) ([#828](https://github.com/taverns-red/toast-stats/issues/828)) ([2e5e19c](https://github.com/taverns-red/toast-stats/commit/2e5e19c3aa2cb9c24b136da84dcf98c6f004d187))
* **tables:** club table — priority-column responsive model + tablet tier ([#812](https://github.com/taverns-red/toast-stats/issues/812)) ([#827](https://github.com/taverns-red/toast-stats/issues/827)) ([58203b3](https://github.com/taverns-red/toast-stats/commit/58203b323f94aacbec8a4abc2f1ed767be3a432b))
* **tables:** full-width (~1600) container policy for data-table pages ([#810](https://github.com/taverns-red/toast-stats/issues/810)) ([#824](https://github.com/taverns-red/toast-stats/issues/824)) ([c4869c1](https://github.com/taverns-red/toast-stats/commit/c4869c1c9be2b4add720746848fad6117fd87cb5))
* **tables:** landing rankings table — priority-column responsive model + sticky fix ([#811](https://github.com/taverns-red/toast-stats/issues/811)) ([#825](https://github.com/taverns-red/toast-stats/issues/825)) ([1892f7b](https://github.com/taverns-red/toast-stats/commit/1892f7b6a6c31731483fbe8d641110562f95683e))


### Bug Fixes

* **area:** gate area recognition on club-visit requirement — deadline-aware provisional state ([#832](https://github.com/taverns-red/toast-stats/issues/832)) ([#839](https://github.com/taverns-red/toast-stats/issues/839)) ([3005ae0](https://github.com/taverns-red/toast-stats/commit/3005ae094094b7fa59b5f6c3b6acc9001ce0bfe2))

## [3.4.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.3.0...frontend-v3.4.0) (2026-05-27)


### Features

* **changes:** Phase 1 — snapshot diff engine + default district digest ([#793](https://github.com/taverns-red/toast-stats/issues/793)) ([#801](https://github.com/taverns-red/toast-stats/issues/801)) ([86d4ccb](https://github.com/taverns-red/toast-stats/commit/86d4ccb920a59160f42584b923a515eaf377ebeb))


### Bug Fixes

* **division:** recognition badge derives tier from the DDP single source ([#798](https://github.com/taverns-red/toast-stats/issues/798)) ([#805](https://github.com/taverns-red/toast-stats/issues/805)) ([07a6629](https://github.com/taverns-red/toast-stats/commit/07a662938a53947d6902ada2da313d83b6695180))
* **recognition:** consolidate division-recognition onto DDP source of truth + correct rules doc ([#799](https://github.com/taverns-red/toast-stats/issues/799)) ([#806](https://github.com/taverns-red/toast-stats/issues/806)) ([1433ed9](https://github.com/taverns-red/toast-stats/commit/1433ed9b3f6dc1f5c532f1cedc16a07572d72c2e))

## [3.3.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.2.1...frontend-v3.3.0) (2026-05-27)


### Features

* **brand:** link footer Red Taverns attribution to portal ([#779](https://github.com/taverns-red/toast-stats/issues/779)) ([#789](https://github.com/taverns-red/toast-stats/issues/789)) ([cb745ec](https://github.com/taverns-red/toast-stats/commit/cb745ece25a63db0e9c6065829e20a1a1f061c2e))
* **seo:** per-route document titles ([#780](https://github.com/taverns-red/toast-stats/issues/780)) ([#790](https://github.com/taverns-red/toast-stats/issues/790)) ([2d2225b](https://github.com/taverns-red/toast-stats/commit/2d2225b9d2f56f423f8e9a77d1be6d85efaadf6f))
* **seo:** static share + SEO metadata in index.html ([#778](https://github.com/taverns-red/toast-stats/issues/778)) ([#788](https://github.com/taverns-red/toast-stats/issues/788)) ([2a94bbc](https://github.com/taverns-red/toast-stats/commit/2a94bbcc6c1077abff2a1dab6698230795fe10eb))

## [3.2.1](https://github.com/taverns-red/toast-stats/compare/frontend-v3.2.0...frontend-v3.2.1) (2026-05-26)


### Bug Fixes

* **app-shell:** collapse primary nav into a disclosure menu &lt;768px ([#735](https://github.com/taverns-red/toast-stats/issues/735)) ([#764](https://github.com/taverns-red/toast-stats/issues/764)) ([21d185d](https://github.com/taverns-red/toast-stats/commit/21d185d6368974fe8d86b317398b93852c3513fa))
* **dark-mode:** migrate remaining components off prefers-scheme `dark:` to the theme toggle ([#715](https://github.com/taverns-red/toast-stats/issues/715)) ([#766](https://github.com/taverns-red/toast-stats/issues/766)) ([791bac0](https://github.com/taverns-red/toast-stats/commit/791bac0384c59d2dd0590fbe1bdf4b694b55ed2c))
* **landing:** reserve AwardsRaceSection slot to kill 0.198 landing-page CLS ([#750](https://github.com/taverns-red/toast-stats/issues/750)) ([#765](https://github.com/taverns-red/toast-stats/issues/765)) ([3d961f1](https://github.com/taverns-red/toast-stats/commit/3d961f1ee28f4d4f57ca19ee7e2811b78e80aa88))

## [3.2.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.1.0...frontend-v3.2.0) (2026-05-26)


### Features

* **district:** KPI strip to spec — 4th card + tier legend (epic [#674](https://github.com/taverns-red/toast-stats/issues/674) Sprint 7) ([#681](https://github.com/taverns-red/toast-stats/issues/681)) ([#747](https://github.com/taverns-red/toast-stats/issues/747)) ([03c2cb9](https://github.com/taverns-red/toast-stats/commit/03c2cb943c8b2af18ff6d7fc965ccc2d24b970ac))
* **district:** lean Overview hub + delete On-this-page rail (epic [#674](https://github.com/taverns-red/toast-stats/issues/674), Sprint 5) ([#745](https://github.com/taverns-red/toast-stats/issues/745)) ([3a058fe](https://github.com/taverns-red/toast-stats/commit/3a058fe75b904b9923bf63793dcba492c69eb63e))
* **district:** promote Trends + Analytics to own routes (epic [#674](https://github.com/taverns-red/toast-stats/issues/674) Sprint 6) ([#746](https://github.com/taverns-red/toast-stats/issues/746)) ([6074f16](https://github.com/taverns-red/toast-stats/commit/6074f16ce9684484ca93ea333ab7038d9247be7d))
* **district:** secondary route-nav primitive (epic [#674](https://github.com/taverns-red/toast-stats/issues/674), Sprint 4) ([#678](https://github.com/taverns-red/toast-stats/issues/678)) ([#744](https://github.com/taverns-red/toast-stats/issues/744)) ([0746fc5](https://github.com/taverns-red/toast-stats/commit/0746fc575cbbcbc661e012dc9431e5e94497d6a2))


### Bug Fixes

* **district:** consolidate header action cluster into an overflow menu (epic [#674](https://github.com/taverns-red/toast-stats/issues/674) Sprint 2) ([#742](https://github.com/taverns-red/toast-stats/issues/742)) ([4b6e31e](https://github.com/taverns-red/toast-stats/commit/4b6e31edba13bf885e1df659fcb08e6b45be90ba))
* **district:** un-gate trend charts from viewport + theme-aware skeleton (epic [#674](https://github.com/taverns-red/toast-stats/issues/674) Sprint 1) ([#739](https://github.com/taverns-red/toast-stats/issues/739)) ([86c390c](https://github.com/taverns-red/toast-stats/commit/86c390cf80ca5952a4f1638a320f4b3c633edae8))

## [3.1.0](https://github.com/taverns-red/toast-stats/compare/frontend-v3.0.0...frontend-v3.1.0) (2026-05-26)


### Features

* **cd:** release-gated production deploy (ADR-004) ([#707](https://github.com/taverns-red/toast-stats/issues/707)) ([#722](https://github.com/taverns-red/toast-stats/issues/722)) ([b20f426](https://github.com/taverns-red/toast-stats/commit/b20f426efd55762c0d9bdd42ea68c7db1fdd98cb))
* **clubs-table:** column model to handoff — DCP bar, cur/base, status & tier pills (epic [#665](https://github.com/taverns-red/toast-stats/issues/665), Sprint 3) ([#729](https://github.com/taverns-red/toast-stats/issues/729)) ([3e2fb7e](https://github.com/taverns-red/toast-stats/commit/3e2fb7e13c819dabb2dba09d00ffee701553fff7))
* **clubs-table:** re-skin controls row — search, segmented filter, quick chips (epic [#665](https://github.com/taverns-red/toast-stats/issues/665) Sprint 4) ([#731](https://github.com/taverns-red/toast-stats/issues/731)) ([e928449](https://github.com/taverns-red/toast-stats/commit/e928449227862b11ee7b17e9565ab8b4c1def2d8))
* **clubs-table:** re-skin table chrome to redesign tokens (epic [#665](https://github.com/taverns-red/toast-stats/issues/665), Sprint 2) ([#727](https://github.com/taverns-red/toast-stats/issues/727)) ([5ecdce3](https://github.com/taverns-red/toast-stats/commit/5ecdce3df15e6b87d9ac396829770b757d9dba48))
* **clubs-table:** remove pagination — single sticky-header table (epic [#665](https://github.com/taverns-red/toast-stats/issues/665), Sprint 1) ([#725](https://github.com/taverns-red/toast-stats/issues/725)) ([36b68a3](https://github.com/taverns-red/toast-stats/commit/36b68a3f5a5f6adb44834a750998d982c3779848))
* **clubs-table:** responsive — 640px card collapse + re-skinned cards (epic [#665](https://github.com/taverns-red/toast-stats/issues/665), Sprint 5) ([#732](https://github.com/taverns-red/toast-stats/issues/732)) ([859d7a2](https://github.com/taverns-red/toast-stats/commit/859d7a296c5feca48266e21ff07fcd7b71a072dd))


### Bug Fixes

* **chrome:** theme-toggle icon invisible in light mode ([#700](https://github.com/taverns-red/toast-stats/issues/700)) ([#717](https://github.com/taverns-red/toast-stats/issues/717)) ([120b13f](https://github.com/taverns-red/toast-stats/commit/120b13f6bef91f4bd5f3d235a4a959940b87b0be))


### Tests

* **clubs-table:** a11y + verification pass (epic [#665](https://github.com/taverns-red/toast-stats/issues/665) Sprint 6) ([#672](https://github.com/taverns-red/toast-stats/issues/672)) ([#737](https://github.com/taverns-red/toast-stats/issues/737)) ([259f734](https://github.com/taverns-red/toast-stats/commit/259f734d4ebad19c84d7edfed39ced9ef14fa2d7))

## [3.0.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.13.0...frontend-v3.0.0) (2026-05-25)


### ⚠ BREAKING CHANGES

* Backend analytics endpoints removed:
    - DELETE analytics.ts (8 endpoints, 1722 lines)
    - DELETE analyticsSummary.ts (1 endpoint, 594 lines)
    - DELETE PreComputedAnalyticsReader.ts (1163 lines)
    - DELETE 6 test files (2543 lines)

### Features

* **a11y:** tablist arrow-key navigation + tabpanel linkage ([#384](https://github.com/taverns-red/toast-stats/issues/384)) ([#476](https://github.com/taverns-red/toast-stats/issues/476)) ([dfc06f0](https://github.com/taverns-red/toast-stats/commit/dfc06f0e32f70a3a116b206477762cfabbba6e7a))
* accessibility & mobile responsiveness ([#216](https://github.com/taverns-red/toast-stats/issues/216), [#217](https://github.com/taverns-red/toast-stats/issues/217), [#218](https://github.com/taverns-red/toast-stats/issues/218)) ([9a63787](https://github.com/taverns-red/toast-stats/commit/9a63787939405240f2048d8ecc9f8c4f88502e62))
* accessibility & mobile responsiveness ([#216](https://github.com/taverns-red/toast-stats/issues/216), [#217](https://github.com/taverns-red/toast-stats/issues/217), [#218](https://github.com/taverns-red/toast-stats/issues/218)) ([7931882](https://github.com/taverns-red/toast-stats/commit/793188218581381f7d5355d51dc3b6675d9e05a6))
* add CDN-first data layer — cdn.ts client, 4 hooks updated with Express fallback ([#168](https://github.com/taverns-red/toast-stats/issues/168)) ([2af7012](https://github.com/taverns-red/toast-stats/commit/2af7012ab392168c4850398805106c121e2ab462))
* add client-side provisional Distinguished utility ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([ee83434](https://github.com/taverns-red/toast-stats/commit/ee8343444dd7292dc6822c200031c10fd31d968d))
* add club detail subpage with routing ([#208](https://github.com/taverns-red/toast-stats/issues/208)) ([4829b4b](https://github.com/taverns-red/toast-stats/commit/4829b4b8c74e63879f53ab51a3acec1547c9edb6))
* add ClubsNeedingMembersCard to Overview tab ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([951b186](https://github.com/taverns-red/toast-stats/commit/951b186cf87184dd5346e4b8e47dd57e3713090b))
* add computeMembersToDistinguished utility ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([942c551](https://github.com/taverns-red/toast-stats/commit/942c55132d7c7400a318ab6d615df05ddd62278a))
* add CSP submission status card to ClubDetailPage ([#298](https://github.com/taverns-red/toast-stats/issues/298)) ([302e080](https://github.com/taverns-red/toast-stats/commit/302e08017117839241a46808db909e9b3402c291))
* add data freshness indicators ([#213](https://github.com/taverns-red/toast-stats/issues/213), [#214](https://github.com/taverns-red/toast-stats/issues/214), [#215](https://github.com/taverns-red/toast-stats/issues/215)) ([881b4e2](https://github.com/taverns-red/toast-stats/commit/881b4e2e6d4016acf8237cde6b9cf11e85ae4b4e))
* add deriveGoalContext and findClubsNeedingMembers helpers ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([44644fe](https://github.com/taverns-red/toast-stats/commit/44644febb7fa2912b1bd9593014c8ea20dcff1fa))
* add membershipBase to ClubTrend for accurate base membership display ([#164](https://github.com/taverns-red/toast-stats/issues/164)) ([c2e9b30](https://github.com/taverns-red/toast-stats/commit/c2e9b30e8a6e0cfb043fb4860e2a60756edaf711))
* add remote error reporting to ErrorBoundary ([#254](https://github.com/taverns-red/toast-stats/issues/254)) ([39a2a0c](https://github.com/taverns-red/toast-stats/commit/39a2a0c98f405fa9d9b9188c604d74948219e442))
* add responsive X-axis tick density for mobile charts ([#237](https://github.com/taverns-red/toast-stats/issues/237)) ([821dded](https://github.com/taverns-red/toast-stats/commit/821dded09edb74c6e5324a3b04c78fbc67b80f9c))
* add tie-aware ranking for Top Growth and DCP lists ([#236](https://github.com/taverns-red/toast-stats/issues/236)) ([d5655f0](https://github.com/taverns-red/toast-stats/commit/d5655f0aa0c07f05ba8134868fd674fd40348f14))
* add useUrlState hook for URL-synced state ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([6a852f7](https://github.com/taverns-red/toast-stats/commit/6a852f702258b4d96f32d67ee11449c30e08786a))
* **analytics:** district remaining-to-min-Distinguished as absolute counts ([#686](https://github.com/taverns-red/toast-stats/issues/686)) ([#697](https://github.com/taverns-red/toast-stats/issues/697)) ([3fcc23a](https://github.com/taverns-red/toast-stats/commit/3fcc23aaea5e2b287aaff5806fd82692156b35df))
* **anniversary:** hero badge + clubs-table Years column ([#445](https://github.com/taverns-red/toast-stats/issues/445) [#448](https://github.com/taverns-red/toast-stats/issues/448) [#443](https://github.com/taverns-red/toast-stats/issues/443)) ([#506](https://github.com/taverns-red/toast-stats/issues/506)) ([0f9b45b](https://github.com/taverns-red/toast-stats/commit/0f9b45b8c2ca22d49ac0bb30ed8a999ea265486d))
* **app-shell:** move ThemeToggle from footer to header ([#565](https://github.com/taverns-red/toast-stats/issues/565)) ([#566](https://github.com/taverns-red/toast-stats/issues/566)) ([175ade1](https://github.com/taverns-red/toast-stats/commit/175ade185a8faff0d1aa0dc3ade6d80bd8080261))
* **awards-race:** add progress bars + threshold sub-line per design ([#357](https://github.com/taverns-red/toast-stats/issues/357)) ([#404](https://github.com/taverns-red/toast-stats/issues/404)) ([e9de6a3](https://github.com/taverns-red/toast-stats/commit/e9de6a371dcd001eed8f0c45b190d7e22cac31d8))
* **awards-race:** wrap 3 cards in single bordered panel + timestamp meta ([#406](https://github.com/taverns-red/toast-stats/issues/406)) ([75046f7](https://github.com/taverns-red/toast-stats/commit/75046f7eee4c9f3596a0b426173249a58b628887))
* **awards:** rebuild AwardsRaceSection as 3-card contender summary ([#357](https://github.com/taverns-red/toast-stats/issues/357)) ([#382](https://github.com/taverns-red/toast-stats/issues/382)) ([130ac87](https://github.com/taverns-red/toast-stats/commit/130ac87a7e86066f534d5faf50b53bef7977646d))
* **awards:** ship /awards page with top-10 leaderboards ([#370](https://github.com/taverns-red/toast-stats/issues/370) [#371](https://github.com/taverns-red/toast-stats/issues/371) [#372](https://github.com/taverns-red/toast-stats/issues/372) [#373](https://github.com/taverns-red/toast-stats/issues/373)) ([#392](https://github.com/taverns-red/toast-stats/issues/392)) ([0a3129d](https://github.com/taverns-red/toast-stats/commit/0a3129d70051f1a69b416542f053e573cca9b011))
* **brand:** [#339](https://github.com/taverns-red/toast-stats/issues/339) adopt Red Taverns Brand v1.0 tokens — Phase 1 (additive) ([#595](https://github.com/taverns-red/toast-stats/issues/595)) ([ab3d83a](https://github.com/taverns-red/toast-stats/commit/ab3d83ac1aab21bcc4404bd2eaa9852436b138b5))
* **close-to-distinguished:** tighten threshold to ≤4 + unify across views ([#433](https://github.com/taverns-red/toast-stats/issues/433)) ([#441](https://github.com/taverns-red/toast-stats/issues/441)) ([c8190f4](https://github.com/taverns-red/toast-stats/commit/c8190f4022a8359f8c0e9dbf0a2c93c6658f7689))
* **club:** [#618](https://github.com/taverns-red/toast-stats/issues/618) Sprint 1 — gradient hero, 8-stat grid, back-link ([#638](https://github.com/taverns-red/toast-stats/issues/638)) ([f397956](https://github.com/taverns-red/toast-stats/commit/f3979565eaaadfb9451a05b65996226d911270c6))
* **club:** [#619](https://github.com/taverns-red/toast-stats/issues/619) Sprint 2 — Membership Trend chart + DCP Status panel (2/3 + 1/3) ([#641](https://github.com/taverns-red/toast-stats/issues/641)) ([1a24bc7](https://github.com/taverns-red/toast-stats/commit/1a24bc7d10e0a9598991f635102acbe8452ef4ac))
* **club:** [#620](https://github.com/taverns-red/toast-stats/issues/620) Close-to-Distinguished callout reposition + DCP Goals Progress panel ([#642](https://github.com/taverns-red/toast-stats/issues/642)) ([2baf744](https://github.com/taverns-red/toast-stats/commit/2baf744eb626d19039b9901431014715d1addb5b))
* **club:** [#621](https://github.com/taverns-red/toast-stats/issues/621) Sprint 4 — Goal Achievement Timeline ([#643](https://github.com/taverns-red/toast-stats/issues/643)) ([62f8309](https://github.com/taverns-red/toast-stats/commit/62f830986629796c63d194f246774c9acefe9597))
* **club:** apply redesign panel chrome to ClubDetailPage ([#366](https://github.com/taverns-red/toast-stats/issues/366)) ([#389](https://github.com/taverns-red/toast-stats/issues/389)) ([071f970](https://github.com/taverns-red/toast-stats/commit/071f9709508881980b505ad16304255e13a8900a))
* **club:** redesign Close-to-Distinguished call-out + move under hero ([#366](https://github.com/taverns-red/toast-stats/issues/366)) ([#401](https://github.com/taverns-red/toast-stats/issues/401)) ([7ac4fe8](https://github.com/taverns-red/toast-stats/commit/7ac4fe86715b11ecee1a697144db8ef725ff72a5))
* **club:** redesign Club detail hero header per handoff ([#23](https://github.com/taverns-red/toast-stats/issues/23) follow-up to [#366](https://github.com/taverns-red/toast-stats/issues/366)) ([#398](https://github.com/taverns-red/toast-stats/issues/398)) ([1cdf649](https://github.com/taverns-red/toast-stats/commit/1cdf64921d8bf620f647904bb280b44ae6755f8f))
* **clubs-table:** status segmented filter with counts ([#361](https://github.com/taverns-red/toast-stats/issues/361)) ([#470](https://github.com/taverns-red/toast-stats/issues/470)) ([4bc8e39](https://github.com/taverns-red/toast-stats/commit/4bc8e3945c66d8ba2fae4b5353a8283310a87412))
* **clubs:** redesign quick-filter chips on Clubs tab ([#24](https://github.com/taverns-red/toast-stats/issues/24) follow-up to [#361](https://github.com/taverns-red/toast-stats/issues/361)) ([#399](https://github.com/taverns-red/toast-stats/issues/399)) ([649acdc](https://github.com/taverns-red/toast-stats/commit/649acdcdd78bfd2d53a188300868a621a7444fe1))
* code-split DistrictDetailPage with React.lazy + Suspense ([#169](https://github.com/taverns-red/toast-stats/issues/169)) ([8ff5fbd](https://github.com/taverns-red/toast-stats/commit/8ff5fbdd60d9e5449fbe71cbecf8c3d7d9739b46))
* **components:** RegionsLeaderboard + RegionGrid — Sprint B of /regions epic ([#494](https://github.com/taverns-red/toast-stats/issues/494) [#495](https://github.com/taverns-red/toast-stats/issues/495) [#492](https://github.com/taverns-red/toast-stats/issues/492)) ([#499](https://github.com/taverns-red/toast-stats/issues/499)) ([66d1872](https://github.com/taverns-red/toast-stats/commit/66d18720d2625fa7da4bcbdbd5955d08aae13f96))
* **comprehension:** rename Methodology→How it works, wire help icon, add KPI/Awards-Race tooltips ([#412](https://github.com/taverns-red/toast-stats/issues/412) [#410](https://github.com/taverns-red/toast-stats/issues/410) [#413](https://github.com/taverns-red/toast-stats/issues/413)) ([#457](https://github.com/taverns-red/toast-stats/issues/457)) ([6c0a189](https://github.com/taverns-red/toast-stats/commit/6c0a18959ae3c05c9ffddc2fe0081c9f1c473e24))
* convert 7 remaining hooks to CDN-only ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([c13dd07](https://github.com/taverns-red/toast-stats/commit/c13dd079645bcaf9af76ed235897c2eaba62986e))
* convert last 2 Express hooks to CDN, delete api.ts ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([fb280ea](https://github.com/taverns-red/toast-stats/commit/fb280ea9a5ec01a32029ab68a2d8538e96e886e4))
* convert rankings to CDN + add v1/rankings.json pipeline step ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([14f8138](https://github.com/taverns-red/toast-stats/commit/14f813897a2db198889b0e6014f9a999829ee88c))
* delete backend analytics routes, CDN-only frontend ([#168](https://github.com/taverns-red/toast-stats/issues/168)) ([b23183c](https://github.com/taverns-red/toast-stats/commit/b23183c29850533476595f76a25b656ba9d06dc3))
* display threshold + officer awards in trophy case ([#333](https://github.com/taverns-red/toast-stats/issues/333)) ([91bafe3](https://github.com/taverns-red/toast-stats/commit/91bafe36a7ee2a730f8dc783e4a03d74fa21df8b))
* Distinguished District tier tracking + trophy case ([#332](https://github.com/taverns-red/toast-stats/issues/332)) ([1e12e5c](https://github.com/taverns-red/toast-stats/commit/1e12e5cd696c9303dae58c5a17e61b89394e9b59))
* **district-clubs:** [#489](https://github.com/taverns-red/toast-stats/issues/489) surface FAC-only clubs (ATOs / prospective) ([#594](https://github.com/taverns-red/toast-stats/issues/594)) ([d076fba](https://github.com/taverns-red/toast-stats/commit/d076fba705466ce3dd4765eecd32c8e2cd209a51))
* **district-detail:** tighten Distinguished Status panel + collapse empty notable-dates cards ([#551](https://github.com/taverns-red/toast-stats/issues/551)) ([#553](https://github.com/taverns-red/toast-stats/issues/553)) ([9cfbbad](https://github.com/taverns-red/toast-stats/commit/9cfbbadff9f692106314acb76cb5d48f014d1ec5))
* district-free club URL + club index ([#320](https://github.com/taverns-red/toast-stats/issues/320)) ([7f12903](https://github.com/taverns-red/toast-stats/commit/7f12903c8f85a2c270cb6bb47efdf4442ee5d3ae))
* **district-ia:** back-to-district breadcrumb on every routed sub-page ([#577](https://github.com/taverns-red/toast-stats/issues/577)) ([#622](https://github.com/taverns-red/toast-stats/issues/622)) ([f6dedb3](https://github.com/taverns-red/toast-stats/commit/f6dedb30fe640bb6699a77574deb515d5404e7fb))
* **district-overview:** Distinguished Composition stack-bar ([#360](https://github.com/taverns-red/toast-stats/issues/360) slice 2) ([#466](https://github.com/taverns-red/toast-stats/issues/466)) ([94ec825](https://github.com/taverns-red/toast-stats/commit/94ec8258663c0a75199f191bda2ba3c59d660919))
* **district-overview:** Payment Composition donut ([#360](https://github.com/taverns-red/toast-stats/issues/360) slice 3) ([#467](https://github.com/taverns-red/toast-stats/issues/467)) ([ea917b8](https://github.com/taverns-red/toast-stats/commit/ea917b877767a26970e4b2f7ed0049b7bba9c6b5))
* **district-overview:** top-right rank badge on KPI cards ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#465](https://github.com/taverns-red/toast-stats/issues/465)) ([5ddb49c](https://github.com/taverns-red/toast-stats/commit/5ddb49c34b944c97406d9479da864696e2847a0c))
* **district-overview:** wire all 5 payment types in donut ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#469](https://github.com/taverns-red/toast-stats/issues/469)) ([16be673](https://github.com/taverns-red/toast-stats/commit/16be6734badd7b8c1894779cdb4d4fe112e259ed))
* **district-status:** concrete units + reorder + drop net in gap tiles ([#555](https://github.com/taverns-red/toast-stats/issues/555), [#556](https://github.com/taverns-red/toast-stats/issues/556)) ([#560](https://github.com/taverns-red/toast-stats/issues/560)) ([921d427](https://github.com/taverns-red/toast-stats/commit/921d4274d457b3451888ae69c2421e9e67f12de1))
* **district-tabs:** discoverability — bigger, bolder, hover preview ([#437](https://github.com/taverns-red/toast-stats/issues/437)) ([#453](https://github.com/taverns-red/toast-stats/issues/453)) ([fac3695](https://github.com/taverns-red/toast-stats/commit/fac3695373fe6189960068c8c08176604626184a))
* **district:** [#449](https://github.com/taverns-red/toast-stats/issues/449) longest-serving clubs leaderboard ([#593](https://github.com/taverns-red/toast-stats/issues/593)) ([7eb021f](https://github.com/taverns-red/toast-stats/commit/7eb021f202d6ea9709649fa7d75c6a0a3fa8a335))
* **district:** /district/:id/division/:divId + .../area/:areaId pages ([#424](https://github.com/taverns-red/toast-stats/issues/424) [#425](https://github.com/taverns-red/toast-stats/issues/425)) ([#464](https://github.com/taverns-red/toast-stats/issues/464)) ([c87f2eb](https://github.com/taverns-red/toast-stats/commit/c87f2eb91ffeb62a8fe8c283c87e7e21da126b85))
* **district:** apply 2026 redesign chrome to DistrictDetailPage header ([#358](https://github.com/taverns-red/toast-stats/issues/358)) ([#383](https://github.com/taverns-red/toast-stats/issues/383)) ([9c5df23](https://github.com/taverns-red/toast-stats/commit/9c5df2368b0353d576af5dd73caafcfe8d72f33a))
* **district:** Education Levels rollup on Analytics tab ([#426](https://github.com/taverns-red/toast-stats/issues/426)) ([#481](https://github.com/taverns-red/toast-stats/issues/481)) ([3376dc9](https://github.com/taverns-red/toast-stats/commit/3376dc9693feb654740f9f220dbcb7827760f71f))
* **district:** extract DistrictDetailTabs primitive ([#359](https://github.com/taverns-red/toast-stats/issues/359)) ([#385](https://github.com/taverns-red/toast-stats/issues/385)) ([8c51940](https://github.com/taverns-red/toast-stats/commit/8c51940d6172cf778e23aa0da1462fa7a9ca0236))
* **district:** IA Phase 1 — stack Overview/Trends/Analytics into scrollable narrative ([#569](https://github.com/taverns-red/toast-stats/issues/569)) ([#573](https://github.com/taverns-red/toast-stats/issues/573)) ([29cb3dc](https://github.com/taverns-red/toast-stats/commit/29cb3dc240e4fd9a686663526450125e0e5e1a04))
* **district:** IA Phase 2 — /district/:id/clubs route with URL-param filter state ([#570](https://github.com/taverns-red/toast-stats/issues/570)) ([#576](https://github.com/taverns-red/toast-stats/issues/576)) ([970be3e](https://github.com/taverns-red/toast-stats/commit/970be3e774283ae34fa2ea31cc3de00eeca438dc))
* **district:** IA Phase 3 — route Divisions/Rankings + retire tab strip ([#571](https://github.com/taverns-red/toast-stats/issues/571)) ([#578](https://github.com/taverns-red/toast-stats/issues/578)) ([c71354b](https://github.com/taverns-red/toast-stats/commit/c71354bbdc1bc0f1b20a4c272feb25ffe2599364))
* **district:** IA Phase 4 — sticky KPI strip + anchor TOC + smooth scroll ([#572](https://github.com/taverns-red/toast-stats/issues/572)) ([#579](https://github.com/taverns-red/toast-stats/issues/579)) ([653d7bb](https://github.com/taverns-red/toast-stats/commit/653d7bbf05a70e9633d4c7006a825fb38712fd1d))
* **districts:** add Export CSV + Share buttons to action cluster ([#357](https://github.com/taverns-red/toast-stats/issues/357)) ([#405](https://github.com/taverns-red/toast-stats/issues/405)) ([64b99e8](https://github.com/taverns-red/toast-stats/commit/64b99e863f96fd7a2bda566ee79e24b5302dde85))
* **districts:** apply 2026 redesign chrome to LandingPage in place ([#356](https://github.com/taverns-red/toast-stats/issues/356)) ([#381](https://github.com/taverns-red/toast-stats/issues/381)) ([9dc6662](https://github.com/taverns-red/toast-stats/commit/9dc6662fdb4ac5928fb295746626d04cd2c7a612))
* **districts:** DDP tier chip + row density on rankings page ([#546](https://github.com/taverns-red/toast-stats/issues/546)) ([#549](https://github.com/taverns-red/toast-stats/issues/549)) ([e538da4](https://github.com/taverns-red/toast-stats/commit/e538da4fb5c4cd791ab918bef73f8542fe22c1b2))
* **districts:** District Search prominence — '/' shortcut + type-ahead + hero styling ([#435](https://github.com/taverns-red/toast-stats/issues/435)) ([#451](https://github.com/taverns-red/toast-stats/issues/451)) ([475912d](https://github.com/taverns-red/toast-stats/commit/475912d26893fd7f2c71c4fc5724eb175722e33d))
* **districts:** localStorage primitive + my-district sticky pin ([#420](https://github.com/taverns-red/toast-stats/issues/420) [#417](https://github.com/taverns-red/toast-stats/issues/417)) ([#458](https://github.com/taverns-red/toast-stats/issues/458)) ([01ba0c9](https://github.com/taverns-red/toast-stats/commit/01ba0c928bf8a4e930b434e6e834df8342274a7b))
* **districts:** orientation strip below lede ([#415](https://github.com/taverns-red/toast-stats/issues/415)) ([#459](https://github.com/taverns-red/toast-stats/issues/459)) ([24017ae](https://github.com/taverns-red/toast-stats/commit/24017aeb31da8781b34345cc9c612f8b69f81358))
* **districts:** persist sort/regions + 'what changed since last visit' diff strip ([#416](https://github.com/taverns-red/toast-stats/issues/416) [#418](https://github.com/taverns-red/toast-stats/issues/418)) ([#461](https://github.com/taverns-red/toast-stats/issues/461)) ([8f48f47](https://github.com/taverns-red/toast-stats/commit/8f48f47fab56b670543258200d05844b75e3790d))
* **districts:** rankings table — District first + standalone number chip ([#436](https://github.com/taverns-red/toast-stats/issues/436)) ([#452](https://github.com/taverns-red/toast-stats/issues/452)) ([65c669d](https://github.com/taverns-red/toast-stats/commit/65c669da3800a4c5d8ba4807d49c6ad8c8ca7927))
* **districts:** region filter — solo-select + state badge ([#434](https://github.com/taverns-red/toast-stats/issues/434)) ([#450](https://github.com/taverns-red/toast-stats/issues/450)) ([c1c5168](https://github.com/taverns-red/toast-stats/commit/c1c5168ad9005c42cd80f6e34b97de96f1b553ec))
* **district:** Total Members KPI card on District Detail ([#428](https://github.com/taverns-red/toast-stats/issues/428)) ([#460](https://github.com/taverns-red/toast-stats/issues/460)) ([29e36af](https://github.com/taverns-red/toast-stats/commit/29e36aff34773b09753f6be967e427809c62c8ce))
* **district:** upcoming anniversaries panel + milestones callout ([#446](https://github.com/taverns-red/toast-stats/issues/446) [#447](https://github.com/taverns-red/toast-stats/issues/447) [#443](https://github.com/taverns-red/toast-stats/issues/443)) ([#507](https://github.com/taverns-red/toast-stats/issues/507)) ([71d2dbb](https://github.com/taverns-red/toast-stats/commit/71d2dbbad5624458cf6a49d240228a967d8851da))
* **divisions:** Distinguished Program criteria explainer ([#362](https://github.com/taverns-red/toast-stats/issues/362) Divisions & Areas redesign) ([#471](https://github.com/taverns-red/toast-stats/issues/471)) ([f5b087c](https://github.com/taverns-red/toast-stats/commit/f5b087c83775f257d1f5458a826e2a9557fd0dc6))
* enhance club detail card with stats grid, base membership, and DCP milestone bars ([#163](https://github.com/taverns-red/toast-stats/issues/163)) ([89226af](https://github.com/taverns-red/toast-stats/commit/89226af84bfd42a714bc216164fbd004010fbccc))
* **find-a-club:** schema bump + Club hero CHARTERED + disable pre-push ([#429](https://github.com/taverns-red/toast-stats/issues/429) [#431](https://github.com/taverns-red/toast-stats/issues/431) [#432](https://github.com/taverns-red/toast-stats/issues/432)) ([#483](https://github.com/taverns-red/toast-stats/issues/483)) ([ca573cd](https://github.com/taverns-red/toast-stats/commit/ca573cd9f457a9a6f3e4954c7f932bf1a3d26531))
* **frontend:** growth velocity card and division heatmap ([#219](https://github.com/taverns-red/toast-stats/issues/219), [#220](https://github.com/taverns-red/toast-stats/issues/220)) ([d812125](https://github.com/taverns-red/toast-stats/commit/d8121259fa7eb218f5be8899d7a1efaaf75a302c))
* **frontend:** prioritize exact goal flags for members to distinguished logic ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([3b5f686](https://github.com/taverns-red/toast-stats/commit/3b5f6867d0e56001854a4bf4de5a8a5559bbb146))
* GlobalRankingsTab uses per-date rankings for accuracy ([#302](https://github.com/taverns-red/toast-stats/issues/302)) ([46c7b28](https://github.com/taverns-red/toast-stats/commit/46c7b28bb6e8f43f0ff58a9150b369c915781fdc))
* Google Analytics 4 + release notes link in footer ([#314](https://github.com/taverns-red/toast-stats/issues/314), [#312](https://github.com/taverns-red/toast-stats/issues/312)) ([fa5a2be](https://github.com/taverns-red/toast-stats/commit/fa5a2be45e8fc2bd5aa5bcc596d7bd6d6fba63f8))
* **history,methodology:** ship History year strip + full Methodology content ([#367](https://github.com/taverns-red/toast-stats/issues/367) [#368](https://github.com/taverns-red/toast-stats/issues/368)) ([#390](https://github.com/taverns-red/toast-stats/issues/390)) ([dbf6b0c](https://github.com/taverns-red/toast-stats/commit/dbf6b0c06ff7b283c094f437d69a818639b990f3))
* mark area Distinguished as provisional when visits incomplete ([#325](https://github.com/taverns-red/toast-stats/issues/325)) ([3459456](https://github.com/taverns-red/toast-stats/commit/3459456fef2df5db73749858de6cedf4e3086259))
* **membership-trend:** GREEN — methodology surfacing on chart + /methodology section ([#438](https://github.com/taverns-red/toast-stats/issues/438)) ([#454](https://github.com/taverns-red/toast-stats/issues/454)) ([8b7e64f](https://github.com/taverns-red/toast-stats/commit/8b7e64fc40cde0a92415d60112add411c8e726d8))
* multi-year trend comparison overlay on membership chart ([#238](https://github.com/taverns-red/toast-stats/issues/238)) ([29aa42f](https://github.com/taverns-red/toast-stats/commit/29aa42f333345c6040d3fdc64fe8bee86f95333e))
* **overview:** apply redesign panel chrome to Overview tab components ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#387](https://github.com/taverns-red/toast-stats/issues/387)) ([b6de4bc](https://github.com/taverns-red/toast-stats/commit/b6de4bcf708dca5857d8160758896857e9ace3b5))
* **overview:** District Overview KPI redesign — bullet bars + lean 3-card layout ([#550](https://github.com/taverns-red/toast-stats/issues/550)) ([#552](https://github.com/taverns-red/toast-stats/issues/552)) ([03615a2](https://github.com/taverns-red/toast-stats/commit/03615a2e65dd756791c32f510b8f576d11f77fee))
* **page+shell:** /regions page + enable Regions nav — Sprint C of /regions epic ([#496](https://github.com/taverns-red/toast-stats/issues/496) [#497](https://github.com/taverns-red/toast-stats/issues/497) [#492](https://github.com/taverns-red/toast-stats/issues/492)) ([#500](https://github.com/taverns-red/toast-stats/issues/500)) ([75a9be4](https://github.com/taverns-red/toast-stats/commit/75a9be472a1ced639ec04c5404dca880b3b21d11))
* PaymentCompositionCard on District Detail Overview ([#327](https://github.com/taverns-red/toast-stats/issues/327)) ([25c0fcc](https://github.com/taverns-red/toast-stats/commit/25c0fcc28f36be41dec28bd0cbaa810f93cf8871))
* per-club DCP goal progress card on club detail page ([#242](https://github.com/taverns-red/toast-stats/issues/242)) ([591f733](https://github.com/taverns-red/toast-stats/commit/591f733b47c716c1cae5ad71ded480767d803b00))
* performance & observability — Lighthouse CI, code-split Recharts, CDN monitoring, error telemetry ([#222](https://github.com/taverns-red/toast-stats/issues/222), [#223](https://github.com/taverns-red/toast-stats/issues/223), [#224](https://github.com/taverns-red/toast-stats/issues/224), [#225](https://github.com/taverns-red/toast-stats/issues/225)) ([1edc44a](https://github.com/taverns-red/toast-stats/commit/1edc44a28cd6dde583dbcbe790c92d4793694464))
* persist tab & sort state in URL search params ([#230](https://github.com/taverns-red/toast-stats/issues/230)) ([f025c62](https://github.com/taverns-red/toast-stats/commit/f025c629bd14d95ff62adbfb177107b83cf76ba9))
* **print:** print stylesheet for clean board-meeting handouts ([#427](https://github.com/taverns-red/toast-stats/issues/427)) ([#477](https://github.com/taverns-red/toast-stats/issues/477)) ([cbb01db](https://github.com/taverns-red/toast-stats/commit/cbb01db5c4a4cd39262581a5af2d7b9c7d0f12cd))
* progressive loading — per-section skeletons for divisions, trends, analytics tabs ([#169](https://github.com/taverns-red/toast-stats/issues/169)) ([c3e20f0](https://github.com/taverns-red/toast-stats/commit/c3e20f083357f5b2139c02c739069e05b4951f42))
* **region:** /region/:n landing page ([#423](https://github.com/taverns-red/toast-stats/issues/423)) ([#463](https://github.com/taverns-red/toast-stats/issues/463)) ([6bb558b](https://github.com/taverns-red/toast-stats/commit/6bb558b664b0dadc4caaabc7d8c2f2b9961aabf6))
* **region:** Club Growth % column + CGD officer-award rename ([#534](https://github.com/taverns-red/toast-stats/issues/534)) ([#540](https://github.com/taverns-red/toast-stats/issues/540)) ([98c8abf](https://github.com/taverns-red/toast-stats/commit/98c8abfa756b1ae33b3675afc821eefa6a438fe6))
* **region:** Distinguished countdown + Tier columns — closes Epic [#513](https://github.com/taverns-red/toast-stats/issues/513) ([#516](https://github.com/taverns-red/toast-stats/issues/516) [#517](https://github.com/taverns-red/toast-stats/issues/517)) ([#535](https://github.com/taverns-red/toast-stats/issues/535)) ([2aceb41](https://github.com/taverns-red/toast-stats/commit/2aceb4188312fdbdda7b4570bda44c5beaf29ed8))
* **region:** rollup KPIs + rank column + linkified chip — Sprint A of epic [#513](https://github.com/taverns-red/toast-stats/issues/513) ([#514](https://github.com/taverns-red/toast-stats/issues/514) [#515](https://github.com/taverns-red/toast-stats/issues/515) [#518](https://github.com/taverns-red/toast-stats/issues/518)) ([#526](https://github.com/taverns-red/toast-stats/issues/526)) ([49a6214](https://github.com/taverns-red/toast-stats/commit/49a6214ef337e039b3a127d5bb90e1f01febbbd7))
* **region:** table base → current → Δ column model (epic [#683](https://github.com/taverns-red/toast-stats/issues/683), Sprint 4) ([#698](https://github.com/taverns-red/toast-stats/issues/698)) ([caa8feb](https://github.com/taverns-red/toast-stats/commit/caa8febcdff2af8b673b6038855f5efb01eeb6c0))
* **region:** three Distinguished-remaining columns, absolute not % (epic [#683](https://github.com/taverns-red/toast-stats/issues/683), Sprint 5) ([#688](https://github.com/taverns-red/toast-stats/issues/688)) ([#702](https://github.com/taverns-red/toast-stats/issues/702)) ([7691f8f](https://github.com/taverns-red/toast-stats/commit/7691f8f0f0b31245124a0dbbb30919dd0f619851))
* replace region filter disclosure with pill toggle bar ([#326](https://github.com/taverns-red/toast-stats/issues/326)) ([1a1ce01](https://github.com/taverns-red/toast-stats/commit/1a1ce0148c8914f0155ae94db4b27b8cb72e83ca))
* **routing:** wire /history + /methodology placeholder routes ([#355](https://github.com/taverns-red/toast-stats/issues/355)) ([#379](https://github.com/taverns-red/toast-stats/issues/379)) ([919f58e](https://github.com/taverns-red/toast-stats/commit/919f58e7a5ebf09a64af12f130bf50842f9086be))
* serve time-series via CDN + useTimeSeries hook ([#170](https://github.com/taverns-red/toast-stats/issues/170)) ([73b2c07](https://github.com/taverns-red/toast-stats/commit/73b2c07232c67dfbd9afaf16d54b656faa18404d))
* **shell:** build AppShell — sticky top bar + minimalist footer ([#354](https://github.com/taverns-red/toast-stats/issues/354)) ([#378](https://github.com/taverns-red/toast-stats/issues/378)) ([bacbfe2](https://github.com/taverns-red/toast-stats/commit/bacbfe25cdb2cc2b316972ecf632a5c1056687a2))
* **shell:** universal search palette opened with Cmd-K / Ctrl-K ([#422](https://github.com/taverns-red/toast-stats/issues/422)) ([#462](https://github.com/taverns-red/toast-stats/issues/462)) ([44f4877](https://github.com/taverns-red/toast-stats/commit/44f4877af850236dd30cab7370b4fe1198875199))
* show 'Provisional' subtitle with confirmed fallback level ([#297](https://github.com/taverns-red/toast-stats/issues/297)) ([36512e9](https://github.com/taverns-red/toast-stats/commit/36512e9d88d7f6930f2fb57a038423a2651e70a9))
* show average members per club on district overview ([#318](https://github.com/taverns-red/toast-stats/issues/318)) ([186a257](https://github.com/taverns-red/toast-stats/commit/186a2575cd244f1a58a8dd35e7f4d0fe28bce5cc))
* show CSP status on club detail modal ([#288](https://github.com/taverns-red/toast-stats/issues/288)) ([4478b01](https://github.com/taverns-red/toast-stats/commit/4478b01c6d35a50923faf304d9a3c33a11da82c3))
* show provisional Distinguished badge with asterisk + tooltip ([#287](https://github.com/taverns-red/toast-stats/issues/287)) ([6096a1e](https://github.com/taverns-red/toast-stats/commit/6096a1ec41b1659aa224b76ac9359f99ecc6d1ab))
* staging environment — Phase 1+2 infrastructure + pipeline ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([0be241b](https://github.com/taverns-red/toast-stats/commit/0be241b9041470037070affb96c3737173535fb0))
* surface competitive award standings on landing page ([#331](https://github.com/taverns-red/toast-stats/issues/331)) ([9451faf](https://github.com/taverns-red/toast-stats/commit/9451faf9f35b16e0d1770b1ced48bee13e77f897))
* switch API from Gateway to HTTPS LB at api.taverns.red ([#14](https://github.com/taverns-red/toast-stats/issues/14)) ([007fb81](https://github.com/taverns-red/toast-stats/commit/007fb81af27be8b9cbf4168e580e48d12d4c1f68))
* sync additional tables with URL params ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([a68c640](https://github.com/taverns-red/toast-stats/commit/a68c64070a289340ace0aca69a6a225b8f636a13))
* sync ClubsTable pagination with URL params ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([a6da02e](https://github.com/taverns-red/toast-stats/commit/a6da02e0fff08fc3c061b5dd936f65fe99e26864))
* sync column filters to URL for deep links ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([9b76f70](https://github.com/taverns-red/toast-stats/commit/9b76f702f14515b33337e44d0afc311a80f8aa21))
* sync program year and date to URL for deep links ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([8222d46](https://github.com/taverns-red/toast-stats/commit/8222d46cbf356ca0e12393ac713210eb6b24b2b2))
* **tabs:** bulk redesign panel chrome across all tab components ([#361](https://github.com/taverns-red/toast-stats/issues/361) [#362](https://github.com/taverns-red/toast-stats/issues/362) [#363](https://github.com/taverns-red/toast-stats/issues/363) [#364](https://github.com/taverns-red/toast-stats/issues/364) [#365](https://github.com/taverns-red/toast-stats/issues/365)) ([#388](https://github.com/taverns-red/toast-stats/issues/388)) ([26c4d10](https://github.com/taverns-red/toast-stats/commit/26c4d102bb36f8b6d42a7816ba02774d1027154e))
* **test-infra:** split vitest into unit + integration projects, restore pre-push gate ([#482](https://github.com/taverns-red/toast-stats/issues/482)) ([#635](https://github.com/taverns-red/toast-stats/issues/635)) ([7f49558](https://github.com/taverns-red/toast-stats/commit/7f4955846456b423b0abd11415c24ca49675afe6))
* **tokens:** add 2026 redesign token system alongside tm-* ([#353](https://github.com/taverns-red/toast-stats/issues/353)) ([#374](https://github.com/taverns-red/toast-stats/issues/374)) ([00a25d9](https://github.com/taverns-red/toast-stats/commit/00a25d9020ecdedac0fabb401d33365717497802))
* **ui:** add 'close to distinguished' card ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([d4e08aa](https://github.com/taverns-red/toast-stats/commit/d4e08aa166303ca7d5f8ead7275283fec81a68d9))
* **ui:** add members needed column and retain pagination state ([#272](https://github.com/taverns-red/toast-stats/issues/272), [#273](https://github.com/taverns-red/toast-stats/issues/273)) ([7269e4d](https://github.com/taverns-red/toast-stats/commit/7269e4dde54b53d021251fcd3dd3ea0e10fa17e6))
* **ui:** unified DataControlsBar across DistrictsPage + DistrictDetailPage ([#528](https://github.com/taverns-red/toast-stats/issues/528) [#529](https://github.com/taverns-red/toast-stats/issues/529) [#530](https://github.com/taverns-red/toast-stats/issues/530) [#531](https://github.com/taverns-red/toast-stats/issues/531)) ([#532](https://github.com/taverns-red/toast-stats/issues/532)) ([a7e5543](https://github.com/taverns-red/toast-stats/commit/a7e554313964d40644777e16706b055e359c2b48))
* unify chart loading skeletons with animated bars ([#235](https://github.com/taverns-red/toast-stats/issues/235)) ([30c99c0](https://github.com/taverns-red/toast-stats/commit/30c99c02b66aab2abd78ca4929eaa60af41ac9fe))
* use client-side provisional detection in all badge views ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([06314f7](https://github.com/taverns-red/toast-stats/commit/06314f748916df2998ea05f43a71f7b36b344b71))
* **util:** aggregateRegions — Sprint A of /regions epic ([#493](https://github.com/taverns-red/toast-stats/issues/493), [#492](https://github.com/taverns-red/toast-stats/issues/492)) ([#498](https://github.com/taverns-red/toast-stats/issues/498)) ([668df67](https://github.com/taverns-red/toast-stats/commit/668df678f1433b7245f016bb9ecf26426befa002))
* **util:** getClubAnniversary — Sprint A of anniversaries epic ([#444](https://github.com/taverns-red/toast-stats/issues/444) [#443](https://github.com/taverns-red/toast-stats/issues/443)) ([#505](https://github.com/taverns-red/toast-stats/issues/505)) ([cad79c4](https://github.com/taverns-red/toast-stats/commit/cad79c4c504e2ec894f2b54d9bf732dbd49f5863))
* wire CDN cache monitoring into fetch layer ([#255](https://github.com/taverns-red/toast-stats/issues/255)) ([c7136bf](https://github.com/taverns-red/toast-stats/commit/c7136bf3ee26580b29e63bf2d5707369d3aa7fa5))
* wire useTimeSeries into DistrictDetailPage ([#170](https://github.com/taverns-red/toast-stats/issues/170)) ([c08da58](https://github.com/taverns-red/toast-stats/commit/c08da584bf8cc1bbe86ea5725376867e00aa7593))
* wire YoY comparison from CDN time-series data ([#170](https://github.com/taverns-red/toast-stats/issues/170)) ([f9d6ba7](https://github.com/taverns-red/toast-stats/commit/f9d6ba70824e3068b142adc613acf15f9f626d16))


### Bug Fixes

* 'Close to Distinguished' button syncs sort state to URL ([5133273](https://github.com/taverns-red/toast-stats/commit/513327339ab13993ca12b3964d248bab5a53b137))
* **a11y:** [#611](https://github.com/taverns-red/toast-stats/issues/611) Methodology / History / Landing dark-mode sweep (Track D final) ([#655](https://github.com/taverns-red/toast-stats/issues/655)) ([5cc19da](https://github.com/taverns-red/toast-stats/commit/5cc19dac1c271fc6cb08fcbdc475563f1e3a5c27))
* add /api prefix to production API base URL ([75e3ad5](https://github.com/taverns-red/toast-stats/commit/75e3ad5d21357fd79f0d7037239137fa47d3c66d))
* add missing fetchCdnSnapshotIndex mock to LandingPage tests ([#233](https://github.com/taverns-red/toast-stats/issues/233)) ([c03f194](https://github.com/taverns-red/toast-stats/commit/c03f194e40e7478b03f2e5fa5d61a226532a9fb1))
* **anniversary:** every multiple of 5 is a milestone, unbounded ([#509](https://github.com/taverns-red/toast-stats/issues/509)) ([#510](https://github.com/taverns-red/toast-stats/issues/510)) ([5bdf7f5](https://github.com/taverns-red/toast-stats/commit/5bdf7f501ed7c1088a03712a3c4c979024dd2f12))
* **anniversary:** tighter, denser layout per design handoff ([#511](https://github.com/taverns-red/toast-stats/issues/511)) ([#512](https://github.com/taverns-red/toast-stats/issues/512)) ([eb4086b](https://github.com/taverns-red/toast-stats/commit/eb4086bee8d8e852cc520275dabf0e74e4de612e))
* **awards:** [#608](https://github.com/taverns-red/toast-stats/issues/608) Awards section dark-mode contrast sweep ([#646](https://github.com/taverns-red/toast-stats/issues/646)) ([7b749c4](https://github.com/taverns-red/toast-stats/commit/7b749c47ed18e6a9ddb0d5b4ebcc7b60aaa6f46e))
* **breadcrumbs:** drop redundant top-level crumb on district + club detail ([#442](https://github.com/taverns-red/toast-stats/issues/442)) ([#455](https://github.com/taverns-red/toast-stats/issues/455)) ([5184313](https://github.com/taverns-red/toast-stats/commit/5184313932ba274577af645ad2dcc89ed292bf42))
* club net change uses base vs current membership ([#194](https://github.com/taverns-red/toast-stats/issues/194)) ([21e07bc](https://github.com/taverns-red/toast-stats/commit/21e07bcc140d2db4689496546f77a7dcd3734160))
* club.membershipBase ?? membershipTrend[0].count ?? currentMembers ([d7109df](https://github.com/taverns-red/toast-stats/commit/d7109df4ec34912d779ec45854a9b14d9b75d7c0))
* **club:** [#610](https://github.com/taverns-red/toast-stats/issues/610) ClubDetailPage dark-mode contrast sweep ([#654](https://github.com/taverns-red/toast-stats/issues/654)) ([f1b8090](https://github.com/taverns-red/toast-stats/commit/f1b8090c78455b3daa8a44d3d7a339baa57464ad))
* **club:** [#618](https://github.com/taverns-red/toast-stats/issues/618) pin hero pill text to AA-safe literals on the white pill ([#639](https://github.com/taverns-red/toast-stats/issues/639)) ([1dac46c](https://github.com/taverns-red/toast-stats/commit/1dac46c174ec26d17cb1083aff9faf7635d82546))
* ClubDCPGoalsCard not visible — data path and column names ([#242](https://github.com/taverns-red/toast-stats/issues/242)) ([e23e92d](https://github.com/taverns-red/toast-stats/commit/e23e92db62d8003f7f8cfe15c5eb49dbed2dbbd6))
* compute payment YoY from time-series data ([#269](https://github.com/taverns-red/toast-stats/issues/269)) ([3e3975b](https://github.com/taverns-red/toast-stats/commit/3e3975b4b2d98c72c935f4e9fb4cade5cea68eec))
* convert manualChunks to function for Rolldown compatibility ([#175](https://github.com/taverns-red/toast-stats/issues/175)) ([fb533a3](https://github.com/taverns-red/toast-stats/commit/fb533a3d89cbd9ca98422460f60a279a0db038c6))
* **css:** tailwind preflight was overriding every brand class — split layers ([#403](https://github.com/taverns-red/toast-stats/issues/403)) ([00ae821](https://github.com/taverns-red/toast-stats/commit/00ae821bbef9597f433b3388f3771b9e4ca3e414))
* date count inconsistency between landing and district pages ([#233](https://github.com/taverns-red/toast-stats/issues/233)) ([e8b968d](https://github.com/taverns-red/toast-stats/commit/e8b968dae5ec235d2d5200f4a0f0f59807c02d9f))
* date selector typo and region spacing ([#195](https://github.com/taverns-red/toast-stats/issues/195), [#196](https://github.com/taverns-red/toast-stats/issues/196)) ([8fb93a8](https://github.com/taverns-red/toast-stats/commit/8fb93a85e1624cefef43fb91a1eb227675b515cb))
* **deploy:** footer version was rendering as bare "v" — fix yaml/shell quoting ([#397](https://github.com/taverns-red/toast-stats/issues/397)) ([103d2b2](https://github.com/taverns-red/toast-stats/commit/103d2b290f05a7ef0070bc3e1497a8f1e23b132f))
* district detail page — rankings, date selector, cleanup ([#183](https://github.com/taverns-red/toast-stats/issues/183)) ([271224b](https://github.com/taverns-red/toast-stats/commit/271224b114feff3dc3983f9b19a022f918a32d68))
* **district-overview:** payment donut denominator is payments, not members ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#468](https://github.com/taverns-red/toast-stats/issues/468)) ([f4aaa69](https://github.com/taverns-red/toast-stats/commit/f4aaa69afb89ce1dc2c087334df2b8fe8001b7e8))
* **district:** rename "District Recognition" → "Distinguished District Status" ([#358](https://github.com/taverns-red/toast-stats/issues/358)) ([#408](https://github.com/taverns-red/toast-stats/issues/408)) ([2ee1ef3](https://github.com/taverns-red/toast-stats/commit/2ee1ef3e2354cea57e0a1730820bf158b9b89754))
* **districts:** drop Analytics chip + redundant district number, no-op [#521](https://github.com/taverns-red/toast-stats/issues/521) ([#519](https://github.com/taverns-red/toast-stats/issues/519) [#520](https://github.com/taverns-red/toast-stats/issues/520) [#521](https://github.com/taverns-red/toast-stats/issues/521)) ([#523](https://github.com/taverns-red/toast-stats/issues/523)) ([4ae84a3](https://github.com/taverns-red/toast-stats/commit/4ae84a317352bd90f4f1f5d43fcc519f9611373c))
* Division & Area tab empty — unwrap CDN snapshot data key ([#184](https://github.com/taverns-red/toast-stats/issues/184)) ([5b99953](https://github.com/taverns-red/toast-stats/commit/5b9995375a82c819c5b07e2ddb7ebcc26ce57ca1))
* exclude new charters from District Club Retention Award ([#336](https://github.com/taverns-red/toast-stats/issues/336)) ([#337](https://github.com/taverns-red/toast-stats/issues/337)) ([239a31a](https://github.com/taverns-red/toast-stats/commit/239a31acbb424483ea546c76c85f129d6e6b5707))
* **fac:** propagate FAC enrichment through ClubTrend so CHARTERED actually renders ([#503](https://github.com/taverns-red/toast-stats/issues/503)) ([#504](https://github.com/taverns-red/toast-stats/issues/504)) ([3c4a96c](https://github.com/taverns-red/toast-stats/commit/3c4a96c56795cdd97b5b293d559225669bd478cc))
* gap-to-tier now accounts for net growth alternative ([#239](https://github.com/taverns-red/toast-stats/issues/239)) ([af6b7a0](https://github.com/taverns-red/toast-stats/commit/af6b7a0f8510e877df2f88c48fd7009d960c018e))
* gap-to-tier uses membershipBase instead of trend[0] ([#241](https://github.com/taverns-red/toast-stats/issues/241)) ([d7109df](https://github.com/taverns-red/toast-stats/commit/d7109df4ec34912d779ec45854a9b14d9b75d7c0))
* HistoricalRankChart uses selected program year for label ([#232](https://github.com/taverns-red/toast-stats/issues/232)) ([9c8eb41](https://github.com/taverns-red/toast-stats/commit/9c8eb41268bcea4fe7731488b47b64ed9165abea))
* **hooks:** 5 setState-in-effect violations → render-phase sync ([#340](https://github.com/taverns-red/toast-stats/issues/340)) ([#475](https://github.com/taverns-red/toast-stats/issues/475)) ([70eabce](https://github.com/taverns-red/toast-stats/commit/70eabcea5fe92b596c99296e18e807070734d7ce))
* landing page rankings table now loads per-date data ([#301](https://github.com/taverns-red/toast-stats/issues/301)) ([f1d58dc](https://github.com/taverns-red/toast-stats/commit/f1d58dc9eb87dee2123892117ee518d4404424d4))
* landing page table uses overallRank from data instead of array index ([#303](https://github.com/taverns-red/toast-stats/issues/303)) ([3b01f62](https://github.com/taverns-red/toast-stats/commit/3b01f628e3089a30c95cbc6a48baa2ec78179102))
* member change badge uses payment base and pipeline uses --force-analytics ([#170](https://github.com/taverns-red/toast-stats/issues/170)) ([2af26d5](https://github.com/taverns-red/toast-stats/commit/2af26d5fe326b242e6d2dd74621b985ee9a4b603))
* **methodology:** correct DCP tier definitions + club health classifications ([#439](https://github.com/taverns-red/toast-stats/issues/439), [#440](https://github.com/taverns-red/toast-stats/issues/440)) ([#456](https://github.com/taverns-red/toast-stats/issues/456)) ([a46fb00](https://github.com/taverns-red/toast-stats/commit/a46fb00ffd069e501a5e988658cde3d0453507a9))
* mirror level-aware provisional thresholds in client-side fallback ([#296](https://github.com/taverns-red/toast-stats/issues/296)) ([8959305](https://github.com/taverns-red/toast-stats/commit/8959305bb099a07d92e4c7c0eda6b0b08e61468d))
* multi-year chart uses merged dataset for proper X-axis alignment ([#243](https://github.com/taverns-red/toast-stats/issues/243)) ([ed8fad3](https://github.com/taverns-red/toast-stats/commit/ed8fad32bce5680886447d3bf4722c7093448c09))
* multi-year payments chart uses timeSeries CDN data ([#243](https://github.com/taverns-red/toast-stats/issues/243)) ([c5909d9](https://github.com/taverns-red/toast-stats/commit/c5909d9da4938e220c2adf6ca45fb51be1ce4eca))
* neutralize Borda count for tied categories and fix copy/date selector ([#197](https://github.com/taverns-red/toast-stats/issues/197), [#198](https://github.com/taverns-red/toast-stats/issues/198), [#180](https://github.com/taverns-red/toast-stats/issues/180)) ([b26e514](https://github.com/taverns-red/toast-stats/commit/b26e514515080ec0b9ffc8b0917247b13a57240f))
* **overview:** bullet-bar zoom scale + region rank inline restyle ([#557](https://github.com/taverns-red/toast-stats/issues/557), [#558](https://github.com/taverns-red/toast-stats/issues/558)) ([#559](https://github.com/taverns-red/toast-stats/issues/559)) ([7d3176f](https://github.com/taverns-red/toast-stats/commit/7d3176fcbb82d8a319a6e28a0253e743d0e9689b))
* **overview:** tier-tick positioning — hotfix [#559](https://github.com/taverns-red/toast-stats/issues/559) visual regression ([#562](https://github.com/taverns-red/toast-stats/issues/562)) ([3a95f32](https://github.com/taverns-red/toast-stats/commit/3a95f32f699eb3e1bf9f8520fc0ce52e417ab6fd))
* paymentBase field name mismatch and empty topGrowthClubs ([#190](https://github.com/taverns-red/toast-stats/issues/190), [#185](https://github.com/taverns-red/toast-stats/issues/185)) ([652e865](https://github.com/taverns-red/toast-stats/commit/652e865b71bd57f82bbbc77fe02aa89319be0cb5))
* payments trend chart shows 0 — wire performanceTargets from CDN ([#183](https://github.com/taverns-red/toast-stats/issues/183)) ([a08f086](https://github.com/taverns-red/toast-stats/commit/a08f0864899cf3cb3eca1fbbf9c143e854bba0d7))
* **perf:** [#488](https://github.com/taverns-red/toast-stats/issues/488) short-circuit LazyComparisonPanel — drops CLS 0.217 → 0.01 ([#590](https://github.com/taverns-red/toast-stats/issues/590)) ([f2aa04c](https://github.com/taverns-red/toast-stats/commit/f2aa04c42e5da34fabc807a1f6ba1a28b1929cc9))
* prefix numeric district names with 'District' ([#188](https://github.com/taverns-red/toast-stats/issues/188)) ([a1deb0d](https://github.com/taverns-red/toast-stats/commit/a1deb0da0412e8afedaf7ff5adf1d7e6be2fdeba))
* provisional badge in area performance table row ([#325](https://github.com/taverns-red/toast-stats/issues/325)) ([9f60720](https://github.com/taverns-red/toast-stats/commit/9f60720a405bc414343c8142e95a75b1e8ee5dc6))
* **region:** /regions leaderboard invisible when OS=dark + app=light (epic [#683](https://github.com/taverns-red/toast-stats/issues/683), Sprint 8) ([#716](https://github.com/taverns-red/toast-stats/issues/716)) ([9a5a5b3](https://github.com/taverns-red/toast-stats/commit/9a5a5b36428873f86327e9fe5c1658896d61a168))
* **region:** district chip dark-mode contrast (epic [#683](https://github.com/taverns-red/toast-stats/issues/683), Sprint 7) ([#699](https://github.com/taverns-red/toast-stats/issues/699)) ([#714](https://github.com/taverns-red/toast-stats/issues/714)) ([231b879](https://github.com/taverns-red/toast-stats/commit/231b879cbacea83664d376c65b7f344cd6f8b91a))
* **region:** Net Club Growth shows signed net change, not distinguished-gap ([#684](https://github.com/taverns-red/toast-stats/issues/684)) ([#695](https://github.com/taverns-red/toast-stats/issues/695)) ([0f5e859](https://github.com/taverns-red/toast-stats/commit/0f5e859d688f83119d4c00906185684c65ba7fd1))
* **regions:** [#609](https://github.com/taverns-red/toast-stats/issues/609) Region pages dark-mode contrast sweep ([#652](https://github.com/taverns-red/toast-stats/issues/652)) ([37a96ee](https://github.com/taverns-red/toast-stats/commit/37a96ee2de31e349ced94549fb9b26895222a507))
* **regions:** Borda-count region scoring + /methodology section ([#501](https://github.com/taverns-red/toast-stats/issues/501)) ([#502](https://github.com/taverns-red/toast-stats/issues/502)) ([06434c8](https://github.com/taverns-red/toast-stats/commit/06434c846f6a14774ad1847400d6decb492560a4))
* **regions:** index findability — jump-to-region finder + dark focus/hover contrast (epic [#683](https://github.com/taverns-red/toast-stats/issues/683)) ([#696](https://github.com/taverns-red/toast-stats/issues/696)) ([2fab238](https://github.com/taverns-red/toast-stats/commit/2fab238338b93430f99d2d95cd82d721b5aeee7d))
* remove /api prefix from API URLs — Cloud Run routes at root ([#14](https://github.com/taverns-red/toast-stats/issues/14)) ([48bb7fc](https://github.com/taverns-red/toast-stats/commit/48bb7fcdf7262e680a6d314e4a5cdb18c0227847))
* remove stale woff2 font preload URLs ([b818ee8](https://github.com/taverns-red/toast-stats/commit/b818ee8b220cc734e87c724d48ba13debcc4aa46))
* replace membership projections with health-based distinguished outlook ([#231](https://github.com/taverns-red/toast-stats/issues/231)) ([8409fbd](https://github.com/taverns-red/toast-stats/commit/8409fbd75409113a895fb221578f8f429ee08015))
* replace misleading 'Top X%' with ordinal percentile ([#305](https://github.com/taverns-red/toast-stats/issues/305)) ([4595547](https://github.com/taverns-red/toast-stats/commit/459554726768c004da06a21eabd361376c117f8b))
* revert DCP progress panel to list-based timeline ([#166](https://github.com/taverns-red/toast-stats/issues/166)) ([eff6256](https://github.com/taverns-red/toast-stats/commit/eff62560a2f56cc15edd1fe7b4db3fca139e54e4))
* **shell:** drop double-v prefix on footer version ([#354](https://github.com/taverns-red/toast-stats/issues/354)) ([#380](https://github.com/taverns-red/toast-stats/issues/380)) ([50ae0cd](https://github.com/taverns-red/toast-stats/commit/50ae0cd2a7c0efd8d4bc0dc758d3b43114284b4d))
* snapshot-index always writes nested format, frontend normalizes on read ([#182](https://github.com/taverns-red/toast-stats/issues/182)) ([b2a7b93](https://github.com/taverns-red/toast-stats/commit/b2a7b93642beff045a726c2a0bdd332083760556))
* stabilize club detail smoke test selector ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([6534f48](https://github.com/taverns-red/toast-stats/commit/6534f48df657e591067d1af52c4781d401c77092))
* staging CDN URL detection survives Vite build optimization ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([4c628f7](https://github.com/taverns-red/toast-stats/commit/4c628f74969456c7559544fb2c81dc2f009a582a))
* **theme:** [#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 2 — opacity-variant dark-mode sweep + inert bg-amber-50/N fix ([#581](https://github.com/taverns-red/toast-stats/issues/581)) ([38720bd](https://github.com/taverns-red/toast-stats/commit/38720bd49dafdfb53c9ed38b270dc96c4c655c92))
* **theme:** [#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 3 — light-mode small-text tightening ([#582](https://github.com/taverns-red/toast-stats/issues/582)) ([fe74ddb](https://github.com/taverns-red/toast-stats/commit/fe74ddbe9f15ae394a7d4ca38ef7e56c51d2c993))
* **theme:** [#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 4 — axe-core regression coverage + unmitigated-utilities guard ([#584](https://github.com/taverns-red/toast-stats/issues/584)) ([a8ff059](https://github.com/taverns-red/toast-stats/commit/a8ff059465e76a42fc88e362ad87465477814b24))
* **theme:** dark-mode overrides for District Detail surface ([#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 1) ([#567](https://github.com/taverns-red/toast-stats/issues/567)) ([aa18542](https://github.com/taverns-red/toast-stats/commit/aa1854269c1aa6ef9921c6ac6bf1c9f0f3ebb9ac))
* Trends tab uses consistent data sources across all sections ([#319](https://github.com/taverns-red/toast-stats/issues/319)) ([3cd3689](https://github.com/taverns-red/toast-stats/commit/3cd36898f3f9301f715ff8b3195351c0c10fdfce))
* **ui:** add membersNeeded to applyFilter switch statement ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([5c37ef4](https://github.com/taverns-red/toast-stats/commit/5c37ef4b0c1b949c93630e102565d42cd44c83da))
* update test mocks for CDN-only analytics ([#168](https://github.com/taverns-red/toast-stats/issues/168)) ([a53463d](https://github.com/taverns-red/toast-stats/commit/a53463d53a93f902752c2335228e31c53e299a95))
* use build-time VITE_CDN_BASE_URL for staging CDN ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([ae8fea2](https://github.com/taverns-red/toast-stats/commit/ae8fea25b9c392bf80f885a4b3165d07377ebe94))
* use correct CDN field name 'May Visit award' for second-round visits ([#268](https://github.com/taverns-red/toast-stats/issues/268)) ([c6b9113](https://github.com/taverns-red/toast-stats/commit/c6b911383d3b205aca41502482dc64ef4a7a73f8))
* **visual:** post-audit visual regressions — Awards data, top bar, History chips, Districts toolbar/table ([#394](https://github.com/taverns-red/toast-stats/issues/394)) ([28c7e34](https://github.com/taverns-red/toast-stats/commit/28c7e346b4e0fbb3e2c773cd06dfc73f1bd5a3a0))


### Refactors

* convert dates queries to CDN fetchCdnDates ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([7a1c433](https://github.com/taverns-red/toast-stats/commit/7a1c43302bd7918b8f75ee41292bf1c51adcfe6f))
* convert useAggregatedAnalytics and useVulnerableClubs to CDN-only ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([b54e40d](https://github.com/taverns-red/toast-stats/commit/b54e40dd28bbb7fa4e293888ee684ad51bfff6e1))
* extract &lt;DistrictChipAndName&gt; ([#522](https://github.com/taverns-red/toast-stats/issues/522)) ([#586](https://github.com/taverns-red/toast-stats/issues/586)) ([b632278](https://github.com/taverns-red/toast-stats/commit/b6322781d15ea8880979680bbccb1aef201dafb2))
* migrate frontend types to shared-contracts — DistrictRanking, ProgramYearWithData, AvailableRankingYearsResponse ([#130](https://github.com/taverns-red/toast-stats/issues/130)) ([8572f0f](https://github.com/taverns-red/toast-stats/commit/8572f0f1ca76ff3a5ef172c509f3075e83a695bd))
* **rankings:** chrome refresh on Global Rankings chart + multi-year table ([#365](https://github.com/taverns-red/toast-stats/issues/365)) ([#400](https://github.com/taverns-red/toast-stats/issues/400)) ([8e7f350](https://github.com/taverns-red/toast-stats/commit/8e7f350dda9c33a4b0a927eadbdd78de48ddc28f))
* remove DCPProjectionsTable from Analytics tab ([#187](https://github.com/taverns-red/toast-stats/issues/187)) ([61ed46a](https://github.com/taverns-red/toast-stats/commit/61ed46a3c89b35d1c5d9e419c80f2931eec5c180))
* remove stale Express API references ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([071fa67](https://github.com/taverns-red/toast-stats/commit/071fa676d2d7898834bde63677a18d1df222b166))
* retire legacy district overview panels + fix flaky pre-push ([#472](https://github.com/taverns-red/toast-stats/issues/472) [#473](https://github.com/taverns-red/toast-stats/issues/473)) ([#474](https://github.com/taverns-red/toast-stats/issues/474)) ([ae7485e](https://github.com/taverns-red/toast-stats/commit/ae7485e06c8d1907b354e23d142b56a60ab5a413))
* split designTokens.ts into domain-specific modules ([#134](https://github.com/taverns-red/toast-stats/issues/134)) ([d56746e](https://github.com/taverns-red/toast-stats/commit/d56746e47c022d1216fe8712e616fd64aed56c09))
* split LazyCharts into individual files to fix fast refresh warning ([#251](https://github.com/taverns-red/toast-stats/issues/251)) ([9a8139d](https://github.com/taverns-red/toast-stats/commit/9a8139d7a4e3ef40f135cad9456cfba9ce145530))


### Documentation

* **methodology:** reciprocal /awards links from Borda/DCP/Caveats ([#373](https://github.com/taverns-red/toast-stats/issues/373)) ([#478](https://github.com/taverns-red/toast-stats/issues/478)) ([a8d212e](https://github.com/taverns-red/toast-stats/commit/a8d212e92e58cff067a8eb2e1b695414a7ef2569))


### Tests

* add aprilRenewals to integration test mocks ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([bf23a00](https://github.com/taverns-red/toast-stats/commit/bf23a0064d99d27aab6d22760f5c7e77d5b0e875))
* add CDN module mock to useAggregatedAnalytics tests ([#168](https://github.com/taverns-red/toast-stats/issues/168)) ([3978abc](https://github.com/taverns-red/toast-stats/commit/3978abc9696a0f12ac63475e0cc8748618a24fd2))
* add comprehensive CSV export test coverage ([#282](https://github.com/taverns-red/toast-stats/issues/282)) ([f086c95](https://github.com/taverns-red/toast-stats/commit/f086c95f4eaeab2949de5cb42d029f585d7f28ce))
* add integration test suite for critical user journeys ([#261](https://github.com/taverns-red/toast-stats/issues/261)) ([f5909df](https://github.com/taverns-red/toast-stats/commit/f5909dff46c7fad65680ead0836df4985a1fee47))
* add unit coverage for Sprint 15 UX utilities ([a5de16e](https://github.com/taverns-red/toast-stats/commit/a5de16e8925382f7288aed1327f8e9ecf09ebd08))
* align ClubsTable integration tests with Members Needed column layout ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([f0c44b8](https://github.com/taverns-red/toast-stats/commit/f0c44b86ac7f255bead974bca53e231e29faab43))
* fix useResponsiveChartTicks logic and add a11y DOM tests ([#18](https://github.com/taverns-red/toast-stats/issues/18)) ([ba9a668](https://github.com/taverns-red/toast-stats/commit/ba9a6688ac1157496fb849a1add777178548534a))
* migrate provisional Distinguished tests to ClubDetailPage ([#299](https://github.com/taverns-red/toast-stats/issues/299)) ([4a39390](https://github.com/taverns-red/toast-stats/commit/4a393908e1cbf349dcd8e68b2606d4bdd77ea2ee))
* red phase — getLatestPayments helper for time-series consistency ([#319](https://github.com/taverns-red/toast-stats/issues/319)) ([569b5a0](https://github.com/taverns-red/toast-stats/commit/569b5a0d1c9d8b743e50ac1e7423bd8b7d7a4923))
* red phase — Multi-Year table should use per-date rankings ([#302](https://github.com/taverns-red/toast-stats/issues/302)) ([d44c6c7](https://github.com/taverns-red/toast-stats/commit/d44c6c7e3b4674af92012eb71a7057592fc62d40))
* red phase — per-date rankings override in GlobalRankingsTab ([#302](https://github.com/taverns-red/toast-stats/issues/302)) ([413ed83](https://github.com/taverns-red/toast-stats/commit/413ed83bf36bf84807dc5bc6fa89c29868b021ac))
* red phase — provisional Distinguished badge tests ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([0056f67](https://github.com/taverns-red/toast-stats/commit/0056f6731bae8a7b1f3ed9b1ec34f734e53cf764))
* red phase — replace 'Top X%' with ordinal percentile ([#305](https://github.com/taverns-red/toast-stats/issues/305)) ([8d4e077](https://github.com/taverns-red/toast-stats/commit/8d4e0774de0f8fcb17f0dcc08759d0329f5219f1))
* update DCP section test for renamed component ([#231](https://github.com/taverns-red/toast-stats/issues/231)) ([3cd715b](https://github.com/taverns-red/toast-stats/commit/3cd715baf362fe99f9c2c06b5ac61139e3032b38))
* update test spies from console.* to logger ([#283](https://github.com/taverns-red/toast-stats/issues/283)) ([9201c50](https://github.com/taverns-red/toast-stats/commit/9201c500365cc72627188f49cbc685dfb5a47e24))

## [2.13.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.12.0...frontend-v2.13.0) (2026-05-23)


### Features

* **a11y:** tablist arrow-key navigation + tabpanel linkage ([#384](https://github.com/taverns-red/toast-stats/issues/384)) ([#476](https://github.com/taverns-red/toast-stats/issues/476)) ([dfc06f0](https://github.com/taverns-red/toast-stats/commit/dfc06f0e32f70a3a116b206477762cfabbba6e7a))
* **anniversary:** hero badge + clubs-table Years column ([#445](https://github.com/taverns-red/toast-stats/issues/445) [#448](https://github.com/taverns-red/toast-stats/issues/448) [#443](https://github.com/taverns-red/toast-stats/issues/443)) ([#506](https://github.com/taverns-red/toast-stats/issues/506)) ([0f9b45b](https://github.com/taverns-red/toast-stats/commit/0f9b45b8c2ca22d49ac0bb30ed8a999ea265486d))
* **app-shell:** move ThemeToggle from footer to header ([#565](https://github.com/taverns-red/toast-stats/issues/565)) ([#566](https://github.com/taverns-red/toast-stats/issues/566)) ([175ade1](https://github.com/taverns-red/toast-stats/commit/175ade185a8faff0d1aa0dc3ade6d80bd8080261))
* **awards-race:** add progress bars + threshold sub-line per design ([#357](https://github.com/taverns-red/toast-stats/issues/357)) ([#404](https://github.com/taverns-red/toast-stats/issues/404)) ([e9de6a3](https://github.com/taverns-red/toast-stats/commit/e9de6a371dcd001eed8f0c45b190d7e22cac31d8))
* **awards-race:** wrap 3 cards in single bordered panel + timestamp meta ([#406](https://github.com/taverns-red/toast-stats/issues/406)) ([75046f7](https://github.com/taverns-red/toast-stats/commit/75046f7eee4c9f3596a0b426173249a58b628887))
* **brand:** [#339](https://github.com/taverns-red/toast-stats/issues/339) adopt Red Taverns Brand v1.0 tokens — Phase 1 (additive) ([#595](https://github.com/taverns-red/toast-stats/issues/595)) ([ab3d83a](https://github.com/taverns-red/toast-stats/commit/ab3d83ac1aab21bcc4404bd2eaa9852436b138b5))
* **close-to-distinguished:** tighten threshold to ≤4 + unify across views ([#433](https://github.com/taverns-red/toast-stats/issues/433)) ([#441](https://github.com/taverns-red/toast-stats/issues/441)) ([c8190f4](https://github.com/taverns-red/toast-stats/commit/c8190f4022a8359f8c0e9dbf0a2c93c6658f7689))
* **clubs-table:** status segmented filter with counts ([#361](https://github.com/taverns-red/toast-stats/issues/361)) ([#470](https://github.com/taverns-red/toast-stats/issues/470)) ([4bc8e39](https://github.com/taverns-red/toast-stats/commit/4bc8e3945c66d8ba2fae4b5353a8283310a87412))
* **components:** RegionsLeaderboard + RegionGrid — Sprint B of /regions epic ([#494](https://github.com/taverns-red/toast-stats/issues/494) [#495](https://github.com/taverns-red/toast-stats/issues/495) [#492](https://github.com/taverns-red/toast-stats/issues/492)) ([#499](https://github.com/taverns-red/toast-stats/issues/499)) ([66d1872](https://github.com/taverns-red/toast-stats/commit/66d18720d2625fa7da4bcbdbd5955d08aae13f96))
* **comprehension:** rename Methodology→How it works, wire help icon, add KPI/Awards-Race tooltips ([#412](https://github.com/taverns-red/toast-stats/issues/412) [#410](https://github.com/taverns-red/toast-stats/issues/410) [#413](https://github.com/taverns-red/toast-stats/issues/413)) ([#457](https://github.com/taverns-red/toast-stats/issues/457)) ([6c0a189](https://github.com/taverns-red/toast-stats/commit/6c0a18959ae3c05c9ffddc2fe0081c9f1c473e24))
* **district-clubs:** [#489](https://github.com/taverns-red/toast-stats/issues/489) surface FAC-only clubs (ATOs / prospective) ([#594](https://github.com/taverns-red/toast-stats/issues/594)) ([d076fba](https://github.com/taverns-red/toast-stats/commit/d076fba705466ce3dd4765eecd32c8e2cd209a51))
* **district-detail:** tighten Distinguished Status panel + collapse empty notable-dates cards ([#551](https://github.com/taverns-red/toast-stats/issues/551)) ([#553](https://github.com/taverns-red/toast-stats/issues/553)) ([9cfbbad](https://github.com/taverns-red/toast-stats/commit/9cfbbadff9f692106314acb76cb5d48f014d1ec5))
* **district-overview:** Distinguished Composition stack-bar ([#360](https://github.com/taverns-red/toast-stats/issues/360) slice 2) ([#466](https://github.com/taverns-red/toast-stats/issues/466)) ([94ec825](https://github.com/taverns-red/toast-stats/commit/94ec8258663c0a75199f191bda2ba3c59d660919))
* **district-overview:** Payment Composition donut ([#360](https://github.com/taverns-red/toast-stats/issues/360) slice 3) ([#467](https://github.com/taverns-red/toast-stats/issues/467)) ([ea917b8](https://github.com/taverns-red/toast-stats/commit/ea917b877767a26970e4b2f7ed0049b7bba9c6b5))
* **district-overview:** top-right rank badge on KPI cards ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#465](https://github.com/taverns-red/toast-stats/issues/465)) ([5ddb49c](https://github.com/taverns-red/toast-stats/commit/5ddb49c34b944c97406d9479da864696e2847a0c))
* **district-overview:** wire all 5 payment types in donut ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#469](https://github.com/taverns-red/toast-stats/issues/469)) ([16be673](https://github.com/taverns-red/toast-stats/commit/16be6734badd7b8c1894779cdb4d4fe112e259ed))
* **district-status:** concrete units + reorder + drop net in gap tiles ([#555](https://github.com/taverns-red/toast-stats/issues/555), [#556](https://github.com/taverns-red/toast-stats/issues/556)) ([#560](https://github.com/taverns-red/toast-stats/issues/560)) ([921d427](https://github.com/taverns-red/toast-stats/commit/921d4274d457b3451888ae69c2421e9e67f12de1))
* **district-tabs:** discoverability — bigger, bolder, hover preview ([#437](https://github.com/taverns-red/toast-stats/issues/437)) ([#453](https://github.com/taverns-red/toast-stats/issues/453)) ([fac3695](https://github.com/taverns-red/toast-stats/commit/fac3695373fe6189960068c8c08176604626184a))
* **district:** [#449](https://github.com/taverns-red/toast-stats/issues/449) longest-serving clubs leaderboard ([#593](https://github.com/taverns-red/toast-stats/issues/593)) ([7eb021f](https://github.com/taverns-red/toast-stats/commit/7eb021f202d6ea9709649fa7d75c6a0a3fa8a335))
* **district:** /district/:id/division/:divId + .../area/:areaId pages ([#424](https://github.com/taverns-red/toast-stats/issues/424) [#425](https://github.com/taverns-red/toast-stats/issues/425)) ([#464](https://github.com/taverns-red/toast-stats/issues/464)) ([c87f2eb](https://github.com/taverns-red/toast-stats/commit/c87f2eb91ffeb62a8fe8c283c87e7e21da126b85))
* **district:** Education Levels rollup on Analytics tab ([#426](https://github.com/taverns-red/toast-stats/issues/426)) ([#481](https://github.com/taverns-red/toast-stats/issues/481)) ([3376dc9](https://github.com/taverns-red/toast-stats/commit/3376dc9693feb654740f9f220dbcb7827760f71f))
* **district:** IA Phase 1 — stack Overview/Trends/Analytics into scrollable narrative ([#569](https://github.com/taverns-red/toast-stats/issues/569)) ([#573](https://github.com/taverns-red/toast-stats/issues/573)) ([29cb3dc](https://github.com/taverns-red/toast-stats/commit/29cb3dc240e4fd9a686663526450125e0e5e1a04))
* **district:** IA Phase 2 — /district/:id/clubs route with URL-param filter state ([#570](https://github.com/taverns-red/toast-stats/issues/570)) ([#576](https://github.com/taverns-red/toast-stats/issues/576)) ([970be3e](https://github.com/taverns-red/toast-stats/commit/970be3e774283ae34fa2ea31cc3de00eeca438dc))
* **district:** IA Phase 3 — route Divisions/Rankings + retire tab strip ([#571](https://github.com/taverns-red/toast-stats/issues/571)) ([#578](https://github.com/taverns-red/toast-stats/issues/578)) ([c71354b](https://github.com/taverns-red/toast-stats/commit/c71354bbdc1bc0f1b20a4c272feb25ffe2599364))
* **district:** IA Phase 4 — sticky KPI strip + anchor TOC + smooth scroll ([#572](https://github.com/taverns-red/toast-stats/issues/572)) ([#579](https://github.com/taverns-red/toast-stats/issues/579)) ([653d7bb](https://github.com/taverns-red/toast-stats/commit/653d7bbf05a70e9633d4c7006a825fb38712fd1d))
* **districts:** add Export CSV + Share buttons to action cluster ([#357](https://github.com/taverns-red/toast-stats/issues/357)) ([#405](https://github.com/taverns-red/toast-stats/issues/405)) ([64b99e8](https://github.com/taverns-red/toast-stats/commit/64b99e863f96fd7a2bda566ee79e24b5302dde85))
* **districts:** DDP tier chip + row density on rankings page ([#546](https://github.com/taverns-red/toast-stats/issues/546)) ([#549](https://github.com/taverns-red/toast-stats/issues/549)) ([e538da4](https://github.com/taverns-red/toast-stats/commit/e538da4fb5c4cd791ab918bef73f8542fe22c1b2))
* **districts:** District Search prominence — '/' shortcut + type-ahead + hero styling ([#435](https://github.com/taverns-red/toast-stats/issues/435)) ([#451](https://github.com/taverns-red/toast-stats/issues/451)) ([475912d](https://github.com/taverns-red/toast-stats/commit/475912d26893fd7f2c71c4fc5724eb175722e33d))
* **districts:** localStorage primitive + my-district sticky pin ([#420](https://github.com/taverns-red/toast-stats/issues/420) [#417](https://github.com/taverns-red/toast-stats/issues/417)) ([#458](https://github.com/taverns-red/toast-stats/issues/458)) ([01ba0c9](https://github.com/taverns-red/toast-stats/commit/01ba0c928bf8a4e930b434e6e834df8342274a7b))
* **districts:** orientation strip below lede ([#415](https://github.com/taverns-red/toast-stats/issues/415)) ([#459](https://github.com/taverns-red/toast-stats/issues/459)) ([24017ae](https://github.com/taverns-red/toast-stats/commit/24017aeb31da8781b34345cc9c612f8b69f81358))
* **districts:** persist sort/regions + 'what changed since last visit' diff strip ([#416](https://github.com/taverns-red/toast-stats/issues/416) [#418](https://github.com/taverns-red/toast-stats/issues/418)) ([#461](https://github.com/taverns-red/toast-stats/issues/461)) ([8f48f47](https://github.com/taverns-red/toast-stats/commit/8f48f47fab56b670543258200d05844b75e3790d))
* **districts:** rankings table — District first + standalone number chip ([#436](https://github.com/taverns-red/toast-stats/issues/436)) ([#452](https://github.com/taverns-red/toast-stats/issues/452)) ([65c669d](https://github.com/taverns-red/toast-stats/commit/65c669da3800a4c5d8ba4807d49c6ad8c8ca7927))
* **districts:** region filter — solo-select + state badge ([#434](https://github.com/taverns-red/toast-stats/issues/434)) ([#450](https://github.com/taverns-red/toast-stats/issues/450)) ([c1c5168](https://github.com/taverns-red/toast-stats/commit/c1c5168ad9005c42cd80f6e34b97de96f1b553ec))
* **district:** Total Members KPI card on District Detail ([#428](https://github.com/taverns-red/toast-stats/issues/428)) ([#460](https://github.com/taverns-red/toast-stats/issues/460)) ([29e36af](https://github.com/taverns-red/toast-stats/commit/29e36aff34773b09753f6be967e427809c62c8ce))
* **district:** upcoming anniversaries panel + milestones callout ([#446](https://github.com/taverns-red/toast-stats/issues/446) [#447](https://github.com/taverns-red/toast-stats/issues/447) [#443](https://github.com/taverns-red/toast-stats/issues/443)) ([#507](https://github.com/taverns-red/toast-stats/issues/507)) ([71d2dbb](https://github.com/taverns-red/toast-stats/commit/71d2dbbad5624458cf6a49d240228a967d8851da))
* **divisions:** Distinguished Program criteria explainer ([#362](https://github.com/taverns-red/toast-stats/issues/362) Divisions & Areas redesign) ([#471](https://github.com/taverns-red/toast-stats/issues/471)) ([f5b087c](https://github.com/taverns-red/toast-stats/commit/f5b087c83775f257d1f5458a826e2a9557fd0dc6))
* **find-a-club:** schema bump + Club hero CHARTERED + disable pre-push ([#429](https://github.com/taverns-red/toast-stats/issues/429) [#431](https://github.com/taverns-red/toast-stats/issues/431) [#432](https://github.com/taverns-red/toast-stats/issues/432)) ([#483](https://github.com/taverns-red/toast-stats/issues/483)) ([ca573cd](https://github.com/taverns-red/toast-stats/commit/ca573cd9f457a9a6f3e4954c7f932bf1a3d26531))
* **membership-trend:** GREEN — methodology surfacing on chart + /methodology section ([#438](https://github.com/taverns-red/toast-stats/issues/438)) ([#454](https://github.com/taverns-red/toast-stats/issues/454)) ([8b7e64f](https://github.com/taverns-red/toast-stats/commit/8b7e64fc40cde0a92415d60112add411c8e726d8))
* **overview:** District Overview KPI redesign — bullet bars + lean 3-card layout ([#550](https://github.com/taverns-red/toast-stats/issues/550)) ([#552](https://github.com/taverns-red/toast-stats/issues/552)) ([03615a2](https://github.com/taverns-red/toast-stats/commit/03615a2e65dd756791c32f510b8f576d11f77fee))
* **page+shell:** /regions page + enable Regions nav — Sprint C of /regions epic ([#496](https://github.com/taverns-red/toast-stats/issues/496) [#497](https://github.com/taverns-red/toast-stats/issues/497) [#492](https://github.com/taverns-red/toast-stats/issues/492)) ([#500](https://github.com/taverns-red/toast-stats/issues/500)) ([75a9be4](https://github.com/taverns-red/toast-stats/commit/75a9be472a1ced639ec04c5404dca880b3b21d11))
* **print:** print stylesheet for clean board-meeting handouts ([#427](https://github.com/taverns-red/toast-stats/issues/427)) ([#477](https://github.com/taverns-red/toast-stats/issues/477)) ([cbb01db](https://github.com/taverns-red/toast-stats/commit/cbb01db5c4a4cd39262581a5af2d7b9c7d0f12cd))
* **region:** /region/:n landing page ([#423](https://github.com/taverns-red/toast-stats/issues/423)) ([#463](https://github.com/taverns-red/toast-stats/issues/463)) ([6bb558b](https://github.com/taverns-red/toast-stats/commit/6bb558b664b0dadc4caaabc7d8c2f2b9961aabf6))
* **region:** Club Growth % column + CGD officer-award rename ([#534](https://github.com/taverns-red/toast-stats/issues/534)) ([#540](https://github.com/taverns-red/toast-stats/issues/540)) ([98c8abf](https://github.com/taverns-red/toast-stats/commit/98c8abfa756b1ae33b3675afc821eefa6a438fe6))
* **region:** Distinguished countdown + Tier columns — closes Epic [#513](https://github.com/taverns-red/toast-stats/issues/513) ([#516](https://github.com/taverns-red/toast-stats/issues/516) [#517](https://github.com/taverns-red/toast-stats/issues/517)) ([#535](https://github.com/taverns-red/toast-stats/issues/535)) ([2aceb41](https://github.com/taverns-red/toast-stats/commit/2aceb4188312fdbdda7b4570bda44c5beaf29ed8))
* **region:** rollup KPIs + rank column + linkified chip — Sprint A of epic [#513](https://github.com/taverns-red/toast-stats/issues/513) ([#514](https://github.com/taverns-red/toast-stats/issues/514) [#515](https://github.com/taverns-red/toast-stats/issues/515) [#518](https://github.com/taverns-red/toast-stats/issues/518)) ([#526](https://github.com/taverns-red/toast-stats/issues/526)) ([49a6214](https://github.com/taverns-red/toast-stats/commit/49a6214ef337e039b3a127d5bb90e1f01febbbd7))
* **shell:** universal search palette opened with Cmd-K / Ctrl-K ([#422](https://github.com/taverns-red/toast-stats/issues/422)) ([#462](https://github.com/taverns-red/toast-stats/issues/462)) ([44f4877](https://github.com/taverns-red/toast-stats/commit/44f4877af850236dd30cab7370b4fe1198875199))
* **ui:** unified DataControlsBar across DistrictsPage + DistrictDetailPage ([#528](https://github.com/taverns-red/toast-stats/issues/528) [#529](https://github.com/taverns-red/toast-stats/issues/529) [#530](https://github.com/taverns-red/toast-stats/issues/530) [#531](https://github.com/taverns-red/toast-stats/issues/531)) ([#532](https://github.com/taverns-red/toast-stats/issues/532)) ([a7e5543](https://github.com/taverns-red/toast-stats/commit/a7e554313964d40644777e16706b055e359c2b48))
* **util:** aggregateRegions — Sprint A of /regions epic ([#493](https://github.com/taverns-red/toast-stats/issues/493), [#492](https://github.com/taverns-red/toast-stats/issues/492)) ([#498](https://github.com/taverns-red/toast-stats/issues/498)) ([668df67](https://github.com/taverns-red/toast-stats/commit/668df678f1433b7245f016bb9ecf26426befa002))
* **util:** getClubAnniversary — Sprint A of anniversaries epic ([#444](https://github.com/taverns-red/toast-stats/issues/444) [#443](https://github.com/taverns-red/toast-stats/issues/443)) ([#505](https://github.com/taverns-red/toast-stats/issues/505)) ([cad79c4](https://github.com/taverns-red/toast-stats/commit/cad79c4c504e2ec894f2b54d9bf732dbd49f5863))


### Bug Fixes

* **anniversary:** every multiple of 5 is a milestone, unbounded ([#509](https://github.com/taverns-red/toast-stats/issues/509)) ([#510](https://github.com/taverns-red/toast-stats/issues/510)) ([5bdf7f5](https://github.com/taverns-red/toast-stats/commit/5bdf7f501ed7c1088a03712a3c4c979024dd2f12))
* **anniversary:** tighter, denser layout per design handoff ([#511](https://github.com/taverns-red/toast-stats/issues/511)) ([#512](https://github.com/taverns-red/toast-stats/issues/512)) ([eb4086b](https://github.com/taverns-red/toast-stats/commit/eb4086bee8d8e852cc520275dabf0e74e4de612e))
* **breadcrumbs:** drop redundant top-level crumb on district + club detail ([#442](https://github.com/taverns-red/toast-stats/issues/442)) ([#455](https://github.com/taverns-red/toast-stats/issues/455)) ([5184313](https://github.com/taverns-red/toast-stats/commit/5184313932ba274577af645ad2dcc89ed292bf42))
* **css:** tailwind preflight was overriding every brand class — split layers ([#403](https://github.com/taverns-red/toast-stats/issues/403)) ([00ae821](https://github.com/taverns-red/toast-stats/commit/00ae821bbef9597f433b3388f3771b9e4ca3e414))
* **district-overview:** payment donut denominator is payments, not members ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#468](https://github.com/taverns-red/toast-stats/issues/468)) ([f4aaa69](https://github.com/taverns-red/toast-stats/commit/f4aaa69afb89ce1dc2c087334df2b8fe8001b7e8))
* **district:** rename "District Recognition" → "Distinguished District Status" ([#358](https://github.com/taverns-red/toast-stats/issues/358)) ([#408](https://github.com/taverns-red/toast-stats/issues/408)) ([2ee1ef3](https://github.com/taverns-red/toast-stats/commit/2ee1ef3e2354cea57e0a1730820bf158b9b89754))
* **districts:** drop Analytics chip + redundant district number, no-op [#521](https://github.com/taverns-red/toast-stats/issues/521) ([#519](https://github.com/taverns-red/toast-stats/issues/519) [#520](https://github.com/taverns-red/toast-stats/issues/520) [#521](https://github.com/taverns-red/toast-stats/issues/521)) ([#523](https://github.com/taverns-red/toast-stats/issues/523)) ([4ae84a3](https://github.com/taverns-red/toast-stats/commit/4ae84a317352bd90f4f1f5d43fcc519f9611373c))
* **fac:** propagate FAC enrichment through ClubTrend so CHARTERED actually renders ([#503](https://github.com/taverns-red/toast-stats/issues/503)) ([#504](https://github.com/taverns-red/toast-stats/issues/504)) ([3c4a96c](https://github.com/taverns-red/toast-stats/commit/3c4a96c56795cdd97b5b293d559225669bd478cc))
* **hooks:** 5 setState-in-effect violations → render-phase sync ([#340](https://github.com/taverns-red/toast-stats/issues/340)) ([#475](https://github.com/taverns-red/toast-stats/issues/475)) ([70eabce](https://github.com/taverns-red/toast-stats/commit/70eabcea5fe92b596c99296e18e807070734d7ce))
* **methodology:** correct DCP tier definitions + club health classifications ([#439](https://github.com/taverns-red/toast-stats/issues/439), [#440](https://github.com/taverns-red/toast-stats/issues/440)) ([#456](https://github.com/taverns-red/toast-stats/issues/456)) ([a46fb00](https://github.com/taverns-red/toast-stats/commit/a46fb00ffd069e501a5e988658cde3d0453507a9))
* **overview:** bullet-bar zoom scale + region rank inline restyle ([#557](https://github.com/taverns-red/toast-stats/issues/557), [#558](https://github.com/taverns-red/toast-stats/issues/558)) ([#559](https://github.com/taverns-red/toast-stats/issues/559)) ([7d3176f](https://github.com/taverns-red/toast-stats/commit/7d3176fcbb82d8a319a6e28a0253e743d0e9689b))
* **overview:** tier-tick positioning — hotfix [#559](https://github.com/taverns-red/toast-stats/issues/559) visual regression ([#562](https://github.com/taverns-red/toast-stats/issues/562)) ([3a95f32](https://github.com/taverns-red/toast-stats/commit/3a95f32f699eb3e1bf9f8520fc0ce52e417ab6fd))
* **perf:** [#488](https://github.com/taverns-red/toast-stats/issues/488) short-circuit LazyComparisonPanel — drops CLS 0.217 → 0.01 ([#590](https://github.com/taverns-red/toast-stats/issues/590)) ([f2aa04c](https://github.com/taverns-red/toast-stats/commit/f2aa04c42e5da34fabc807a1f6ba1a28b1929cc9))
* **regions:** Borda-count region scoring + /methodology section ([#501](https://github.com/taverns-red/toast-stats/issues/501)) ([#502](https://github.com/taverns-red/toast-stats/issues/502)) ([06434c8](https://github.com/taverns-red/toast-stats/commit/06434c846f6a14774ad1847400d6decb492560a4))
* **theme:** [#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 2 — opacity-variant dark-mode sweep + inert bg-amber-50/N fix ([#581](https://github.com/taverns-red/toast-stats/issues/581)) ([38720bd](https://github.com/taverns-red/toast-stats/commit/38720bd49dafdfb53c9ed38b270dc96c4c655c92))
* **theme:** [#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 3 — light-mode small-text tightening ([#582](https://github.com/taverns-red/toast-stats/issues/582)) ([fe74ddb](https://github.com/taverns-red/toast-stats/commit/fe74ddbe9f15ae394a7d4ca38ef7e56c51d2c993))
* **theme:** [#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 4 — axe-core regression coverage + unmitigated-utilities guard ([#584](https://github.com/taverns-red/toast-stats/issues/584)) ([a8ff059](https://github.com/taverns-red/toast-stats/commit/a8ff059465e76a42fc88e362ad87465477814b24))
* **theme:** dark-mode overrides for District Detail surface ([#564](https://github.com/taverns-red/toast-stats/issues/564) Phase 1) ([#567](https://github.com/taverns-red/toast-stats/issues/567)) ([aa18542](https://github.com/taverns-red/toast-stats/commit/aa1854269c1aa6ef9921c6ac6bf1c9f0f3ebb9ac))


### Refactors

* extract &lt;DistrictChipAndName&gt; ([#522](https://github.com/taverns-red/toast-stats/issues/522)) ([#586](https://github.com/taverns-red/toast-stats/issues/586)) ([b632278](https://github.com/taverns-red/toast-stats/commit/b6322781d15ea8880979680bbccb1aef201dafb2))
* retire legacy district overview panels + fix flaky pre-push ([#472](https://github.com/taverns-red/toast-stats/issues/472) [#473](https://github.com/taverns-red/toast-stats/issues/473)) ([#474](https://github.com/taverns-red/toast-stats/issues/474)) ([ae7485e](https://github.com/taverns-red/toast-stats/commit/ae7485e06c8d1907b354e23d142b56a60ab5a413))


### Documentation

* **methodology:** reciprocal /awards links from Borda/DCP/Caveats ([#373](https://github.com/taverns-red/toast-stats/issues/373)) ([#478](https://github.com/taverns-red/toast-stats/issues/478)) ([a8d212e](https://github.com/taverns-red/toast-stats/commit/a8d212e92e58cff067a8eb2e1b695414a7ef2569))

## [2.12.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.11.0...frontend-v2.12.0) (2026-05-10)


### Features

* **club:** redesign Close-to-Distinguished call-out + move under hero ([#366](https://github.com/taverns-red/toast-stats/issues/366)) ([#401](https://github.com/taverns-red/toast-stats/issues/401)) ([7ac4fe8](https://github.com/taverns-red/toast-stats/commit/7ac4fe86715b11ecee1a697144db8ef725ff72a5))
* **club:** redesign Club detail hero header per handoff ([#23](https://github.com/taverns-red/toast-stats/issues/23) follow-up to [#366](https://github.com/taverns-red/toast-stats/issues/366)) ([#398](https://github.com/taverns-red/toast-stats/issues/398)) ([1cdf649](https://github.com/taverns-red/toast-stats/commit/1cdf64921d8bf620f647904bb280b44ae6755f8f))
* **clubs:** redesign quick-filter chips on Clubs tab ([#24](https://github.com/taverns-red/toast-stats/issues/24) follow-up to [#361](https://github.com/taverns-red/toast-stats/issues/361)) ([#399](https://github.com/taverns-red/toast-stats/issues/399)) ([649acdc](https://github.com/taverns-red/toast-stats/commit/649acdcdd78bfd2d53a188300868a621a7444fe1))


### Bug Fixes

* **deploy:** footer version was rendering as bare "v" — fix yaml/shell quoting ([#397](https://github.com/taverns-red/toast-stats/issues/397)) ([103d2b2](https://github.com/taverns-red/toast-stats/commit/103d2b290f05a7ef0070bc3e1497a8f1e23b132f))
* **visual:** post-audit visual regressions — Awards data, top bar, History chips, Districts toolbar/table ([#394](https://github.com/taverns-red/toast-stats/issues/394)) ([28c7e34](https://github.com/taverns-red/toast-stats/commit/28c7e346b4e0fbb3e2c773cd06dfc73f1bd5a3a0))


### Refactors

* **rankings:** chrome refresh on Global Rankings chart + multi-year table ([#365](https://github.com/taverns-red/toast-stats/issues/365)) ([#400](https://github.com/taverns-red/toast-stats/issues/400)) ([8e7f350](https://github.com/taverns-red/toast-stats/commit/8e7f350dda9c33a4b0a927eadbdd78de48ddc28f))

## [2.11.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.10.0...frontend-v2.11.0) (2026-05-10)


### Features

* **awards:** rebuild AwardsRaceSection as 3-card contender summary ([#357](https://github.com/taverns-red/toast-stats/issues/357)) ([#382](https://github.com/taverns-red/toast-stats/issues/382)) ([130ac87](https://github.com/taverns-red/toast-stats/commit/130ac87a7e86066f534d5faf50b53bef7977646d))
* **awards:** ship /awards page with top-10 leaderboards ([#370](https://github.com/taverns-red/toast-stats/issues/370) [#371](https://github.com/taverns-red/toast-stats/issues/371) [#372](https://github.com/taverns-red/toast-stats/issues/372) [#373](https://github.com/taverns-red/toast-stats/issues/373)) ([#392](https://github.com/taverns-red/toast-stats/issues/392)) ([0a3129d](https://github.com/taverns-red/toast-stats/commit/0a3129d70051f1a69b416542f053e573cca9b011))
* **club:** apply redesign panel chrome to ClubDetailPage ([#366](https://github.com/taverns-red/toast-stats/issues/366)) ([#389](https://github.com/taverns-red/toast-stats/issues/389)) ([071f970](https://github.com/taverns-red/toast-stats/commit/071f9709508881980b505ad16304255e13a8900a))
* **district:** apply 2026 redesign chrome to DistrictDetailPage header ([#358](https://github.com/taverns-red/toast-stats/issues/358)) ([#383](https://github.com/taverns-red/toast-stats/issues/383)) ([9c5df23](https://github.com/taverns-red/toast-stats/commit/9c5df2368b0353d576af5dd73caafcfe8d72f33a))
* **district:** extract DistrictDetailTabs primitive ([#359](https://github.com/taverns-red/toast-stats/issues/359)) ([#385](https://github.com/taverns-red/toast-stats/issues/385)) ([8c51940](https://github.com/taverns-red/toast-stats/commit/8c51940d6172cf778e23aa0da1462fa7a9ca0236))
* **districts:** apply 2026 redesign chrome to LandingPage in place ([#356](https://github.com/taverns-red/toast-stats/issues/356)) ([#381](https://github.com/taverns-red/toast-stats/issues/381)) ([9dc6662](https://github.com/taverns-red/toast-stats/commit/9dc6662fdb4ac5928fb295746626d04cd2c7a612))
* **history,methodology:** ship History year strip + full Methodology content ([#367](https://github.com/taverns-red/toast-stats/issues/367) [#368](https://github.com/taverns-red/toast-stats/issues/368)) ([#390](https://github.com/taverns-red/toast-stats/issues/390)) ([dbf6b0c](https://github.com/taverns-red/toast-stats/commit/dbf6b0c06ff7b283c094f437d69a818639b990f3))
* **overview:** apply redesign panel chrome to Overview tab components ([#360](https://github.com/taverns-red/toast-stats/issues/360)) ([#387](https://github.com/taverns-red/toast-stats/issues/387)) ([b6de4bc](https://github.com/taverns-red/toast-stats/commit/b6de4bcf708dca5857d8160758896857e9ace3b5))
* **routing:** wire /history + /methodology placeholder routes ([#355](https://github.com/taverns-red/toast-stats/issues/355)) ([#379](https://github.com/taverns-red/toast-stats/issues/379)) ([919f58e](https://github.com/taverns-red/toast-stats/commit/919f58e7a5ebf09a64af12f130bf50842f9086be))
* **shell:** build AppShell — sticky top bar + minimalist footer ([#354](https://github.com/taverns-red/toast-stats/issues/354)) ([#378](https://github.com/taverns-red/toast-stats/issues/378)) ([bacbfe2](https://github.com/taverns-red/toast-stats/commit/bacbfe25cdb2cc2b316972ecf632a5c1056687a2))
* **tabs:** bulk redesign panel chrome across all tab components ([#361](https://github.com/taverns-red/toast-stats/issues/361) [#362](https://github.com/taverns-red/toast-stats/issues/362) [#363](https://github.com/taverns-red/toast-stats/issues/363) [#364](https://github.com/taverns-red/toast-stats/issues/364) [#365](https://github.com/taverns-red/toast-stats/issues/365)) ([#388](https://github.com/taverns-red/toast-stats/issues/388)) ([26c4d10](https://github.com/taverns-red/toast-stats/commit/26c4d102bb36f8b6d42a7816ba02774d1027154e))
* **tokens:** add 2026 redesign token system alongside tm-* ([#353](https://github.com/taverns-red/toast-stats/issues/353)) ([#374](https://github.com/taverns-red/toast-stats/issues/374)) ([00a25d9](https://github.com/taverns-red/toast-stats/commit/00a25d9020ecdedac0fabb401d33365717497802))


### Bug Fixes

* **shell:** drop double-v prefix on footer version ([#354](https://github.com/taverns-red/toast-stats/issues/354)) ([#380](https://github.com/taverns-red/toast-stats/issues/380)) ([50ae0cd](https://github.com/taverns-red/toast-stats/commit/50ae0cd2a7c0efd8d4bc0dc758d3b43114284b4d))

## [2.10.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.9.0...frontend-v2.10.0) (2026-04-22)


### Features

* display threshold + officer awards in trophy case ([#333](https://github.com/taverns-red/toast-stats/issues/333)) ([91bafe3](https://github.com/taverns-red/toast-stats/commit/91bafe36a7ee2a730f8dc783e4a03d74fa21df8b))
* Distinguished District tier tracking + trophy case ([#332](https://github.com/taverns-red/toast-stats/issues/332)) ([1e12e5c](https://github.com/taverns-red/toast-stats/commit/1e12e5cd696c9303dae58c5a17e61b89394e9b59))
* district-free club URL + club index ([#320](https://github.com/taverns-red/toast-stats/issues/320)) ([7f12903](https://github.com/taverns-red/toast-stats/commit/7f12903c8f85a2c270cb6bb47efdf4442ee5d3ae))
* mark area Distinguished as provisional when visits incomplete ([#325](https://github.com/taverns-red/toast-stats/issues/325)) ([3459456](https://github.com/taverns-red/toast-stats/commit/3459456fef2df5db73749858de6cedf4e3086259))
* PaymentCompositionCard on District Detail Overview ([#327](https://github.com/taverns-red/toast-stats/issues/327)) ([25c0fcc](https://github.com/taverns-red/toast-stats/commit/25c0fcc28f36be41dec28bd0cbaa810f93cf8871))
* replace region filter disclosure with pill toggle bar ([#326](https://github.com/taverns-red/toast-stats/issues/326)) ([1a1ce01](https://github.com/taverns-red/toast-stats/commit/1a1ce0148c8914f0155ae94db4b27b8cb72e83ca))
* show average members per club on district overview ([#318](https://github.com/taverns-red/toast-stats/issues/318)) ([186a257](https://github.com/taverns-red/toast-stats/commit/186a2575cd244f1a58a8dd35e7f4d0fe28bce5cc))
* staging environment — Phase 1+2 infrastructure + pipeline ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([0be241b](https://github.com/taverns-red/toast-stats/commit/0be241b9041470037070affb96c3737173535fb0))
* surface competitive award standings on landing page ([#331](https://github.com/taverns-red/toast-stats/issues/331)) ([9451faf](https://github.com/taverns-red/toast-stats/commit/9451faf9f35b16e0d1770b1ced48bee13e77f897))


### Bug Fixes

* 'Close to Distinguished' button syncs sort state to URL ([5133273](https://github.com/taverns-red/toast-stats/commit/513327339ab13993ca12b3964d248bab5a53b137))
* exclude new charters from District Club Retention Award ([#336](https://github.com/taverns-red/toast-stats/issues/336)) ([#337](https://github.com/taverns-red/toast-stats/issues/337)) ([239a31a](https://github.com/taverns-red/toast-stats/commit/239a31acbb424483ea546c76c85f129d6e6b5707))
* provisional badge in area performance table row ([#325](https://github.com/taverns-red/toast-stats/issues/325)) ([9f60720](https://github.com/taverns-red/toast-stats/commit/9f60720a405bc414343c8142e95a75b1e8ee5dc6))
* stabilize club detail smoke test selector ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([6534f48](https://github.com/taverns-red/toast-stats/commit/6534f48df657e591067d1af52c4781d401c77092))
* staging CDN URL detection survives Vite build optimization ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([4c628f7](https://github.com/taverns-red/toast-stats/commit/4c628f74969456c7559544fb2c81dc2f009a582a))
* Trends tab uses consistent data sources across all sections ([#319](https://github.com/taverns-red/toast-stats/issues/319)) ([3cd3689](https://github.com/taverns-red/toast-stats/commit/3cd36898f3f9301f715ff8b3195351c0c10fdfce))
* use build-time VITE_CDN_BASE_URL for staging CDN ([#316](https://github.com/taverns-red/toast-stats/issues/316)) ([ae8fea2](https://github.com/taverns-red/toast-stats/commit/ae8fea25b9c392bf80f885a4b3165d07377ebe94))


### Tests

* red phase — getLatestPayments helper for time-series consistency ([#319](https://github.com/taverns-red/toast-stats/issues/319)) ([569b5a0](https://github.com/taverns-red/toast-stats/commit/569b5a0d1c9d8b743e50ac1e7423bd8b7d7a4923))

## [2.9.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.8.0...frontend-v2.9.0) (2026-04-07)


### Features

* Google Analytics 4 + release notes link in footer ([#314](https://github.com/taverns-red/toast-stats/issues/314), [#312](https://github.com/taverns-red/toast-stats/issues/312)) ([fa5a2be](https://github.com/taverns-red/toast-stats/commit/fa5a2be45e8fc2bd5aa5bcc596d7bd6d6fba63f8))

## [2.8.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.7.0...frontend-v2.8.0) (2026-04-06)


### Features

* add client-side provisional Distinguished utility ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([ee83434](https://github.com/taverns-red/toast-stats/commit/ee8343444dd7292dc6822c200031c10fd31d968d))
* add CSP submission status card to ClubDetailPage ([#298](https://github.com/taverns-red/toast-stats/issues/298)) ([302e080](https://github.com/taverns-red/toast-stats/commit/302e08017117839241a46808db909e9b3402c291))
* GlobalRankingsTab uses per-date rankings for accuracy ([#302](https://github.com/taverns-red/toast-stats/issues/302)) ([46c7b28](https://github.com/taverns-red/toast-stats/commit/46c7b28bb6e8f43f0ff58a9150b369c915781fdc))
* show 'Provisional' subtitle with confirmed fallback level ([#297](https://github.com/taverns-red/toast-stats/issues/297)) ([36512e9](https://github.com/taverns-red/toast-stats/commit/36512e9d88d7f6930f2fb57a038423a2651e70a9))
* show CSP status on club detail modal ([#288](https://github.com/taverns-red/toast-stats/issues/288)) ([4478b01](https://github.com/taverns-red/toast-stats/commit/4478b01c6d35a50923faf304d9a3c33a11da82c3))
* show provisional Distinguished badge with asterisk + tooltip ([#287](https://github.com/taverns-red/toast-stats/issues/287)) ([6096a1e](https://github.com/taverns-red/toast-stats/commit/6096a1ec41b1659aa224b76ac9359f99ecc6d1ab))
* use client-side provisional detection in all badge views ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([06314f7](https://github.com/taverns-red/toast-stats/commit/06314f748916df2998ea05f43a71f7b36b344b71))


### Bug Fixes

* landing page rankings table now loads per-date data ([#301](https://github.com/taverns-red/toast-stats/issues/301)) ([f1d58dc](https://github.com/taverns-red/toast-stats/commit/f1d58dc9eb87dee2123892117ee518d4404424d4))
* landing page table uses overallRank from data instead of array index ([#303](https://github.com/taverns-red/toast-stats/issues/303)) ([3b01f62](https://github.com/taverns-red/toast-stats/commit/3b01f628e3089a30c95cbc6a48baa2ec78179102))
* mirror level-aware provisional thresholds in client-side fallback ([#296](https://github.com/taverns-red/toast-stats/issues/296)) ([8959305](https://github.com/taverns-red/toast-stats/commit/8959305bb099a07d92e4c7c0eda6b0b08e61468d))
* replace misleading 'Top X%' with ordinal percentile ([#305](https://github.com/taverns-red/toast-stats/issues/305)) ([4595547](https://github.com/taverns-red/toast-stats/commit/459554726768c004da06a21eabd361376c117f8b))


### Tests

* add aprilRenewals to integration test mocks ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([bf23a00](https://github.com/taverns-red/toast-stats/commit/bf23a0064d99d27aab6d22760f5c7e77d5b0e875))
* migrate provisional Distinguished tests to ClubDetailPage ([#299](https://github.com/taverns-red/toast-stats/issues/299)) ([4a39390](https://github.com/taverns-red/toast-stats/commit/4a393908e1cbf349dcd8e68b2606d4bdd77ea2ee))
* red phase — Multi-Year table should use per-date rankings ([#302](https://github.com/taverns-red/toast-stats/issues/302)) ([d44c6c7](https://github.com/taverns-red/toast-stats/commit/d44c6c7e3b4674af92012eb71a7057592fc62d40))
* red phase — per-date rankings override in GlobalRankingsTab ([#302](https://github.com/taverns-red/toast-stats/issues/302)) ([413ed83](https://github.com/taverns-red/toast-stats/commit/413ed83bf36bf84807dc5bc6fa89c29868b021ac))
* red phase — provisional Distinguished badge tests ([#291](https://github.com/taverns-red/toast-stats/issues/291)) ([0056f67](https://github.com/taverns-red/toast-stats/commit/0056f6731bae8a7b1f3ed9b1ec34f734e53cf764))
* red phase — replace 'Top X%' with ordinal percentile ([#305](https://github.com/taverns-red/toast-stats/issues/305)) ([8d4e077](https://github.com/taverns-red/toast-stats/commit/8d4e0774de0f8fcb17f0dcc08759d0329f5219f1))

## [2.7.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.6.0...frontend-v2.7.0) (2026-04-04)


### Features

* sync column filters to URL for deep links ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([9b76f70](https://github.com/taverns-red/toast-stats/commit/9b76f702f14515b33337e44d0afc311a80f8aa21))
* sync program year and date to URL for deep links ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([8222d46](https://github.com/taverns-red/toast-stats/commit/8222d46cbf356ca0e12393ac713210eb6b24b2b2))
* wire CDN cache monitoring into fetch layer ([#255](https://github.com/taverns-red/toast-stats/issues/255)) ([c7136bf](https://github.com/taverns-red/toast-stats/commit/c7136bf3ee26580b29e63bf2d5707369d3aa7fa5))


### Tests

* add comprehensive CSV export test coverage ([#282](https://github.com/taverns-red/toast-stats/issues/282)) ([f086c95](https://github.com/taverns-red/toast-stats/commit/f086c95f4eaeab2949de5cb42d029f585d7f28ce))
* update test spies from console.* to logger ([#283](https://github.com/taverns-red/toast-stats/issues/283)) ([9201c50](https://github.com/taverns-red/toast-stats/commit/9201c500365cc72627188f49cbc685dfb5a47e24))

## [2.6.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.5.0...frontend-v2.6.0) (2026-04-03)


### Features

* add ClubsNeedingMembersCard to Overview tab ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([951b186](https://github.com/taverns-red/toast-stats/commit/951b186cf87184dd5346e4b8e47dd57e3713090b))
* add computeMembersToDistinguished utility ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([942c551](https://github.com/taverns-red/toast-stats/commit/942c55132d7c7400a318ab6d615df05ddd62278a))
* add deriveGoalContext and findClubsNeedingMembers helpers ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([44644fe](https://github.com/taverns-red/toast-stats/commit/44644febb7fa2912b1bd9593014c8ea20dcff1fa))
* add remote error reporting to ErrorBoundary ([#254](https://github.com/taverns-red/toast-stats/issues/254)) ([39a2a0c](https://github.com/taverns-red/toast-stats/commit/39a2a0c98f405fa9d9b9188c604d74948219e442))
* add useUrlState hook for URL-synced state ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([6a852f7](https://github.com/taverns-red/toast-stats/commit/6a852f702258b4d96f32d67ee11449c30e08786a))
* **frontend:** prioritize exact goal flags for members to distinguished logic ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([3b5f686](https://github.com/taverns-red/toast-stats/commit/3b5f6867d0e56001854a4bf4de5a8a5559bbb146))
* sync additional tables with URL params ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([a68c640](https://github.com/taverns-red/toast-stats/commit/a68c64070a289340ace0aca69a6a225b8f636a13))
* sync ClubsTable pagination with URL params ([#272](https://github.com/taverns-red/toast-stats/issues/272)) ([a6da02e](https://github.com/taverns-red/toast-stats/commit/a6da02e0fff08fc3c061b5dd936f65fe99e26864))
* **ui:** add 'close to distinguished' card ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([d4e08aa](https://github.com/taverns-red/toast-stats/commit/d4e08aa166303ca7d5f8ead7275283fec81a68d9))
* **ui:** add members needed column and retain pagination state ([#272](https://github.com/taverns-red/toast-stats/issues/272), [#273](https://github.com/taverns-red/toast-stats/issues/273)) ([7269e4d](https://github.com/taverns-red/toast-stats/commit/7269e4dde54b53d021251fcd3dd3ea0e10fa17e6))


### Bug Fixes

* compute payment YoY from time-series data ([#269](https://github.com/taverns-red/toast-stats/issues/269)) ([3e3975b](https://github.com/taverns-red/toast-stats/commit/3e3975b4b2d98c72c935f4e9fb4cade5cea68eec))
* **ui:** add membersNeeded to applyFilter switch statement ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([5c37ef4](https://github.com/taverns-red/toast-stats/commit/5c37ef4b0c1b949c93630e102565d42cd44c83da))
* use correct CDN field name 'May Visit award' for second-round visits ([#268](https://github.com/taverns-red/toast-stats/issues/268)) ([c6b9113](https://github.com/taverns-red/toast-stats/commit/c6b911383d3b205aca41502482dc64ef4a7a73f8))


### Refactors

* split LazyCharts into individual files to fix fast refresh warning ([#251](https://github.com/taverns-red/toast-stats/issues/251)) ([9a8139d](https://github.com/taverns-red/toast-stats/commit/9a8139d7a4e3ef40f135cad9456cfba9ce145530))


### Tests

* add integration test suite for critical user journeys ([#261](https://github.com/taverns-red/toast-stats/issues/261)) ([f5909df](https://github.com/taverns-red/toast-stats/commit/f5909dff46c7fad65680ead0836df4985a1fee47))
* align ClubsTable integration tests with Members Needed column layout ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([f0c44b8](https://github.com/taverns-red/toast-stats/commit/f0c44b86ac7f255bead974bca53e231e29faab43))

## [2.5.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.4.0...frontend-v2.5.0) (2026-03-29)


### Features

* add responsive X-axis tick density for mobile charts ([#237](https://github.com/taverns-red/toast-stats/issues/237)) ([821dded](https://github.com/taverns-red/toast-stats/commit/821dded09edb74c6e5324a3b04c78fbc67b80f9c))
* add tie-aware ranking for Top Growth and DCP lists ([#236](https://github.com/taverns-red/toast-stats/issues/236)) ([d5655f0](https://github.com/taverns-red/toast-stats/commit/d5655f0aa0c07f05ba8134868fd674fd40348f14))
* unify chart loading skeletons with animated bars ([#235](https://github.com/taverns-red/toast-stats/issues/235)) ([30c99c0](https://github.com/taverns-red/toast-stats/commit/30c99c02b66aab2abd78ca4929eaa60af41ac9fe))


### Bug Fixes

* add missing fetchCdnSnapshotIndex mock to LandingPage tests ([#233](https://github.com/taverns-red/toast-stats/issues/233)) ([c03f194](https://github.com/taverns-red/toast-stats/commit/c03f194e40e7478b03f2e5fa5d61a226532a9fb1))
* date count inconsistency between landing and district pages ([#233](https://github.com/taverns-red/toast-stats/issues/233)) ([e8b968d](https://github.com/taverns-red/toast-stats/commit/e8b968dae5ec235d2d5200f4a0f0f59807c02d9f))


### Tests

* add unit coverage for Sprint 15 UX utilities ([a5de16e](https://github.com/taverns-red/toast-stats/commit/a5de16e8925382f7288aed1327f8e9ecf09ebd08))
* fix useResponsiveChartTicks logic and add a11y DOM tests ([#18](https://github.com/taverns-red/toast-stats/issues/18)) ([ba9a668](https://github.com/taverns-red/toast-stats/commit/ba9a6688ac1157496fb849a1add777178548534a))

## [2.4.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.3.0...frontend-v2.4.0) (2026-03-28)


### Features

* multi-year trend comparison overlay on membership chart ([#238](https://github.com/taverns-red/toast-stats/issues/238)) ([29aa42f](https://github.com/taverns-red/toast-stats/commit/29aa42f333345c6040d3fdc64fe8bee86f95333e))
* per-club DCP goal progress card on club detail page ([#242](https://github.com/taverns-red/toast-stats/issues/242)) ([591f733](https://github.com/taverns-red/toast-stats/commit/591f733b47c716c1cae5ad71ded480767d803b00))
* persist tab & sort state in URL search params ([#230](https://github.com/taverns-red/toast-stats/issues/230)) ([f025c62](https://github.com/taverns-red/toast-stats/commit/f025c629bd14d95ff62adbfb177107b83cf76ba9))


### Bug Fixes

* club.membershipBase ?? membershipTrend[0].count ?? currentMembers ([d7109df](https://github.com/taverns-red/toast-stats/commit/d7109df4ec34912d779ec45854a9b14d9b75d7c0))
* ClubDCPGoalsCard not visible — data path and column names ([#242](https://github.com/taverns-red/toast-stats/issues/242)) ([e23e92d](https://github.com/taverns-red/toast-stats/commit/e23e92db62d8003f7f8cfe15c5eb49dbed2dbbd6))
* gap-to-tier now accounts for net growth alternative ([#239](https://github.com/taverns-red/toast-stats/issues/239)) ([af6b7a0](https://github.com/taverns-red/toast-stats/commit/af6b7a0f8510e877df2f88c48fd7009d960c018e))
* gap-to-tier uses membershipBase instead of trend[0] ([#241](https://github.com/taverns-red/toast-stats/issues/241)) ([d7109df](https://github.com/taverns-red/toast-stats/commit/d7109df4ec34912d779ec45854a9b14d9b75d7c0))
* HistoricalRankChart uses selected program year for label ([#232](https://github.com/taverns-red/toast-stats/issues/232)) ([9c8eb41](https://github.com/taverns-red/toast-stats/commit/9c8eb41268bcea4fe7731488b47b64ed9165abea))
* multi-year chart uses merged dataset for proper X-axis alignment ([#243](https://github.com/taverns-red/toast-stats/issues/243)) ([ed8fad3](https://github.com/taverns-red/toast-stats/commit/ed8fad32bce5680886447d3bf4722c7093448c09))
* multi-year payments chart uses timeSeries CDN data ([#243](https://github.com/taverns-red/toast-stats/issues/243)) ([c5909d9](https://github.com/taverns-red/toast-stats/commit/c5909d9da4938e220c2adf6ca45fb51be1ce4eca))
* replace membership projections with health-based distinguished outlook ([#231](https://github.com/taverns-red/toast-stats/issues/231)) ([8409fbd](https://github.com/taverns-red/toast-stats/commit/8409fbd75409113a895fb221578f8f429ee08015))


### Tests

* update DCP section test for renamed component ([#231](https://github.com/taverns-red/toast-stats/issues/231)) ([3cd715b](https://github.com/taverns-red/toast-stats/commit/3cd715baf362fe99f9c2c06b5ac61139e3032b38))

## [2.3.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.2.0...frontend-v2.3.0) (2026-03-27)


### Features

* performance & observability — Lighthouse CI, code-split Recharts, CDN monitoring, error telemetry ([#222](https://github.com/taverns-red/toast-stats/issues/222), [#223](https://github.com/taverns-red/toast-stats/issues/223), [#224](https://github.com/taverns-red/toast-stats/issues/224), [#225](https://github.com/taverns-red/toast-stats/issues/225)) ([1edc44a](https://github.com/taverns-red/toast-stats/commit/1edc44a28cd6dde583dbcbe790c92d4793694464))

## [2.2.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.1.0...frontend-v2.2.0) (2026-03-27)


### Features

* **frontend:** growth velocity card and division heatmap ([#219](https://github.com/taverns-red/toast-stats/issues/219), [#220](https://github.com/taverns-red/toast-stats/issues/220)) ([d812125](https://github.com/taverns-red/toast-stats/commit/d8121259fa7eb218f5be8899d7a1efaaf75a302c))

## [2.1.0](https://github.com/taverns-red/toast-stats/compare/frontend-v2.0.0...frontend-v2.1.0) (2026-03-26)


### Features

* accessibility & mobile responsiveness ([#216](https://github.com/taverns-red/toast-stats/issues/216), [#217](https://github.com/taverns-red/toast-stats/issues/217), [#218](https://github.com/taverns-red/toast-stats/issues/218)) ([9a63787](https://github.com/taverns-red/toast-stats/commit/9a63787939405240f2048d8ecc9f8c4f88502e62))
* accessibility & mobile responsiveness ([#216](https://github.com/taverns-red/toast-stats/issues/216), [#217](https://github.com/taverns-red/toast-stats/issues/217), [#218](https://github.com/taverns-red/toast-stats/issues/218)) ([7931882](https://github.com/taverns-red/toast-stats/commit/793188218581381f7d5355d51dc3b6675d9e05a6))
* add data freshness indicators ([#213](https://github.com/taverns-red/toast-stats/issues/213), [#214](https://github.com/taverns-red/toast-stats/issues/214), [#215](https://github.com/taverns-red/toast-stats/issues/215)) ([881b4e2](https://github.com/taverns-red/toast-stats/commit/881b4e2e6d4016acf8237cde6b9cf11e85ae4b4e))

## [2.0.0](https://github.com/taverns-red/toast-stats/compare/frontend-v1.0.0...frontend-v2.0.0) (2026-03-26)

### ⚠ BREAKING CHANGES

- Backend analytics endpoints removed:
  - DELETE analytics.ts (8 endpoints, 1722 lines)
  - DELETE analyticsSummary.ts (1 endpoint, 594 lines)
  - DELETE PreComputedAnalyticsReader.ts (1163 lines)
  - DELETE 6 test files (2543 lines)

### Features

- add CDN-first data layer — cdn.ts client, 4 hooks updated with Express fallback ([#168](https://github.com/taverns-red/toast-stats/issues/168)) ([2af7012](https://github.com/taverns-red/toast-stats/commit/2af7012ab392168c4850398805106c121e2ab462))
- add club detail subpage with routing ([#208](https://github.com/taverns-red/toast-stats/issues/208)) ([4829b4b](https://github.com/taverns-red/toast-stats/commit/4829b4b8c74e63879f53ab51a3acec1547c9edb6))
- add dark mode based on taverns-red colour scheme ([#120](https://github.com/taverns-red/toast-stats/issues/120)) ([1aa1a2c](https://github.com/taverns-red/toast-stats/commit/1aa1a2c8b5b0a8e9f5bfc45f29475109bb3c7bbc))
- add DCP Projections table to Analytics tab ([#6](https://github.com/taverns-red/toast-stats/issues/6)) ([79d2cb3](https://github.com/taverns-red/toast-stats/commit/79d2cb3cf23129f7d89f6459405965fd30db35ea))
- add DCP projections utility module ([#6](https://github.com/taverns-red/toast-stats/issues/6)) ([f23daa1](https://github.com/taverns-red/toast-stats/commit/f23daa18ff16862d397184911282bede7944db32))
- add district comparison mode with radar chart and pin/unpin ([#93](https://github.com/taverns-red/toast-stats/issues/93)) ([7bd039d](https://github.com/taverns-red/toast-stats/commit/7bd039d0b89e84bcfafffe9ace64b51a8defdae3))
- add district search bar to Global Rankings table ([#91](https://github.com/taverns-red/toast-stats/issues/91)) ([217f007](https://github.com/taverns-red/toast-stats/commit/217f0072938ea47494bc1728ade1bd540beecaae))
- add fields parameter to useDistrictStatistics and pass divisions for lazy loading ([f9577a0](https://github.com/taverns-red/toast-stats/commit/f9577a0356b276cd52b812ff096688271874e3c3))
- add membershipBase to ClubTrend for accurate base membership display ([#164](https://github.com/taverns-red/toast-stats/issues/164)) ([c2e9b30](https://github.com/taverns-red/toast-stats/commit/c2e9b30e8a6e0cfb043fb4860e2a60756edaf711))
- add redtaverns favicon ([6c82504](https://github.com/taverns-red/toast-stats/commit/6c825048200f63691f00e1e9909925b6f9ad4854))
- add site footer with attribution, source link, and disclaimer ([#88](https://github.com/taverns-red/toast-stats/issues/88)) ([a6699ed](https://github.com/taverns-red/toast-stats/commit/a6699edaf08d00f9961dca8d6a198883dc02e41c))
- add tooltip info icons to table column headers ([#92](https://github.com/taverns-red/toast-stats/issues/92)) ([9a31280](https://github.com/taverns-red/toast-stats/commit/9a31280fd15922cc72850af1b0d36d8ff4722bb8))
- add tracked-district analytics badge to rankings table ([1e13b98](https://github.com/taverns-red/toast-stats/commit/1e13b98a42c5e0719bf92d6bb275dde3e01038b3))
- **admin:** implement force-cancel stuck jobs with modal dialog ([344fbf2](https://github.com/taverns-red/toast-stats/commit/344fbf2c971b985542765f73d62da14e45e2d977))
- **admin:** implement singleton backfill service and snapshot inspection ([cec0114](https://github.com/taverns-red/toast-stats/commit/cec0114151a95a1c9db2b2923e9929b3826c1b3e))
- **analytics-core:** implement per-metric rankings calculation and integration ([f857447](https://github.com/taverns-red/toast-stats/commit/f857447b81b59cf6067274f75a807b9a2023fffa))
- **analytics:** add memberCountChange field to distinguish member count from payment metrics ([94ce7f5](https://github.com/taverns-red/toast-stats/commit/94ce7f5d0cf4da2f041e5a1ac9df3d425df071c1))
- **analytics:** add paymentsTrend data to district analytics response ([14105a2](https://github.com/taverns-red/toast-stats/commit/14105a2ee10850d4b3f2d843c3dfbee3ead9b7a2))
- **analytics:** fix payments trend data source and year-over-year comparison ([219178e](https://github.com/taverns-red/toast-stats/commit/219178eaf584472ebdb35009efd709dd7a7adfc6))
- **analytics:** fix trends tab data display across three system layers ([33bc5ff](https://github.com/taverns-red/toast-stats/commit/33bc5ffd6facf994bc69e03c2511af2b273046a9))
- **analytics:** implement analytics availability checker and integrate with snapshot operations ([9a22d3c](https://github.com/taverns-red/toast-stats/commit/9a22d3c4acbdbbd7ac53c2db9a8c5a65e5109bf1))
- **analytics:** implement district analytics performance infrastructure ([897fb38](https://github.com/taverns-red/toast-stats/commit/897fb38fc0cf219fe7092dd818d0f97c038f3b0c))
- **analytics:** implement district analytics performance optimization ([5e76117](https://github.com/taverns-red/toast-stats/commit/5e76117b0154ae976d71c3d3e4287c547c4a83ba))
- automatic semantic versioning with footer display ([#136](https://github.com/taverns-red/toast-stats/issues/136)) ([0fe9f50](https://github.com/taverns-red/toast-stats/commit/0fe9f50f9c2b7f759d7a89265d03de32eaf2ca04))
- **backend,frontend:** remove backfill system and consolidate to scraper-cli ([5b1ac34](https://github.com/taverns-red/toast-stats/commit/5b1ac34ea83076481f5baadc45f905cd72cc32ff))
- **backfill:** implement unified backfill service with job management ([2abd669](https://github.com/taverns-red/toast-stats/commit/2abd6694cee2bb37d4d949de26d03985f2c887cc))
- code-split DistrictDetailPage with React.lazy + Suspense ([#169](https://github.com/taverns-red/toast-stats/issues/169)) ([8ff5fbd](https://github.com/taverns-red/toast-stats/commit/8ff5fbdd60d9e5449fbe71cbecf8c3d7d9739b46))
- color-code Health, Growth, and DCP sub-scores in Leadership table ([#90](https://github.com/taverns-red/toast-stats/issues/90)) ([9757f84](https://github.com/taverns-red/toast-stats/commit/9757f84af2648d4d992b42223303f8533fa949c8))
- Configure Vitest coverage thresholds, add a pre-push test hook, and refine SnapshotStore cache invalidation. ([25fe8c5](https://github.com/taverns-red/toast-stats/commit/25fe8c5e120f892514de53acd06029d4349cfa47))
- convert 7 remaining hooks to CDN-only ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([c13dd07](https://github.com/taverns-red/toast-stats/commit/c13dd079645bcaf9af76ed235897c2eaba62986e))
- convert last 2 Express hooks to CDN, delete api.ts ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([fb280ea](https://github.com/taverns-red/toast-stats/commit/fb280ea9a5ec01a32029ab68a2d8538e96e886e4))
- convert rankings to CDN + add v1/rankings.json pipeline step ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([14f8138](https://github.com/taverns-red/toast-stats/commit/14f813897a2db198889b0e6014f9a999829ee88c))
- delete backend analytics routes, CDN-only frontend ([#168](https://github.com/taverns-red/toast-stats/issues/168)) ([b23183c](https://github.com/taverns-red/toast-stats/commit/b23183c29850533476595f76a25b656ba9d06dc3))
- enhance club detail card with stats grid, base membership, and DCP milestone bars ([#163](https://github.com/taverns-red/toast-stats/issues/163)) ([89226af](https://github.com/taverns-red/toast-stats/commit/89226af84bfd42a714bc216164fbd004010fbccc))
- enhance club detail graph with program year context ([#79](https://github.com/taverns-red/toast-stats/issues/79)) ([7d209a1](https://github.com/taverns-red/toast-stats/commit/7d209a16e278f58ca297d3e950cf5d26a8b0e4a4))
- **frontend:** add date range validation to prevent invalid analytics queries ([3a40bc0](https://github.com/taverns-red/toast-stats/commit/3a40bc0ba1284423af376afc21be9819606b3873))
- **frontend:** add shared contracts dependency and improve type safety ([9aa3dc9](https://github.com/taverns-red/toast-stats/commit/9aa3dc901832fef34c550595a7e90ee8883a14da))
- **frontend:** auto-select valid program year when current selection unavailable ([f32647b](https://github.com/taverns-red/toast-stats/commit/f32647be4c816e07d7fb53640756f50814365d47))
- **frontend:** enable multi-year payments trend display by removing data override ([10d423c](https://github.com/taverns-red/toast-stats/commit/10d423ce868b0ba8af1b17c525b1a656e216e5c0))
- **frontend:** handle distinguishedProjection object format in analytics fallback ([662e1e1](https://github.com/taverns-red/toast-stats/commit/662e1e1aae5608e4e843601b4e1d2f0a713d879b))
- **frontend:** hide analytics tab pending DCP goal analysis data availability ([7be8e4c](https://github.com/taverns-red/toast-stats/commit/7be8e4c87bcb63422f2aff40268284a30ba3bc92))
- **frontend:** remove division rankings and area performance chart components ([880b635](https://github.com/taverns-red/toast-stats/commit/880b635929044112c9d366c217bc030f2d142c5e))
- **frontend:** rewire trends tab to use aggregated analytics for historical data ([35d4f4c](https://github.com/taverns-red/toast-stats/commit/35d4f4c3b68c8ff1642401632213401da4d249be))
- improve Global Rankings UX with progressive loading ([5a78b06](https://github.com/taverns-red/toast-stats/commit/5a78b06d563d911f5d78db08633d4352091c2ad6))
- invert ranking chart Y-axis — Overall shows rank instead of Borda count ([#89](https://github.com/taverns-red/toast-stats/issues/89)) ([4105185](https://github.com/taverns-red/toast-stats/commit/4105185a6aec171610d29be8c9da1c6b8a14fa7b))
- make region selectors collapsible on mobile ([799e936](https://github.com/taverns-red/toast-stats/commit/799e936e8bd544b0cc54451bd9fd0124d32113c0))
- progressive loading — per-section skeletons for divisions, trends, analytics tabs ([#169](https://github.com/taverns-red/toast-stats/issues/169)) ([c3e20f0](https://github.com/taverns-red/toast-stats/commit/c3e20f083357f5b2139c02c739069e05b4951f42))
- re-enable Analytics tab on district detail page ([#78](https://github.com/taverns-red/toast-stats/issues/78)) ([e21582c](https://github.com/taverns-red/toast-stats/commit/e21582c51374328bb17a9a284622b15cf2343147))
- reorder Global Rankings tab — table above the fold ([#83](https://github.com/taverns-red/toast-stats/issues/83)) ([062b85d](https://github.com/taverns-red/toast-stats/commit/062b85d2d917f163c2cb99d76b847c4fa8baf8df)), closes [#82](https://github.com/taverns-red/toast-stats/issues/82)
- reorganize landing page — rankings table above the fold ([#83](https://github.com/taverns-red/toast-stats/issues/83)) ([f830bba](https://github.com/taverns-red/toast-stats/commit/f830bbaf41ba0feb8a5e109b52f0851c67b21cb7))
- serve time-series via CDN + useTimeSeries hook ([#170](https://github.com/taverns-red/toast-stats/issues/170)) ([73b2c07](https://github.com/taverns-red/toast-stats/commit/73b2c07232c67dfbd9afaf16d54b656faa18404d))
- **shared-contracts:** establish canonical ClubHealthStatus type and resolve value mismatch ([916be21](https://github.com/taverns-red/toast-stats/commit/916be217390afdad12825f427aab2d1f42b201a2))
- show Global Rankings tab for untracked districts instead of empty state ([d3b45aa](https://github.com/taverns-red/toast-stats/commit/d3b45aa7ab92279d4aff2965440ec2985d2ae868))
- switch API from Gateway to HTTPS LB at api.taverns.red ([#14](https://github.com/taverns-red/toast-stats/issues/14)) ([007fb81](https://github.com/taverns-red/toast-stats/commit/007fb81af27be8b9cbf4168e580e48d12d4c1f68))
- wire ClubDetailModal to use dense club trends from club-trends-index ([#79](https://github.com/taverns-red/toast-stats/issues/79)) ([9dee66b](https://github.com/taverns-red/toast-stats/commit/9dee66bb618ddf05a81a60ec5e1cc8111de062e0))
- wire useTimeSeries into DistrictDetailPage ([#170](https://github.com/taverns-red/toast-stats/issues/170)) ([c08da58](https://github.com/taverns-red/toast-stats/commit/c08da584bf8cc1bbe86ea5725376867e00aa7593))
- wire YoY comparison from CDN time-series data ([#170](https://github.com/taverns-red/toast-stats/issues/170)) ([f9d6ba7](https://github.com/taverns-red/toast-stats/commit/f9d6ba70824e3068b142adc613acf15f9f626d16))

### Bug Fixes

- add /api prefix to production API base URL ([75e3ad5](https://github.com/taverns-red/toast-stats/commit/75e3ad5d21357fd79f0d7037239137fa47d3c66d))
- add dark mode overrides for colored utility classes, form controls, and blockquotes ([#121](https://github.com/taverns-red/toast-stats/issues/121), [#122](https://github.com/taverns-red/toast-stats/issues/122)) ([e3c80c2](https://github.com/taverns-red/toast-stats/commit/e3c80c20d0246fb0991acb15a43da343b6b4f74a))
- add spacing between Program Year Progress label and percentage ([bd9bf54](https://github.com/taverns-red/toast-stats/commit/bd9bf5413c22b6cb24cf9cae1a926ad7086700d7))
- **admin:** handle missing snapshot IDs with fallback display ([66a2bd6](https://github.com/taverns-red/toast-stats/commit/66a2bd63d7d23518de4f28cbe36564a211af1519))
- club detail modal y-axis inversion when all values are equal ([#107](https://github.com/taverns-red/toast-stats/issues/107)) ([506aa9d](https://github.com/taverns-red/toast-stats/commit/506aa9d8fab3ef57fa91bc107c1d213f3d1b5335))
- club net change uses base vs current membership ([#194](https://github.com/taverns-red/toast-stats/issues/194)) ([21e07bc](https://github.com/taverns-red/toast-stats/commit/21e07bcc140d2db4689496546f77a7dcd3734160))
- convert manualChunks to function for Rolldown compatibility ([#175](https://github.com/taverns-red/toast-stats/issues/175)) ([fb533a3](https://github.com/taverns-red/toast-stats/commit/fb533a3d89cbd9ca98422460f60a279a0db038c6))
- correct membership badge value and scope DCP timeline ([#76](https://github.com/taverns-red/toast-stats/issues/76), [#79](https://github.com/taverns-red/toast-stats/issues/79)) ([8f2a7c7](https://github.com/taverns-red/toast-stats/commit/8f2a7c76cfd2b69eee66d44c901572e843207304))
- dark mode overrides for brand color tokens and gradient cards ([#121](https://github.com/taverns-red/toast-stats/issues/121), [#122](https://github.com/taverns-red/toast-stats/issues/122)) ([73174fd](https://github.com/taverns-red/toast-stats/commit/73174fd57e4fb139006c338f8dd7aa2b65c66715))
- dark mode overrides for brand opacity classes, amber, and insights ([#121](https://github.com/taverns-red/toast-stats/issues/121), [#122](https://github.com/taverns-red/toast-stats/issues/122)) ([1752348](https://github.com/taverns-red/toast-stats/commit/1752348083e6de72c52ce02f7c5e0f1830678056))
- date selector typo and region spacing ([#195](https://github.com/taverns-red/toast-stats/issues/195), [#196](https://github.com/taverns-red/toast-stats/issues/196)) ([8fb93a8](https://github.com/taverns-red/toast-stats/commit/8fb93a85e1624cefef43fb91a1eb227675b515cb))
- derive member count change from trend data instead of broken field ([#76](https://github.com/taverns-red/toast-stats/issues/76)) ([cfbaebd](https://github.com/taverns-red/toast-stats/commit/cfbaebde208971700dac402eb2a572afd76fc43b))
- district detail page — rankings, date selector, cleanup ([#183](https://github.com/taverns-red/toast-stats/issues/183)) ([271224b](https://github.com/taverns-red/toast-stats/commit/271224b114feff3dc3983f9b19a022f918a32d68))
- Division & Area tab empty — unwrap CDN snapshot data key ([#184](https://github.com/taverns-red/toast-stats/issues/184)) ([5b99953](https://github.com/taverns-red/toast-stats/commit/5b9995375a82c819c5b07e2ddb7ebcc26ce57ca1))
- filter club modal trend data by selected program year ([#119](https://github.com/taverns-red/toast-stats/issues/119)) ([42b6c7e](https://github.com/taverns-red/toast-stats/commit/42b6c7e3b068f83e1b374a14fc0ee3b6feab3a46))
- footer alignment — equal-width columns and right-align disclaimer ([#101](https://github.com/taverns-red/toast-stats/issues/101)) ([00aca13](https://github.com/taverns-red/toast-stats/commit/00aca130033b48e594df923c497e0339e5ecb73c))
- footer vertical alignment — inline-flex on links and consistent line-height ([#101](https://github.com/taverns-red/toast-stats/issues/101)) ([b2cdaf3](https://github.com/taverns-red/toast-stats/commit/b2cdaf3a10849a87b6aa7a2d2b5ad3bf9753e4a4))
- **frontend:** add defensive null checks for leadership insights data ([247e074](https://github.com/taverns-red/toast-stats/commit/247e0747c24dcfe15e7f9ff7288967de2d3c4a35))
- **frontend:** add fallback colors to chart components ([a23c024](https://github.com/taverns-red/toast-stats/commit/a23c024b87ad1f6e3c01ea9b2020707d7ad1d0bb))
- make spinner visible by combining all query loading states ([03dee2f](https://github.com/taverns-red/toast-stats/commit/03dee2fb9955550ace56518377f0f1255b264f03))
- make theme toggle icon visible on dark footer background ([#120](https://github.com/taverns-red/toast-stats/issues/120)) ([7e07e3c](https://github.com/taverns-red/toast-stats/commit/7e07e3ccf338fafa71a6b8dc25264892875a259f))
- member change badge uses payment base and pipeline uses --force-analytics ([#170](https://github.com/taverns-red/toast-stats/issues/170)) ([2af26d5](https://github.com/taverns-red/toast-stats/commit/2af26d5fe326b242e6d2dd74621b985ee9a4b603))
- mobile UX improvements for tab bar, table columns, and export button ([#85](https://github.com/taverns-red/toast-stats/issues/85), [#86](https://github.com/taverns-red/toast-stats/issues/86), [#87](https://github.com/taverns-red/toast-stats/issues/87)) ([0157450](https://github.com/taverns-red/toast-stats/commit/0157450cefb1c16a719d6d54e1b15b827c03ca2e))
- neutralize Borda count for tied categories and fix copy/date selector ([#197](https://github.com/taverns-red/toast-stats/issues/197), [#198](https://github.com/taverns-red/toast-stats/issues/198), [#180](https://github.com/taverns-red/toast-stats/issues/180)) ([b26e514](https://github.com/taverns-red/toast-stats/commit/b26e514515080ec0b9ffc8b0917247b13a57240f))
- paymentBase field name mismatch and empty topGrowthClubs ([#190](https://github.com/taverns-red/toast-stats/issues/190), [#185](https://github.com/taverns-red/toast-stats/issues/185)) ([652e865](https://github.com/taverns-red/toast-stats/commit/652e865b71bd57f82bbbc77fe02aa89319be0cb5))
- payments trend chart shows 0 — wire performanceTargets from CDN ([#183](https://github.com/taverns-red/toast-stats/issues/183)) ([a08f086](https://github.com/taverns-red/toast-stats/commit/a08f0864899cf3cb3eca1fbbf9c143e854bba0d7))
- prefix numeric district names with 'District' ([#188](https://github.com/taverns-red/toast-stats/issues/188)) ([a1deb0d](https://github.com/taverns-red/toast-stats/commit/a1deb0da0412e8afedaf7ff5adf1d7e6be2fdeba))
- remove [@theme](https://github.com/theme) spacing overrides that broke Tailwind v4 max-w-\* utilities ([c847858](https://github.com/taverns-red/toast-stats/commit/c8478583525f24715830c93388f18c1b06a9ca02))
- remove /api prefix from API URLs — Cloud Run routes at root ([#14](https://github.com/taverns-red/toast-stats/issues/14)) ([48bb7fc](https://github.com/taverns-red/toast-stats/commit/48bb7fcdf7262e680a6d314e4a5cdb18c0227847))
- remove redundant district name and date range from Overview ([#81](https://github.com/taverns-red/toast-stats/issues/81)) ([4ea755f](https://github.com/taverns-red/toast-stats/commit/4ea755f341ece30f2106800dabb2c277d6890917))
- remove stale Source Sans 3 [@font-face](https://github.com/font-face) URLs causing 404s ([29f2920](https://github.com/taverns-red/toast-stats/commit/29f29202b01c9905c9ed5bd6c54064f71dc375da))
- remove stale woff2 font preload URLs ([b818ee8](https://github.com/taverns-red/toast-stats/commit/b818ee8b220cc734e87c724d48ba13debcc4aa46))
- resolve eslint v10 lint errors in collector-cli ([#105](https://github.com/taverns-red/toast-stats/issues/105)) ([d170bef](https://github.com/taverns-red/toast-stats/commit/d170bef0b817d3433787b16b1ac353f6be0922f1))
- resolve word-per-line text wrapping in untracked district empty state ([8be8a56](https://github.com/taverns-red/toast-stats/commit/8be8a56172ac6d60578434ace2169ab781577b2e))
- restore API Gateway architecture with correct gateway name ([844d0c8](https://github.com/taverns-red/toast-stats/commit/844d0c803452cdb913723c2e1a7458419627417f))
- retain original rank when search filtering the rankings table ([#102](https://github.com/taverns-red/toast-stats/issues/102)) ([afceb93](https://github.com/taverns-red/toast-stats/commit/afceb933b3461aaea9932b2148f83c4879f21cb3))
- revert DCP progress panel to list-based timeline ([#166](https://github.com/taverns-red/toast-stats/issues/166)) ([eff6256](https://github.com/taverns-red/toast-stats/commit/eff62560a2f56cc15edd1fe7b4db3fca139e54e4))
- route API through Firebase Hosting rewrite instead of API Gateway ([86909d7](https://github.com/taverns-red/toast-stats/commit/86909d70d0eee88828403fa7b094ec4b1a090ce3))
- show correct overall rank in comparison panel ([#109](https://github.com/taverns-red/toast-stats/issues/109), [#110](https://github.com/taverns-red/toast-stats/issues/110)) ([d7178ff](https://github.com/taverns-red/toast-stats/commit/d7178ff6189bd61bc1a92451bf4987899a88cac1))
- show empty state immediately for districts without ranking data ([22f3ae8](https://github.com/taverns-red/toast-stats/commit/22f3ae80f0e706dd4d99bfa541e847a0be354404))
- show graceful error state for untracked districts ([d04d6df](https://github.com/taverns-red/toast-stats/commit/d04d6dfe08bb09690810c428f550a94f58fe9105))
- snapshot-index always writes nested format, frontend normalizes on read ([#182](https://github.com/taverns-red/toast-stats/issues/182)) ([b2a7b93](https://github.com/taverns-red/toast-stats/commit/b2a7b93642beff045a726c2a0bdd332083760556))
- update integration and accessibility tests for removed ProgramYearSelector ([89d44df](https://github.com/taverns-red/toast-stats/commit/89d44df7b06cec76d6dbfd0f5653206c588480b6))
- update test mocks for CDN-only analytics ([#168](https://github.com/taverns-red/toast-stats/issues/168)) ([a53463d](https://github.com/taverns-red/toast-stats/commit/a53463d53a93f902752c2335228e31c53e299a95))
- use correct API (toast-stats) and gateway (toast-stats-gw) ([8f18cd8](https://github.com/taverns-red/toast-stats/commit/8f18cd848537de4ea7fb1b783ee87ed0ca1d9219))
- use standard Tailwind classes for analytics badge visibility ([7910599](https://github.com/taverns-red/toast-stats/commit/79105991a90a59a369d0dc8d744e5037f167398a))
- **validation:** remove inappropriate data freshness checks for historical snapshots ([de2317e](https://github.com/taverns-red/toast-stats/commit/de2317e300aab18d40556259b476bee0ff29af59))
- wrap ClubDetailModal tests with QueryClientProvider ([#79](https://github.com/taverns-red/toast-stats/issues/79)) ([74fd60b](https://github.com/taverns-red/toast-stats/commit/74fd60b5907fa9f4c765c2302c4b60ef0f27342b))

### Refactors

- **admin:** remove authentication and improve dialog responsiveness ([2766fb5](https://github.com/taverns-red/toast-stats/commit/2766fb5175c4202e534e88521f88287f95a7d66b))
- convert dates queries to CDN fetchCdnDates ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([7a1c433](https://github.com/taverns-red/toast-stats/commit/7a1c43302bd7918b8f75ee41292bf1c51adcfe6f))
- convert useAggregatedAnalytics and useVulnerableClubs to CDN-only ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([b54e40d](https://github.com/taverns-red/toast-stats/commit/b54e40dd28bbb7fa4e293888ee684ad51bfff6e1))
- extract types and helpers from oversized frontend hooks ([329b5e6](https://github.com/taverns-red/toast-stats/commit/329b5e667ac39d84a78555883d4596af36ed7395))
- **frontend:** remove fallback data warning from district detail page ([c64e78d](https://github.com/taverns-red/toast-stats/commit/c64e78d5ae57dc4b0e1310419aa4122ced07231a))
- merge duplicate club detail modals into shared component ([#80](https://github.com/taverns-red/toast-stats/issues/80)) ([cbdf25e](https://github.com/taverns-red/toast-stats/commit/cbdf25e5e7ea3ab8638b069af5f66fc5b76edfff))
- migrate frontend types to shared-contracts — DistrictRanking, ProgramYearWithData, AvailableRankingYearsResponse ([#130](https://github.com/taverns-red/toast-stats/issues/130)) ([8572f0f](https://github.com/taverns-red/toast-stats/commit/8572f0f1ca76ff3a5ef172c509f3075e83a695bd))
- migrate property-based tests to standard unit tests across … ([f6b46fb](https://github.com/taverns-red/toast-stats/commit/f6b46fb318e10744921cb6c2a8862c84d66d61d9))
- migrate property-based tests to standard unit tests across various modules. ([48642ef](https://github.com/taverns-red/toast-stats/commit/48642ef44658a93e3b1723ac4e2e7d6f7324e6b3))
- remove DCPProjectionsTable from Analytics tab ([#187](https://github.com/taverns-red/toast-stats/issues/187)) ([61ed46a](https://github.com/taverns-red/toast-stats/commit/61ed46a3c89b35d1c5d9e419c80f2931eec5c180))
- remove dead-weight admin system ([4dca7bb](https://github.com/taverns-red/toast-stats/commit/4dca7bbf02d05ac6840993da161738ea066c294d))
- Remove meta-level property tests for test utilities and upd… ([51fe303](https://github.com/taverns-red/toast-stats/commit/51fe303e15a6a8fc6e129de42c0304693a651ed6))
- Remove meta-level property tests for test utilities and update various existing property tests. ([36a44c1](https://github.com/taverns-red/toast-stats/commit/36a44c13ebc57e7f9629f396393c533cf1534358))
- remove stale Express API references ([#173](https://github.com/taverns-red/toast-stats/issues/173)) ([071fa67](https://github.com/taverns-red/toast-stats/commit/071fa676d2d7898834bde63677a18d1df222b166))
- rename scraper-cli to collector-cli across the codebase ([#99](https://github.com/taverns-red/toast-stats/issues/99)) ([eac9a3b](https://github.com/taverns-red/toast-stats/commit/eac9a3ba3d1b857e0c53efeef953584b73edae66))
- Restructure analytics types into domain-specific files and extract frontend hook logic into reusable utilities. ([2ae8d96](https://github.com/taverns-red/toast-stats/commit/2ae8d961708e4bb81d93bbf41e70c432f2ea9448))
- split designTokens.ts into domain-specific modules ([#134](https://github.com/taverns-red/toast-stats/issues/134)) ([d56746e](https://github.com/taverns-red/toast-stats/commit/d56746e47c022d1216fe8712e616fd64aed56c09))

### Performance

- optimize global rankings tab load time ([#115](https://github.com/taverns-red/toast-stats/issues/115)) ([5f2edf9](https://github.com/taverns-red/toast-stats/commit/5f2edf987a8b159e924210fe2600604b12996976))
- replace listSnapshots with listSnapshotIds + add batch rank-history endpoint ([2411b1d](https://github.com/taverns-red/toast-stats/commit/2411b1d8feb32746fec47d6aaf2f9d3359d43fbf))

### Documentation

- **api:** establish API documentation steering standards and update specs ([bd3e08b](https://github.com/taverns-red/toast-stats/commit/bd3e08bbd789e6aec2cc5fcb0e7852ec03994dfc))
- **specs:** add projected year-end simplification specification ([35840a7](https://github.com/taverns-red/toast-stats/commit/35840a7b94ded9644b66dfdaa216436fc5329013))

### Tests

- add CDN module mock to useAggregatedAnalytics tests ([#168](https://github.com/taverns-red/toast-stats/issues/168)) ([3978abc](https://github.com/taverns-red/toast-stats/commit/3978abc9696a0f12ac63475e0cc8748618a24fd2))
- add failing tests for ComparisonPanel and LandingPage comparison mode ([#93](https://github.com/taverns-red/toast-stats/issues/93)) ([da57250](https://github.com/taverns-red/toast-stats/commit/da572508ead791aed070180f96ec6f3b2cad44dd))
- fix useGlobalRankings tests for batch rank-history endpoint ([5435db7](https://github.com/taverns-red/toast-stats/commit/5435db7c8bd1d7c4efa873caaf0ecbd02220d0df))
- mock useDistricts in LandingPage tests to fix mock sequence ([f8a02fc](https://github.com/taverns-red/toast-stats/commit/f8a02fcdbb5312d15054f334f677268b122b268f))
