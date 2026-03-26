# Changelog

## [1.1.0](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.0.0...collector-cli-v1.1.0) (2026-03-26)


### Features

* add BackfillOrchestrator and backfill CLI command ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([896eb39](https://github.com/taverns-red/toast-stats/commit/896eb3942a8a47b4d0417a88f482a13a77534222))
* add ClosingDateRegistry for auto-maintaining closing dates ([#203](https://github.com/taverns-red/toast-stats/issues/203)) ([37ecc8c](https://github.com/taverns-red/toast-stats/commit/37ecc8c88f9a03810cdc2ef21ab58849ee0bbd2a))
* add collector-cli rebuild and prune commands ([#181](https://github.com/taverns-red/toast-stats/issues/181)) ([8a8a2ac](https://github.com/taverns-red/toast-stats/commit/8a8a2ac08a578b8d3c3e2f6f53c3fdae07b1eff2))
* add GCS direct upload support to backfill command ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([6d2bd52](https://github.com/taverns-red/toast-stats/commit/6d2bd527b43abd6794f968fc6c7dbd20c9e9ed9e))
* add HttpCsvDownloader with direct CSV URL construction ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([64095e2](https://github.com/taverns-red/toast-stats/commit/64095e21496c4b64d3574437e2dd100e6f24b415))
* add membershipBase to ClubTrend for accurate base membership display ([#164](https://github.com/taverns-red/toast-stats/issues/164)) ([c2e9b30](https://github.com/taverns-red/toast-stats/commit/c2e9b30e8a6e0cfb043fb4860e2a60756edaf711))
* add rank-history generation to rebuild command ([#181](https://github.com/taverns-red/toast-stats/issues/181)) ([53fdde8](https://github.com/taverns-red/toast-stats/commit/53fdde86aa3d8ee7aa194ab63799498ab5b06d24))
* auto-discover districts from Toastmasters CSV in data pipeline ([#141](https://github.com/taverns-red/toast-stats/issues/141)) ([da79820](https://github.com/taverns-red/toast-stats/commit/da798208f2701ba114efd9c417989202d9c1c0f5))
* backfill writes metadata.json per date for transform compatibility ([#125](https://github.com/taverns-red/toast-stats/issues/125)) ([428205f](https://github.com/taverns-red/toast-stats/commit/428205fbe3a3e8482651b86934196e0fc762d300))
* detect and skip corrupt CSVs during transform ([#199](https://github.com/taverns-red/toast-stats/issues/199)) ([f7cfb36](https://github.com/taverns-red/toast-stats/commit/f7cfb3698d22126f72ec3a2e4cb6b0b98c085dd6))
* incremental ClubTrendsStore replaces all-snapshot loading for dense club trends ([#144](https://github.com/taverns-red/toast-stats/issues/144)) ([6933ffa](https://github.com/taverns-red/toast-stats/commit/6933ffae26aae8940e8a616ab4dc80894da6f07a))
* retain penultimate dates during prune ([#203](https://github.com/taverns-red/toast-stats/issues/203)) ([3756951](https://github.com/taverns-red/toast-stats/commit/3756951a556152725f75471b231d93f3711d8232))


### Bug Fixes

* add monthEndDate to export URL for month-specific CSV data ([#204](https://github.com/taverns-red/toast-stats/issues/204)) ([87e2d0f](https://github.com/taverns-red/toast-stats/commit/87e2d0fc4d595ab70160608beb1e8d9883978143))
* add node: prefix to Node built-in imports in collector-cli ([#104](https://github.com/taverns-red/toast-stats/issues/104)) ([0c686f8](https://github.com/taverns-red/toast-stats/commit/0c686f8b0d797026ab783c3d4e2fe78858498ddf))
* apply Borda tie-neutralization to TransformService rankings ([#198](https://github.com/taverns-red/toast-stats/issues/198)) ([bd2b47f](https://github.com/taverns-red/toast-stats/commit/bd2b47f010e6cf4774fd7f702a7dfec5e3bbcb87))
* auto-invoke CLI when run via npx tsx ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([3762152](https://github.com/taverns-red/toast-stats/commit/3762152cca9e4e75265e5e33335f5deb70abd6dd))
* backfill CLI stores CSVs in transform-compatible format ([#125](https://github.com/taverns-red/toast-stats/issues/125)) ([4b8fc2a](https://github.com/taverns-red/toast-stats/commit/4b8fc2aa1b69fd6fa92b14ceafe93b660885bb45))
* backfill outputDir should use cacheDir root, not /backfill subdir ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([c851799](https://github.com/taverns-red/toast-stats/commit/c851799162ffd393451b83e6c4815cc39df02713))
* filter 'As of' date rows from district ID parsing ([#145](https://github.com/taverns-red/toast-stats/issues/145)) ([6be4166](https://github.com/taverns-red/toast-stats/commit/6be4166c8ee1adbbaef00692b4b1e172d1c09eff))
* load all program-year snapshots in computeDistrictAnalytics for dense club trends ([#108](https://github.com/taverns-red/toast-stats/issues/108), [#113](https://github.com/taverns-red/toast-stats/issues/113)) ([2716f86](https://github.com/taverns-red/toast-stats/commit/2716f86d9205e53798266dbe4ea9bd65fb08eee0))
* patch paymentsTrend with accumulated time-series data ([#206](https://github.com/taverns-red/toast-stats/issues/206)) ([17b1b89](https://github.com/taverns-red/toast-stats/commit/17b1b89b9e445280222a4397eab9285fa7efac40))
* resolve eslint v10 lint errors in collector-cli ([#105](https://github.com/taverns-red/toast-stats/issues/105)) ([d170bef](https://github.com/taverns-red/toast-stats/commit/d170bef0b817d3433787b16b1ac353f6be0922f1))
* revert monthEndDate from daily pipeline — breaks current-month data ([#204](https://github.com/taverns-red/toast-stats/issues/204)) ([5128917](https://github.com/taverns-red/toast-stats/commit/5128917c15f04ab85b5f45cbb00d87e8e08354f6))
* switch GCS bucket to toast-stats-data-ca ([#162](https://github.com/taverns-red/toast-stats/issues/162)) ([0968315](https://github.com/taverns-red/toast-stats/commit/0968315eb4b28d2afca60a43b5136e824f757fc6))
* Validate district IDs when collecting directories and log invalid entries. ([c0c2030](https://github.com/taverns-red/toast-stats/commit/c0c2030703991528e9a800b6fbfb18f34f584e39))


### Refactors

* extract shared CachePaths module from BackfillOrchestrator and OrchestratorCacheAdapter ([#126](https://github.com/taverns-red/toast-stats/issues/126)) ([28fda10](https://github.com/taverns-red/toast-stats/commit/28fda102f9f66db910631b53f47c03ee2eea74f3))
* rename scraper-cli to collector-cli across the codebase ([#99](https://github.com/taverns-red/toast-stats/issues/99)) ([eac9a3b](https://github.com/taverns-red/toast-stats/commit/eac9a3ba3d1b857e0c53efeef953584b73edae66))


### Performance

* add GCS cache warm-up for efficient resume ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([0d9d06e](https://github.com/taverns-red/toast-stats/commit/0d9d06e763b59fef1f8127b6d9805ddddd3f8c75))
* migrate daily pipeline from Playwright to HTTP CSV downloads ([#124](https://github.com/taverns-red/toast-stats/issues/124)) ([004bdd4](https://github.com/taverns-red/toast-stats/commit/004bdd4452354420a92f810591f9a6f7d8c6c2e9))
