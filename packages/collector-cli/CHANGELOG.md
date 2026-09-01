# Changelog

## [1.8.0](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.7.1...collector-cli-v1.8.0) (2026-09-01)


### Features

* **analytics:** parse the Susp branch of Charter Date/Suspend Date — per-district suspendedClubs ([#1497](https://github.com/taverns-red/toast-stats/issues/1497)) ([#1504](https://github.com/taverns-red/toast-stats/issues/1504)) ([39d7016](https://github.com/taverns-red/toast-stats/commit/39d7016ccf1234e506b632e977f93c0f9ed16ed9))
* **pipeline:** snapshots/{date}/global-totals.json — the per-date worldwide rollup ([#1498](https://github.com/taverns-red/toast-stats/issues/1498)) ([#1509](https://github.com/taverns-red/toast-stats/issues/1509)) ([b7fdeb3](https://github.com/taverns-red/toast-stats/commit/b7fdeb3ab99a406a6a7e37687d1eb2a829712941))

## [1.7.1](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.7.0...collector-cli-v1.7.1) (2026-08-31)


### Bug Fixes

* **pipeline:** a snapshot directory holds only the districts that existed on its own date ([#1465](https://github.com/taverns-red/toast-stats/issues/1465)) ([#1480](https://github.com/taverns-red/toast-stats/issues/1480)) ([fcb05aa](https://github.com/taverns-red/toast-stats/commit/fcb05aa39165ef22a27de8997439a47e8cb2b75d))

## [1.7.0](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.6.1...collector-cli-v1.7.0) (2026-08-23)


### Features

* **pipeline:** fetch district daily reports in a parallel job, and fix the district_*.json collision ([#1428](https://github.com/taverns-red/toast-stats/issues/1428)) ([#1434](https://github.com/taverns-red/toast-stats/issues/1434)) ([c86c866](https://github.com/taverns-red/toast-stats/commit/c86c8661c765c2fbb98861d836a49b50e76d7a21))


### Bug Fixes

* **analytics:** DCP goals 2-3 read 0 for PY 2026-27 — resolve TI's 'or EOM' column rename ([#1399](https://github.com/taverns-red/toast-stats/issues/1399)) ([#1402](https://github.com/taverns-red/toast-stats/issues/1402)) ([f7ac01e](https://github.com/taverns-red/toast-stats/commit/f7ac01eeb0bfe7e18d34bce9363206294daaea8a))
* **analytics:** resolve club recognition tiers per program year — Smedley is unreachable before PY 2025-26 ([#1406](https://github.com/taverns-red/toast-stats/issues/1406)) ([#1409](https://github.com/taverns-red/toast-stats/issues/1409)) ([d77c9db](https://github.com/taverns-red/toast-stats/commit/d77c9dbdf0f9a2e357313b1a5b63896d0197b6cb))
* **collector:** --gcs-prefix '' wrote to a double-slash key space; normalise it, log the destination, and read back what was written ([#1388](https://github.com/taverns-red/toast-stats/issues/1388)) ([#1391](https://github.com/taverns-red/toast-stats/issues/1391)) ([1a7007f](https://github.com/taverns-red/toast-stats/commit/1a7007f6a3eac57799b6220c2628c05500a2b7c2))
* **collector:** reach the live program year from backfill, and verify every body against its request ([#1384](https://github.com/taverns-red/toast-stats/issues/1384)) ([#1385](https://github.com/taverns-red/toast-stats/issues/1385)) ([12c7cde](https://github.com/taverns-red/toast-stats/commit/12c7cde838dff8f3afcce13f8dfaecd3525df98a))
* one canonical club id across the eight identity sites ([#1440](https://github.com/taverns-red/toast-stats/issues/1440)) ([#1447](https://github.com/taverns-red/toast-stats/issues/1447)) ([2577eaa](https://github.com/taverns-red/toast-stats/commit/2577eaac146fc04d49d6002ebaa91c141d844721))

## [1.6.1](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.6.0...collector-cli-v1.6.1) (2026-07-31)


### Bug Fixes

* **collector:** fetch the live program year from the root export path ([#1342](https://github.com/taverns-red/toast-stats/issues/1342)) ([#1345](https://github.com/taverns-red/toast-stats/issues/1345)) ([58c947c](https://github.com/taverns-red/toast-stats/commit/58c947c25a870f1f8118ad628cd0343f083aac15))
* **pipeline:** record June 2026's closing date ([#1348](https://github.com/taverns-red/toast-stats/issues/1348)) + surface rollover reasons and alert ([#1343](https://github.com/taverns-red/toast-stats/issues/1343)) ([#1352](https://github.com/taverns-red/toast-stats/issues/1352)) ([0f0b2c2](https://github.com/taverns-red/toast-stats/commit/0f0b2c2d2077df3707e7782a5e8de44ddc512ce1))

## [1.6.0](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.5.2...collector-cli-v1.6.0) (2026-07-03)


### Features

* **pipeline:** prune keeps first-of-month + month-end, retires penultimate ([#1280](https://github.com/taverns-red/toast-stats/issues/1280)) ([#1283](https://github.com/taverns-red/toast-stats/issues/1283)) ([53e24df](https://github.com/taverns-red/toast-stats/commit/53e24dff57e0b632323a1a4790ffca713d8f59c5))


### Bug Fixes

* July program-year rollover — resolve active PY by data + de-couple tests from the clock ([#1284](https://github.com/taverns-red/toast-stats/issues/1284), [#1285](https://github.com/taverns-red/toast-stats/issues/1285)) ([#1286](https://github.com/taverns-red/toast-stats/issues/1286)) ([982f045](https://github.com/taverns-red/toast-stats/commit/982f0450d41c5577c315c1c7a6c61881a96ba5a1))
* **promote-gate:** allow base moves during closing ([#1289](https://github.com/taverns-red/toast-stats/issues/1289)) ([#1290](https://github.com/taverns-red/toast-stats/issues/1290)) ([0ec69d0](https://github.com/taverns-red/toast-stats/commit/0ec69d0a1f9c8714c58e5b7105024e8070a980f6))
* **promote-gate:** allow counter moves freely during closing ([#1292](https://github.com/taverns-red/toast-stats/issues/1292)) ([#1293](https://github.com/taverns-red/toast-stats/issues/1293)) ([08938c7](https://github.com/taverns-red/toast-stats/commit/08938c7cb5e83e0861b48fe0eccb19a639af2f70))


### Refactors

* rename @toastmasters/{analytics-core,shared-contracts,collector-cli} → @taverns-red/* ([#1258](https://github.com/taverns-red/toast-stats/issues/1258)) ([#1259](https://github.com/taverns-red/toast-stats/issues/1259)) ([5e33f2d](https://github.com/taverns-red/toast-stats/commit/5e33f2d7546e72eef1146b8ae84bf8a6df4903d9))

## [1.5.2](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.5.1...collector-cli-v1.5.2) (2026-06-14)


### Bug Fixes

* **collector-cli:** flush stdout before exit so piped JSON isn't truncated ([#1182](https://github.com/taverns-red/toast-stats/issues/1182)) ([#1212](https://github.com/taverns-red/toast-stats/issues/1212)) ([e2ad2d0](https://github.com/taverns-red/toast-stats/commit/e2ad2d04289e8b2d26eb08bd90ed83a9060cc81f))
* **collector:** backfill omits isClosingPeriod + structural registry-injection guard ([#1160](https://github.com/taverns-red/toast-stats/issues/1160)) ([#1211](https://github.com/taverns-red/toast-stats/issues/1211)) ([eac731e](https://github.com/taverns-red/toast-stats/commit/eac731e7bc90f4631be98ef6ec238c978799369a))
* **pipeline:** rescrape clobbers district-awards-history.json (R2) + validateDistrictId gaps ([#1111](https://github.com/taverns-red/toast-stats/issues/1111)) ([#1210](https://github.com/taverns-red/toast-stats/issues/1210)) ([4295728](https://github.com/taverns-red/toast-stats/commit/42957288c0ec6570cda2bcd58660bae4bee9f0e8))

## [1.5.1](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.5.0...collector-cli-v1.5.1) (2026-06-12)


### Bug Fixes

* **rankings:** per-program-year DD rules — Unknown for unknowable prerequisites, no Smedley pre-2025-26 ([#1116](https://github.com/taverns-red/toast-stats/issues/1116)) ([#1166](https://github.com/taverns-red/toast-stats/issues/1166)) ([b3052d8](https://github.com/taverns-red/toast-stats/commit/b3052d815548022ce6601bc353cfdeb0a1308434))

## [1.5.0](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.4.1...collector-cli-v1.5.0) (2026-06-01)


### Features

* **pipeline:** value-aware promote gate for full-range re-derive ([#1034](https://github.com/taverns-red/toast-stats/issues/1034)) ([#1047](https://github.com/taverns-red/toast-stats/issues/1047)) ([ec6b91e](https://github.com/taverns-red/toast-stats/commit/ec6b91ee32833c1e81e88119ee29959c7ce0a96a))

## [1.4.1](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.4.0...collector-cli-v1.4.1) (2026-05-26)


### Bug Fixes

* **security:** override uuid to ^11.1.1 to clear CVE-2026-41907 ([#755](https://github.com/taverns-red/toast-stats/issues/755)) ([#770](https://github.com/taverns-red/toast-stats/issues/770)) ([4b9600a](https://github.com/taverns-red/toast-stats/commit/4b9600ab030637ce14853e9c57104d3b1a508098))


### Refactors

* **rankings:** consolidate duplicated Borda logic into analytics-core shared helpers ([#306](https://github.com/taverns-red/toast-stats/issues/306)) ([#759](https://github.com/taverns-red/toast-stats/issues/759)) ([244e649](https://github.com/taverns-red/toast-stats/commit/244e649f3aae2e34cef02c6895a50bdd1b2d3951))


### Documentation

* **fac:** resolve [#490](https://github.com/taverns-red/toast-stats/issues/490) — snapshot-only clubs are a registry-visibility signal ([#763](https://github.com/taverns-red/toast-stats/issues/763)) ([b22cf20](https://github.com/taverns-red/toast-stats/commit/b22cf20ea315f5e6fee9592f08de7608c317c116))

## [1.4.0](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.3.1...collector-cli-v1.4.0) (2026-05-23)


### Features

* **collector:** fetch-find-a-club CLI command ([#430](https://github.com/taverns-red/toast-stats/issues/430)) ([#484](https://github.com/taverns-red/toast-stats/issues/484)) ([3d1e7bc](https://github.com/taverns-red/toast-stats/commit/3d1e7bcc0c9d3a7a34ca474055440ae1a32c7832))
* **collector:** FindAClubMerger + pipeline wiring ([#429](https://github.com/taverns-red/toast-stats/issues/429)) ([#491](https://github.com/taverns-red/toast-stats/issues/491)) ([366dad3](https://github.com/taverns-red/toast-stats/commit/366dad31d9934af5bbdd84f6453bebef97b7563b))
* **district-clubs:** [#489](https://github.com/taverns-red/toast-stats/issues/489) surface FAC-only clubs (ATOs / prospective) ([#594](https://github.com/taverns-red/toast-stats/issues/594)) ([d076fba](https://github.com/taverns-red/toast-stats/commit/d076fba705466ce3dd4765eecd32c8e2cd209a51))
* **pipeline:** wire fetch-find-a-club into daily-pipeline.yml ([#429](https://github.com/taverns-red/toast-stats/issues/429)) ([#485](https://github.com/taverns-red/toast-stats/issues/485)) ([f6e32a5](https://github.com/taverns-red/toast-stats/commit/f6e32a52644f1cee13c28d528edd041941bb76c8))


### Bug Fixes

* **collector-cli:** %Distinguished uses Paid Club Base ([#545](https://github.com/taverns-red/toast-stats/issues/545)) ([#548](https://github.com/taverns-red/toast-stats/issues/548)) ([861d80b](https://github.com/taverns-red/toast-stats/commit/861d80b2712d953dfb35782b14dfb1b967517c61))
* **fac:** propagate FAC enrichment through ClubTrend so CHARTERED actually renders ([#503](https://github.com/taverns-red/toast-stats/issues/503)) ([#504](https://github.com/taverns-red/toast-stats/issues/504)) ([3c4a96c](https://github.com/taverns-red/toast-stats/commit/3c4a96c56795cdd97b5b293d559225669bd478cc))


### Refactors

* dedupe calculateDistinguishedPercent — shared helper in analytics-core ([#547](https://github.com/taverns-red/toast-stats/issues/547)) ([#585](https://github.com/taverns-red/toast-stats/issues/585)) ([2bf0415](https://github.com/taverns-red/toast-stats/commit/2bf0415ddd0fb08efcca21186e0236a9f28e54b6))

## [1.3.1](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.3.0...collector-cli-v1.3.1) (2026-05-10)


### Bug Fixes

* actually count new charters from district-performance.csv ([#336](https://github.com/taverns-red/toast-stats/issues/336)) ([#343](https://github.com/taverns-red/toast-stats/issues/343)) ([c6fc153](https://github.com/taverns-red/toast-stats/commit/c6fc153c08e6d5804b17d9c49e5090f3fd3ae4dd))

## [1.3.0](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.2.1...collector-cli-v1.3.0) (2026-04-22)


### Features

* Distinguished District tier tracking + trophy case ([#332](https://github.com/taverns-red/toast-stats/issues/332)) ([1e12e5c](https://github.com/taverns-red/toast-stats/commit/1e12e5cd696c9303dae58c5a17e61b89394e9b59))
* implement CompetitiveAwardsCalculator + pipeline integration ([#330](https://github.com/taverns-red/toast-stats/issues/330)) ([b81a1eb](https://github.com/taverns-red/toast-stats/commit/b81a1ebb7f4efaa49f8f7e2ae526640af45349c6))
* implement DistrictAwardsHistoryStore (GCS-backed R9 pattern) ([#333](https://github.com/taverns-red/toast-stats/issues/333)) ([e1c2697](https://github.com/taverns-red/toast-stats/commit/e1c269794bff81bc012272c07304013a2ef751fe))
* parse payment breakdown columns from All Districts CSV ([#327](https://github.com/taverns-red/toast-stats/issues/327)) ([df695cf](https://github.com/taverns-red/toast-stats/commit/df695cfdf489026629dd5292ccfe8bb7c8f7f5c3))
* parse prerequisite + Smedley columns from All Districts CSV ([#329](https://github.com/taverns-red/toast-stats/issues/329)) ([13589d2](https://github.com/taverns-red/toast-stats/commit/13589d226ae5668da9ace1b3a55cf058f7680faa))
* PaymentCompositionCard on District Detail Overview ([#327](https://github.com/taverns-red/toast-stats/issues/327)) ([25c0fcc](https://github.com/taverns-red/toast-stats/commit/25c0fcc28f36be41dec28bd0cbaa810f93cf8871))
* wire threshold + officer awards into pipeline ([#333](https://github.com/taverns-red/toast-stats/issues/333)) ([fed8273](https://github.com/taverns-red/toast-stats/commit/fed82733ca407fa053f066471cb15e27aa898a32))


### Bug Fixes

* exclude new charters from District Club Retention Award ([#336](https://github.com/taverns-red/toast-stats/issues/336)) ([#337](https://github.com/taverns-red/toast-stats/issues/337)) ([239a31a](https://github.com/taverns-red/toast-stats/commit/239a31acbb424483ea546c76c85f129d6e6b5707))


### Tests

* add failing tests for CompetitiveAwardsCalculator ([#330](https://github.com/taverns-red/toast-stats/issues/330)) ([33e5ae7](https://github.com/taverns-red/toast-stats/commit/33e5ae743458169a6177429698af20748afd1ab2))
* add failing tests for prerequisite + Smedley CSV columns ([#329](https://github.com/taverns-red/toast-stats/issues/329)) ([291fde8](https://github.com/taverns-red/toast-stats/commit/291fde88e88863e578877539e88fbb49dec3a76d))

## [1.2.1](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.2.0...collector-cli-v1.2.1) (2026-04-07)


### Bug Fixes

* daily pipeline upload uses snapshot date for closing periods ([#309](https://github.com/taverns-red/toast-stats/issues/309)) ([4872467](https://github.com/taverns-red/toast-stats/commit/48724676b28d1872df243ac9266f23a779c260a4))

## [1.2.0](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.1.2...collector-cli-v1.2.0) (2026-04-06)


### Features

* transform derives closing period from CSV footer when metadata missing ([#292](https://github.com/taverns-red/toast-stats/issues/292), [#293](https://github.com/taverns-red/toast-stats/issues/293)) ([04e8161](https://github.com/taverns-red/toast-stats/commit/04e8161af4daaff03d40224791a4c4b590c5b08c))


### Bug Fixes

* add abbreviated month names to closing period parser ([#286](https://github.com/taverns-red/toast-stats/issues/286)) ([ee3ee87](https://github.com/taverns-red/toast-stats/commit/ee3ee87ce0ae95e05638412aec7a87df18e67bd9))
* add closing period debug logging + fallback to initial parse ([#309](https://github.com/taverns-red/toast-stats/issues/309)) ([dedc133](https://github.com/taverns-red/toast-stats/commit/dedc13311596f19c3c75b6aea30a94aa3a159b95))
* apply tie-handling and confirmed Distinguished to TransformService ([#303](https://github.com/taverns-red/toast-stats/issues/303), [#304](https://github.com/taverns-red/toast-stats/issues/304), [#306](https://github.com/taverns-red/toast-stats/issues/306)) ([f5a936a](https://github.com/taverns-red/toast-stats/commit/f5a936a82f1738b82c3ad2276897d879a6190484))
* readCacheMetadata always verifies CSV footer when isClosingPeriod=false ([#309](https://github.com/taverns-red/toast-stats/issues/309)) ([0a6f201](https://github.com/taverns-red/toast-stats/commit/0a6f2011bcb0b9bdae3e12d766536deeba5de402))


### Tests

* red phase — CSV footer fallback in readCacheMetadata ([#292](https://github.com/taverns-red/toast-stats/issues/292)) ([4589e57](https://github.com/taverns-red/toast-stats/commit/4589e5796913164219f443c2103589cf400d80bb))

## [1.1.2](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.1.1...collector-cli-v1.1.2) (2026-04-04)


### Bug Fixes

* remove duplicate import and unused var from rebase ([#281](https://github.com/taverns-red/toast-stats/issues/281)) ([438444c](https://github.com/taverns-red/toast-stats/commit/438444c6f36aa6bf34683517c5287c4ded911e9c))
* Restore CSV closing period detection natively during orchestration ([#278](https://github.com/taverns-red/toast-stats/issues/278)) ([86ebfde](https://github.com/taverns-red/toast-stats/commit/86ebfded001555f5a93afefdcf69b4ed03884892))
* update closing period mock to parse CSV footer ([#281](https://github.com/taverns-red/toast-stats/issues/281)) ([ce1ec30](https://github.com/taverns-red/toast-stats/commit/ce1ec3049f00b87d06a9cff0a6c94fb9a69e7906))

## [1.1.1](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.1.0...collector-cli-v1.1.1) (2026-04-03)


### Refactors

* split LazyCharts into individual files to fix fast refresh warning ([#251](https://github.com/taverns-red/toast-stats/issues/251)) ([9a8139d](https://github.com/taverns-red/toast-stats/commit/9a8139d7a4e3ef40f135cad9456cfba9ce145530))

## [1.1.0](https://github.com/taverns-red/toast-stats/compare/collector-cli-v1.0.0...collector-cli-v1.1.0) (2026-03-26)

### Features

- add BackfillOrchestrator and backfill CLI command ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([896eb39](https://github.com/taverns-red/toast-stats/commit/896eb3942a8a47b4d0417a88f482a13a77534222))
- add ClosingDateRegistry for auto-maintaining closing dates ([#203](https://github.com/taverns-red/toast-stats/issues/203)) ([37ecc8c](https://github.com/taverns-red/toast-stats/commit/37ecc8c88f9a03810cdc2ef21ab58849ee0bbd2a))
- add collector-cli rebuild and prune commands ([#181](https://github.com/taverns-red/toast-stats/issues/181)) ([8a8a2ac](https://github.com/taverns-red/toast-stats/commit/8a8a2ac08a578b8d3c3e2f6f53c3fdae07b1eff2))
- add GCS direct upload support to backfill command ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([6d2bd52](https://github.com/taverns-red/toast-stats/commit/6d2bd527b43abd6794f968fc6c7dbd20c9e9ed9e))
- add HttpCsvDownloader with direct CSV URL construction ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([64095e2](https://github.com/taverns-red/toast-stats/commit/64095e21496c4b64d3574437e2dd100e6f24b415))
- add membershipBase to ClubTrend for accurate base membership display ([#164](https://github.com/taverns-red/toast-stats/issues/164)) ([c2e9b30](https://github.com/taverns-red/toast-stats/commit/c2e9b30e8a6e0cfb043fb4860e2a60756edaf711))
- add rank-history generation to rebuild command ([#181](https://github.com/taverns-red/toast-stats/issues/181)) ([53fdde8](https://github.com/taverns-red/toast-stats/commit/53fdde86aa3d8ee7aa194ab63799498ab5b06d24))
- auto-discover districts from Toastmasters CSV in data pipeline ([#141](https://github.com/taverns-red/toast-stats/issues/141)) ([da79820](https://github.com/taverns-red/toast-stats/commit/da798208f2701ba114efd9c417989202d9c1c0f5))
- backfill writes metadata.json per date for transform compatibility ([#125](https://github.com/taverns-red/toast-stats/issues/125)) ([428205f](https://github.com/taverns-red/toast-stats/commit/428205fbe3a3e8482651b86934196e0fc762d300))
- detect and skip corrupt CSVs during transform ([#199](https://github.com/taverns-red/toast-stats/issues/199)) ([f7cfb36](https://github.com/taverns-red/toast-stats/commit/f7cfb3698d22126f72ec3a2e4cb6b0b98c085dd6))
- incremental ClubTrendsStore replaces all-snapshot loading for dense club trends ([#144](https://github.com/taverns-red/toast-stats/issues/144)) ([6933ffa](https://github.com/taverns-red/toast-stats/commit/6933ffae26aae8940e8a616ab4dc80894da6f07a))
- retain penultimate dates during prune ([#203](https://github.com/taverns-red/toast-stats/issues/203)) ([3756951](https://github.com/taverns-red/toast-stats/commit/3756951a556152725f75471b231d93f3711d8232))

### Bug Fixes

- add monthEndDate to export URL for month-specific CSV data ([#204](https://github.com/taverns-red/toast-stats/issues/204)) ([87e2d0f](https://github.com/taverns-red/toast-stats/commit/87e2d0fc4d595ab70160608beb1e8d9883978143))
- add node: prefix to Node built-in imports in collector-cli ([#104](https://github.com/taverns-red/toast-stats/issues/104)) ([0c686f8](https://github.com/taverns-red/toast-stats/commit/0c686f8b0d797026ab783c3d4e2fe78858498ddf))
- apply Borda tie-neutralization to TransformService rankings ([#198](https://github.com/taverns-red/toast-stats/issues/198)) ([bd2b47f](https://github.com/taverns-red/toast-stats/commit/bd2b47f010e6cf4774fd7f702a7dfec5e3bbcb87))
- auto-invoke CLI when run via npx tsx ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([3762152](https://github.com/taverns-red/toast-stats/commit/3762152cca9e4e75265e5e33335f5deb70abd6dd))
- backfill CLI stores CSVs in transform-compatible format ([#125](https://github.com/taverns-red/toast-stats/issues/125)) ([4b8fc2a](https://github.com/taverns-red/toast-stats/commit/4b8fc2aa1b69fd6fa92b14ceafe93b660885bb45))
- backfill outputDir should use cacheDir root, not /backfill subdir ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([c851799](https://github.com/taverns-red/toast-stats/commit/c851799162ffd393451b83e6c4815cc39df02713))
- filter 'As of' date rows from district ID parsing ([#145](https://github.com/taverns-red/toast-stats/issues/145)) ([6be4166](https://github.com/taverns-red/toast-stats/commit/6be4166c8ee1adbbaef00692b4b1e172d1c09eff))
- load all program-year snapshots in computeDistrictAnalytics for dense club trends ([#108](https://github.com/taverns-red/toast-stats/issues/108), [#113](https://github.com/taverns-red/toast-stats/issues/113)) ([2716f86](https://github.com/taverns-red/toast-stats/commit/2716f86d9205e53798266dbe4ea9bd65fb08eee0))
- patch paymentsTrend with accumulated time-series data ([#206](https://github.com/taverns-red/toast-stats/issues/206)) ([17b1b89](https://github.com/taverns-red/toast-stats/commit/17b1b89b9e445280222a4397eab9285fa7efac40))
- resolve eslint v10 lint errors in collector-cli ([#105](https://github.com/taverns-red/toast-stats/issues/105)) ([d170bef](https://github.com/taverns-red/toast-stats/commit/d170bef0b817d3433787b16b1ac353f6be0922f1))
- revert monthEndDate from daily pipeline — breaks current-month data ([#204](https://github.com/taverns-red/toast-stats/issues/204)) ([5128917](https://github.com/taverns-red/toast-stats/commit/5128917c15f04ab85b5f45cbb00d87e8e08354f6))
- switch GCS bucket to toast-stats-data-ca ([#162](https://github.com/taverns-red/toast-stats/issues/162)) ([0968315](https://github.com/taverns-red/toast-stats/commit/0968315eb4b28d2afca60a43b5136e824f757fc6))
- Validate district IDs when collecting directories and log invalid entries. ([c0c2030](https://github.com/taverns-red/toast-stats/commit/c0c2030703991528e9a800b6fbfb18f34f584e39))

### Refactors

- extract shared CachePaths module from BackfillOrchestrator and OrchestratorCacheAdapter ([#126](https://github.com/taverns-red/toast-stats/issues/126)) ([28fda10](https://github.com/taverns-red/toast-stats/commit/28fda102f9f66db910631b53f47c03ee2eea74f3))
- rename scraper-cli to collector-cli across the codebase ([#99](https://github.com/taverns-red/toast-stats/issues/99)) ([eac9a3b](https://github.com/taverns-red/toast-stats/commit/eac9a3ba3d1b857e0c53efeef953584b73edae66))

### Performance

- add GCS cache warm-up for efficient resume ([#123](https://github.com/taverns-red/toast-stats/issues/123)) ([0d9d06e](https://github.com/taverns-red/toast-stats/commit/0d9d06e763b59fef1f8127b6d9805ddddd3f8c75))
- migrate daily pipeline from Playwright to HTTP CSV downloads ([#124](https://github.com/taverns-red/toast-stats/issues/124)) ([004bdd4](https://github.com/taverns-red/toast-stats/commit/004bdd4452354420a92f810591f9a6f7d8c6c2e9))
