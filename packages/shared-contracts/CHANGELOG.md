# Changelog

## [1.17.1](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.17.0...shared-contracts-v1.17.1) (2026-10-17)


### Bug Fixes

* **privacy:** reports place text loses links and emails; contact-strip never deletes a required key ([#2097](https://github.com/taverns-red/toast-stats/issues/2097)) ([#2099](https://github.com/taverns-red/toast-stats/issues/2099)) ([0f9f49b](https://github.com/taverns-red/toast-stats/commit/0f9f49b0a3757af4693da85fe0854f494e7df182))
* **time-series:** a [#1671](https://github.com/taverns-red/toast-stats/issues/1671) gap date gets no point, recorded as not measured, never 0 ([#2070](https://github.com/taverns-red/toast-stats/issues/2070)) ([#2072](https://github.com/taverns-red/toast-stats/issues/2072)) ([2ac486d](https://github.com/taverns-red/toast-stats/commit/2ac486d8de95564d0a2120e52603ea9f7e033b7d))


### Dependencies

* **deps:** Bump the patch-and-minor group across 1 directory with 17 updates ([#2110](https://github.com/taverns-red/toast-stats/issues/2110)) ([d82ed58](https://github.com/taverns-red/toast-stats/commit/d82ed587586bd3fb0017408e952e1715ac632a35))

## [1.17.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.16.0...shared-contracts-v1.17.0) (2026-10-15)


### Features

* **analytics:** education award leaderboards ([#1592](https://github.com/taverns-red/toast-stats/issues/1592)) ([#1593](https://github.com/taverns-red/toast-stats/issues/1593)) ([504f792](https://github.com/taverns-red/toast-stats/commit/504f7926f2ae5a3970863669e505a301e64ee59d))
* **analytics:** parse the Susp branch of Charter Date/Suspend Date — per-district suspendedClubs ([#1497](https://github.com/taverns-red/toast-stats/issues/1497)) ([#1504](https://github.com/taverns-red/toast-stats/issues/1504)) ([39d7016](https://github.com/taverns-red/toast-stats/commit/39d7016ccf1234e506b632e977f93c0f9ed16ed9))
* **changes:** add 'Club status changes' group — club operational-status transitions ([#1247](https://github.com/taverns-red/toast-stats/issues/1247)) ([#1248](https://github.com/taverns-red/toast-stats/issues/1248)) ([b9c1a72](https://github.com/taverns-red/toast-stats/commit/b9c1a7255888c7258a90cf2ec148defe53a498e3))
* **collector:** dated education ledger history backfill 2003-04 → 2018-19, staging only ([#1802](https://github.com/taverns-red/toast-stats/issues/1802)) ([#1908](https://github.com/taverns-red/toast-stats/issues/1908)) ([c62b07f](https://github.com/taverns-red/toast-stats/commit/c62b07fd6639a5515173e0ca83882ed8895ce245))
* **collector:** ingest Sponsors/Mentors daily report as counts, names dropped ([#1795](https://github.com/taverns-red/toast-stats/issues/1795)) ([#2056](https://github.com/taverns-red/toast-stats/issues/2056)) ([217d97d](https://github.com/taverns-red/toast-stats/commit/217d97d4af7aa5c4a516eb047e15683992e7dae9))
* **collector:** keep FAC Location and populate meetingSchedule[] ([#1789](https://github.com/taverns-red/toast-stats/issues/1789)) ([#2024](https://github.com/taverns-red/toast-stats/issues/2024)) ([ffc5bf8](https://github.com/taverns-red/toast-stats/commit/ffc5bf849e3492ede5581aca6d413d68e96a8617))
* dual-shape reader for slim district analytics club lists ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#2046](https://github.com/taverns-red/toast-stats/issues/2046)) ([7f7b7b2](https://github.com/taverns-red/toast-stats/commit/7f7b7b26160c42348d0e61088b62f726992f3b59))
* **pipeline:** club-district history to staging derived/, built in every mode ([#1782](https://github.com/taverns-red/toast-stats/issues/1782)) ([#1824](https://github.com/taverns-red/toast-stats/issues/1824)) ([bf147c0](https://github.com/taverns-red/toast-stats/commit/bf147c086d8b1491501d06b600f41e0e12f20f54))
* **pipeline:** config/club-district-history/, content-gated and promoted with the run ([#1782](https://github.com/taverns-red/toast-stats/issues/1782)) ([#2008](https://github.com/taverns-red/toast-stats/issues/2008)) ([6474119](https://github.com/taverns-red/toast-stats/commit/6474119fcce6e0c7dbbf5865c5b1493abffb5893))
* **pipeline:** config/district-region-history.json, content-gated and promoted with the run ([#1820](https://github.com/taverns-red/toast-stats/issues/1820)) ([#2002](https://github.com/taverns-red/toast-stats/issues/2002)) ([1973771](https://github.com/taverns-red/toast-stats/commit/1973771d3271f358bd496cc9d13899b65a0be4da))
* **pipeline:** district→region history per PY to staging derived/ ([#1820](https://github.com/taverns-red/toast-stats/issues/1820)) ([#1825](https://github.com/taverns-red/toast-stats/issues/1825)) ([97b8f2a](https://github.com/taverns-red/toast-stats/commit/97b8f2a870c3c474509187f3e944054dca120627))
* **pipeline:** education rollup from the ledger — district, region, world per PY ([#1801](https://github.com/taverns-red/toast-stats/issues/1801)) ([#1973](https://github.com/taverns-red/toast-stats/issues/1973)) ([aa7bb5b](https://github.com/taverns-red/toast-stats/commit/aa7bb5bd4e0c61199ea15351418828b32fad66b9))
* **pipeline:** fetch district daily reports in a parallel job, and fix the district_*.json collision ([#1428](https://github.com/taverns-red/toast-stats/issues/1428)) ([#1434](https://github.com/taverns-red/toast-stats/issues/1434)) ([c86c866](https://github.com/taverns-red/toast-stats/commit/c86c8661c765c2fbb98861d836a49b50e76d7a21))
* **pipeline:** global-club-race.json aggregation artifact + schema ([#1556](https://github.com/taverns-red/toast-stats/issues/1556), 2/4) ([#1560](https://github.com/taverns-red/toast-stats/issues/1560)) ([59e44ce](https://github.com/taverns-red/toast-stats/commit/59e44ce3e5c590d22ef64efcd11f897fb93f50c9))
* **pipeline:** snapshots/{date}/global-totals.json — the per-date worldwide rollup ([#1498](https://github.com/taverns-red/toast-stats/issues/1498)) ([#1509](https://github.com/taverns-red/toast-stats/issues/1509)) ([b7fdeb3](https://github.com/taverns-red/toast-stats/commit/b7fdeb3ab99a406a6a7e37687d1eb2a829712941))
* **pipeline:** snapshots/{date}/suspended-clubs.json — per-club suspended-this-PY list ([#1953](https://github.com/taverns-red/toast-stats/issues/1953)) ([#1969](https://github.com/taverns-red/toast-stats/issues/1969)) ([94c9745](https://github.com/taverns-red/toast-stats/commit/94c97454201d78e12ce891d12a77ca5db7a21d88))
* **pipeline:** snapshots/&lt;date&gt;/region-rollups.json — region and world rollups, content-gated, promoted with the date ([#1799](https://github.com/taverns-red/toast-stats/issues/1799)) ([#2013](https://github.com/taverns-red/toast-stats/issues/2013)) ([cc8c1a5](https://github.com/taverns-red/toast-stats/commit/cc8c1a5c6b3807299ea4f6a20850b91ee49f97d5))
* **pipeline:** v1/global-history.json — one worldwide row per program-year end ([#1499](https://github.com/taverns-red/toast-stats/issues/1499)) ([#1511](https://github.com/taverns-red/toast-stats/issues/1511)) ([3c680e9](https://github.com/taverns-red/toast-stats/commit/3c680e97324cdab429e77c79d0b2f16b36dd0bb0))
* **whats-changed:** Club Success Plan submission events in the change feed ([#1460](https://github.com/taverns-red/toast-stats/issues/1460)) ([#1494](https://github.com/taverns-red/toast-stats/issues/1494)) ([8e339e5](https://github.com/taverns-red/toast-stats/commit/8e339e5d25e023eef60c2755440c1fc15aebee78))
* **whats-changed:** per-club payment events with payment-type attribution ([#1459](https://github.com/taverns-red/toast-stats/issues/1459)) ([#1485](https://github.com/taverns-red/toast-stats/issues/1485)) ([b4a029f](https://github.com/taverns-red/toast-stats/commit/b4a029f2b4fdd14b0362c25b3a170bbd96f716ce))


### Bug Fixes

* **analytics:** DCP goals 2-3 read 0 for PY 2026-27 — resolve TI's 'or EOM' column rename ([#1399](https://github.com/taverns-red/toast-stats/issues/1399)) ([#1402](https://github.com/taverns-red/toast-stats/issues/1402)) ([f7ac01e](https://github.com/taverns-red/toast-stats/commit/f7ac01eeb0bfe7e18d34bce9363206294daaea8a))
* **collector-cli:** per-district suspendedClubs is unknown (absent), not 0, without Susp data ([#1757](https://github.com/taverns-red/toast-stats/issues/1757)) ([#1934](https://github.com/taverns-red/toast-stats/issues/1934)) ([98d1c85](https://github.com/taverns-red/toast-stats/commit/98d1c8596cf05de7cbb3bb9e9406b44b1ccf6a03))
* **collector:** count education-award members only for counted awards ([#1599](https://github.com/taverns-red/toast-stats/issues/1599)) ([#1600](https://github.com/taverns-red/toast-stats/issues/1600)) ([9abaae2](https://github.com/taverns-red/toast-stats/commit/9abaae2c859e7ac0548a3f3a848f0bf23cc33c87))
* **collector:** drop pre-merge fileSize from the snapshot manifest ([#1888](https://github.com/taverns-red/toast-stats/issues/1888)) ([#1932](https://github.com/taverns-red/toast-stats/issues/1932)) ([fc0b547](https://github.com/taverns-red/toast-stats/commit/fc0b5472ea1c53e0d7caed3afc4bb5f66ab7073e))
* **contracts:** add dcpGoalsAchieved to ClubStatisticsFileSchema ([#1143](https://github.com/taverns-red/toast-stats/issues/1143)) ([#1209](https://github.com/taverns-red/toast-stats/issues/1209)) ([0ed280c](https://github.com/taverns-red/toast-stats/commit/0ed280c761dfd76fc1f6cb7db0b4bd516c2e3b43))
* **education:** count the CES vintage path in the leaderboards — one Pathways vocabulary ([#1976](https://github.com/taverns-red/toast-stats/issues/1976)) ([#1980](https://github.com/taverns-red/toast-stats/issues/1980)) ([1aefc96](https://github.com/taverns-red/toast-stats/commit/1aefc9677ba75755959682a380f59bdbe09f580a))
* **frontend:** club history is keyed on the club number, and every skipped year says why ([#1437](https://github.com/taverns-red/toast-stats/issues/1437)) ([#1446](https://github.com/taverns-red/toast-stats/issues/1446)) ([4c30e85](https://github.com/taverns-red/toast-stats/commit/4c30e8590c7ddb262fb996b995899d0671b097be))
* **global-totals:** state a gap district left out of the world sums ([#2042](https://github.com/taverns-red/toast-stats/issues/2042)) ([#2050](https://github.com/taverns-red/toast-stats/issues/2050)) ([5620f1f](https://github.com/taverns-red/toast-stats/commit/5620f1fb5b897ddfc65b4bb99d1574a11cefd3f9))
* one canonical club id across the eight identity sites ([#1440](https://github.com/taverns-red/toast-stats/issues/1440)) ([#1447](https://github.com/taverns-red/toast-stats/issues/1447)) ([2577eaa](https://github.com/taverns-red/toast-stats/commit/2577eaac146fc04d49d6002ebaa91c141d844721))
* **pipeline:** an uncollected Susp column is unknown, not zero — global-history's eight phantom zeros ([#1514](https://github.com/taverns-red/toast-stats/issues/1514)) ([#1515](https://github.com/taverns-red/toast-stats/issues/1515)) ([1273ca3](https://github.com/taverns-red/toast-stats/commit/1273ca3f890ce82f372daf4d1eb38fe674a96756))
* **pipeline:** race artifact as of its snapshot date — no future crossings, as-of official code ([#1689](https://github.com/taverns-red/toast-stats/issues/1689)) ([#1691](https://github.com/taverns-red/toast-stats/issues/1691)) ([d5dfea5](https://github.com/taverns-red/toast-stats/commit/d5dfea5f140e1b7b9c24f1cfa00e3fcb25533350))
* **privacy:** no link of any kind in the club place or schedule ([#2069](https://github.com/taverns-red/toast-stats/issues/2069)) ([#2074](https://github.com/taverns-red/toast-stats/issues/2074)) ([aa1a580](https://github.com/taverns-red/toast-stats/commit/aa1a580483ba400f8ccae2e91c315d0c41f09031))
* **privacy:** stop writing club email/phone into promoted artifacts ([#2026](https://github.com/taverns-red/toast-stats/issues/2026)) ([#2030](https://github.com/taverns-red/toast-stats/issues/2030)) ([3480589](https://github.com/taverns-red/toast-stats/commit/3480589d48afcea3d79c90713ad1dded86927627))
* say when a district realignment moved the boundary instead of calling transfers roster churn ([#1443](https://github.com/taverns-red/toast-stats/issues/1443)) ([#1448](https://github.com/taverns-red/toast-stats/issues/1448)) ([9914555](https://github.com/taverns-red/toast-stats/commit/99145553883f9c56e8a47735e7664679b7a49a69))
* suppress district year-over-year across the 2026 reformation boundary ([#1442](https://github.com/taverns-red/toast-stats/issues/1442)) ([#1449](https://github.com/taverns-red/toast-stats/issues/1449)) ([09b36a5](https://github.com/taverns-red/toast-stats/commit/09b36a5f018ffde63bdb7d0b199c3dbec0c82383))


### Refactors

* rename @toastmasters/{analytics-core,shared-contracts,collector-cli} → @taverns-red/* ([#1258](https://github.com/taverns-red/toast-stats/issues/1258)) ([#1259](https://github.com/taverns-red/toast-stats/issues/1259)) ([5e33f2d](https://github.com/taverns-red/toast-stats/commit/5e33f2d7546e72eef1146b8ae84bf8a6df4903d9))


### Dependencies

* **deps-dev:** bump the dev-deps group across 1 directory with 4 updates ([#1502](https://github.com/taverns-red/toast-stats/issues/1502)) ([485dc1c](https://github.com/taverns-red/toast-stats/commit/485dc1c75b0c8ac6d3f8076b87ab608e1e216b14))
* **deps-dev:** bump the dev-deps group across 1 directory with 4 updates ([#1533](https://github.com/taverns-red/toast-stats/issues/1533)) ([c7c7196](https://github.com/taverns-red/toast-stats/commit/c7c7196acda1cca4d897e8e17d306b1a5990f57c))
* **deps:** bump the patch-and-minor group across 1 directory with 14 updates ([#1236](https://github.com/taverns-red/toast-stats/issues/1236)) ([ac0e084](https://github.com/taverns-red/toast-stats/commit/ac0e08499141afc97b89ef6e67f3cb6994ca86c5))
* **deps:** bump the patch-and-minor group across 1 directory with 18 updates ([#1604](https://github.com/taverns-red/toast-stats/issues/1604)) ([0f42c54](https://github.com/taverns-red/toast-stats/commit/0f42c548ffb240d7496945b09c9ea7b21b3cbd7b))
* **deps:** bump the patch-and-minor group across 1 directory with 23 updates ([#1488](https://github.com/taverns-red/toast-stats/issues/1488)) ([5714376](https://github.com/taverns-red/toast-stats/commit/5714376b49bf475c3c7fc08481937fd4966e71c2))
* **deps:** bump the patch-and-minor group across 1 directory with 5 updates ([#1656](https://github.com/taverns-red/toast-stats/issues/1656)) ([3b055a7](https://github.com/taverns-red/toast-stats/commit/3b055a78e72a5cf4c79463ca956a0f731b31f6d2))
* **deps:** bump the patch-and-minor group with 10 updates ([#1523](https://github.com/taverns-red/toast-stats/issues/1523)) ([dbc727c](https://github.com/taverns-red/toast-stats/commit/dbc727c91e1fd0483686219dd04e522b1167a376))
* **deps:** bump the patch-and-minor group with 13 updates ([#1576](https://github.com/taverns-red/toast-stats/issues/1576)) ([89caddc](https://github.com/taverns-red/toast-stats/commit/89caddc2e6bd254d79a926d276a730cbbdfa3a34))
* **deps:** bump the patch-and-minor group with 4 updates ([#1094](https://github.com/taverns-red/toast-stats/issues/1094)) ([80deaed](https://github.com/taverns-red/toast-stats/commit/80deaedecb1ffa4d9dd52c4bee58a2b06ffcc0d4))
* **deps:** bump the prod-deps group across 1 directory with 6 updates ([#1582](https://github.com/taverns-red/toast-stats/issues/1582)) ([0c9fe54](https://github.com/taverns-red/toast-stats/commit/0c9fe5459f2e77b78e862235877b66237a8f7a9d))
* land the patch-and-minor group with the prettier 3.9.6 reformat ([#1340](https://github.com/taverns-red/toast-stats/issues/1340)) ([83b19db](https://github.com/taverns-red/toast-stats/commit/83b19dbca7a910712db4933036acaf7ab8b570b0)), closes [#1339](https://github.com/taverns-red/toast-stats/issues/1339)


### Continuous Integration

* enforce the gates — collector-cli, node pin, develop trigger, lint ratchet ([#1109](https://github.com/taverns-red/toast-stats/issues/1109)) ([#1217](https://github.com/taverns-red/toast-stats/issues/1217)) ([3722885](https://github.com/taverns-red/toast-stats/commit/372288567b4db08069ffe1048e13103f782872b3))


### Build System

* **deps:** migrate to vitest 5 — the coverageFilesDirectory break was a mixed-major tree ([#1529](https://github.com/taverns-red/toast-stats/issues/1529)) ([#1532](https://github.com/taverns-red/toast-stats/issues/1532)) ([9769221](https://github.com/taverns-red/toast-stats/commit/97692210e1547fd801398e9f42e406406a6a1a0b))
* migrate off moduleResolution node10 and bump TypeScript to 7.0.2 ([#1489](https://github.com/taverns-red/toast-stats/issues/1489)) ([#1495](https://github.com/taverns-red/toast-stats/issues/1495)) ([a8a4e88](https://github.com/taverns-red/toast-stats/commit/a8a4e88e067aeacf7fbc959708d5bf3dd38b1342))

## [1.16.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.15.0...shared-contracts-v1.16.0) (2026-10-15)


### Features

* **collector:** ingest Sponsors/Mentors daily report as counts, names dropped ([#1795](https://github.com/taverns-red/toast-stats/issues/1795)) ([#2056](https://github.com/taverns-red/toast-stats/issues/2056)) ([217d97d](https://github.com/taverns-red/toast-stats/commit/217d97d4af7aa5c4a516eb047e15683992e7dae9))
* **collector:** keep FAC Location and populate meetingSchedule[] ([#1789](https://github.com/taverns-red/toast-stats/issues/1789)) ([#2024](https://github.com/taverns-red/toast-stats/issues/2024)) ([ffc5bf8](https://github.com/taverns-red/toast-stats/commit/ffc5bf849e3492ede5581aca6d413d68e96a8617))
* dual-shape reader for slim district analytics club lists ([#1901](https://github.com/taverns-red/toast-stats/issues/1901)) ([#2046](https://github.com/taverns-red/toast-stats/issues/2046)) ([7f7b7b2](https://github.com/taverns-red/toast-stats/commit/7f7b7b26160c42348d0e61088b62f726992f3b59))
* **pipeline:** config/club-district-history/, content-gated and promoted with the run ([#1782](https://github.com/taverns-red/toast-stats/issues/1782)) ([#2008](https://github.com/taverns-red/toast-stats/issues/2008)) ([6474119](https://github.com/taverns-red/toast-stats/commit/6474119fcce6e0c7dbbf5865c5b1493abffb5893))
* **pipeline:** config/district-region-history.json, content-gated and promoted with the run ([#1820](https://github.com/taverns-red/toast-stats/issues/1820)) ([#2002](https://github.com/taverns-red/toast-stats/issues/2002)) ([1973771](https://github.com/taverns-red/toast-stats/commit/1973771d3271f358bd496cc9d13899b65a0be4da))
* **pipeline:** snapshots/&lt;date&gt;/region-rollups.json — region and world rollups, content-gated, promoted with the date ([#1799](https://github.com/taverns-red/toast-stats/issues/1799)) ([#2013](https://github.com/taverns-red/toast-stats/issues/2013)) ([cc8c1a5](https://github.com/taverns-red/toast-stats/commit/cc8c1a5c6b3807299ea4f6a20850b91ee49f97d5))


### Bug Fixes

* **global-totals:** state a gap district left out of the world sums ([#2042](https://github.com/taverns-red/toast-stats/issues/2042)) ([#2050](https://github.com/taverns-red/toast-stats/issues/2050)) ([5620f1f](https://github.com/taverns-red/toast-stats/commit/5620f1fb5b897ddfc65b4bb99d1574a11cefd3f9))
* **privacy:** stop writing club email/phone into promoted artifacts ([#2026](https://github.com/taverns-red/toast-stats/issues/2026)) ([#2030](https://github.com/taverns-red/toast-stats/issues/2030)) ([3480589](https://github.com/taverns-red/toast-stats/commit/3480589d48afcea3d79c90713ad1dded86927627))

## [1.15.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.14.1...shared-contracts-v1.15.0) (2026-10-13)


### Features

* **pipeline:** education rollup from the ledger — district, region, world per PY ([#1801](https://github.com/taverns-red/toast-stats/issues/1801)) ([#1973](https://github.com/taverns-red/toast-stats/issues/1973)) ([aa7bb5b](https://github.com/taverns-red/toast-stats/commit/aa7bb5bd4e0c61199ea15351418828b32fad66b9))
* **pipeline:** snapshots/{date}/suspended-clubs.json — per-club suspended-this-PY list ([#1953](https://github.com/taverns-red/toast-stats/issues/1953)) ([#1969](https://github.com/taverns-red/toast-stats/issues/1969)) ([94c9745](https://github.com/taverns-red/toast-stats/commit/94c97454201d78e12ce891d12a77ca5db7a21d88))


### Bug Fixes

* **education:** count the CES vintage path in the leaderboards — one Pathways vocabulary ([#1976](https://github.com/taverns-red/toast-stats/issues/1976)) ([#1980](https://github.com/taverns-red/toast-stats/issues/1980)) ([1aefc96](https://github.com/taverns-red/toast-stats/commit/1aefc9677ba75755959682a380f59bdbe09f580a))

## [1.14.1](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.14.0...shared-contracts-v1.14.1) (2026-10-13)


### Bug Fixes

* **collector-cli:** per-district suspendedClubs is unknown (absent), not 0, without Susp data ([#1757](https://github.com/taverns-red/toast-stats/issues/1757)) ([#1934](https://github.com/taverns-red/toast-stats/issues/1934)) ([98d1c85](https://github.com/taverns-red/toast-stats/commit/98d1c8596cf05de7cbb3bb9e9406b44b1ccf6a03))
* **collector:** drop pre-merge fileSize from the snapshot manifest ([#1888](https://github.com/taverns-red/toast-stats/issues/1888)) ([#1932](https://github.com/taverns-red/toast-stats/issues/1932)) ([fc0b547](https://github.com/taverns-red/toast-stats/commit/fc0b5472ea1c53e0d7caed3afc4bb5f66ab7073e))

## [1.14.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.13.0...shared-contracts-v1.14.0) (2026-10-12)


### Features

* **collector:** dated education ledger history backfill 2003-04 → 2018-19, staging only ([#1802](https://github.com/taverns-red/toast-stats/issues/1802)) ([#1908](https://github.com/taverns-red/toast-stats/issues/1908)) ([c62b07f](https://github.com/taverns-red/toast-stats/commit/c62b07fd6639a5515173e0ca83882ed8895ce245))

## [1.13.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.12.4...shared-contracts-v1.13.0) (2026-10-12)


### Features

* **pipeline:** club-district history to staging derived/, built in every mode ([#1782](https://github.com/taverns-red/toast-stats/issues/1782)) ([#1824](https://github.com/taverns-red/toast-stats/issues/1824)) ([bf147c0](https://github.com/taverns-red/toast-stats/commit/bf147c086d8b1491501d06b600f41e0e12f20f54))
* **pipeline:** district→region history per PY to staging derived/ ([#1820](https://github.com/taverns-red/toast-stats/issues/1820)) ([#1825](https://github.com/taverns-red/toast-stats/issues/1825)) ([97b8f2a](https://github.com/taverns-red/toast-stats/commit/97b8f2a870c3c474509187f3e944054dca120627))

## [1.12.4](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.12.3...shared-contracts-v1.12.4) (2026-10-12)


### Dependencies

* **deps:** bump the patch-and-minor group across 1 directory with 5 updates ([#1656](https://github.com/taverns-red/toast-stats/issues/1656)) ([3b055a7](https://github.com/taverns-red/toast-stats/commit/3b055a78e72a5cf4c79463ca956a0f731b31f6d2))

## [1.12.3](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.12.2...shared-contracts-v1.12.3) (2026-10-07)


### Bug Fixes

* **pipeline:** race artifact as of its snapshot date — no future crossings, as-of official code ([#1689](https://github.com/taverns-red/toast-stats/issues/1689)) ([#1691](https://github.com/taverns-red/toast-stats/issues/1691)) ([d5dfea5](https://github.com/taverns-red/toast-stats/commit/d5dfea5f140e1b7b9c24f1cfa00e3fcb25533350))

## [1.12.2](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.12.1...shared-contracts-v1.12.2) (2026-10-03)


### Dependencies

* **deps:** bump the patch-and-minor group across 1 directory with 18 updates ([#1604](https://github.com/taverns-red/toast-stats/issues/1604)) ([0f42c54](https://github.com/taverns-red/toast-stats/commit/0f42c548ffb240d7496945b09c9ea7b21b3cbd7b))
* **deps:** bump the prod-deps group across 1 directory with 6 updates ([#1582](https://github.com/taverns-red/toast-stats/issues/1582)) ([0c9fe54](https://github.com/taverns-red/toast-stats/commit/0c9fe5459f2e77b78e862235877b66237a8f7a9d))

## [1.12.1](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.12.0...shared-contracts-v1.12.1) (2026-10-03)


### Bug Fixes

* **collector:** count education-award members only for counted awards ([#1599](https://github.com/taverns-red/toast-stats/issues/1599)) ([#1600](https://github.com/taverns-red/toast-stats/issues/1600)) ([9abaae2](https://github.com/taverns-red/toast-stats/commit/9abaae2c859e7ac0548a3f3a848f0bf23cc33c87))

## [1.12.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.11.1...shared-contracts-v1.12.0) (2026-10-02)


### Features

* **analytics:** education award leaderboards ([#1592](https://github.com/taverns-red/toast-stats/issues/1592)) ([#1593](https://github.com/taverns-red/toast-stats/issues/1593)) ([504f792](https://github.com/taverns-red/toast-stats/commit/504f7926f2ae5a3970863669e505a301e64ee59d))

## [1.11.1](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.11.0...shared-contracts-v1.11.1) (2026-09-14)


### Dependencies

* **deps:** bump the patch-and-minor group with 13 updates ([#1576](https://github.com/taverns-red/toast-stats/issues/1576)) ([89caddc](https://github.com/taverns-red/toast-stats/commit/89caddc2e6bd254d79a926d276a730cbbdfa3a34))

## [1.11.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.10.1...shared-contracts-v1.11.0) (2026-09-13)


### Features

* **pipeline:** global-club-race.json aggregation artifact + schema ([#1556](https://github.com/taverns-red/toast-stats/issues/1556), 2/4) ([#1560](https://github.com/taverns-red/toast-stats/issues/1560)) ([59e44ce](https://github.com/taverns-red/toast-stats/commit/59e44ce3e5c590d22ef64efcd11f897fb93f50c9))


### Dependencies

* **deps-dev:** bump the dev-deps group across 1 directory with 4 updates ([#1533](https://github.com/taverns-red/toast-stats/issues/1533)) ([c7c7196](https://github.com/taverns-red/toast-stats/commit/c7c7196acda1cca4d897e8e17d306b1a5990f57c))
* **deps:** bump the patch-and-minor group with 10 updates ([#1523](https://github.com/taverns-red/toast-stats/issues/1523)) ([dbc727c](https://github.com/taverns-red/toast-stats/commit/dbc727c91e1fd0483686219dd04e522b1167a376))


### Build System

* **deps:** migrate to vitest 5 — the coverageFilesDirectory break was a mixed-major tree ([#1529](https://github.com/taverns-red/toast-stats/issues/1529)) ([#1532](https://github.com/taverns-red/toast-stats/issues/1532)) ([9769221](https://github.com/taverns-red/toast-stats/commit/97692210e1547fd801398e9f42e406406a6a1a0b))

## [1.10.1](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.10.0...shared-contracts-v1.10.1) (2026-09-02)


### Bug Fixes

* **pipeline:** an uncollected Susp column is unknown, not zero — global-history's eight phantom zeros ([#1514](https://github.com/taverns-red/toast-stats/issues/1514)) ([#1515](https://github.com/taverns-red/toast-stats/issues/1515)) ([1273ca3](https://github.com/taverns-red/toast-stats/commit/1273ca3f890ce82f372daf4d1eb38fe674a96756))

## [1.10.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.9.0...shared-contracts-v1.10.0) (2026-09-01)


### Features

* **analytics:** parse the Susp branch of Charter Date/Suspend Date — per-district suspendedClubs ([#1497](https://github.com/taverns-red/toast-stats/issues/1497)) ([#1504](https://github.com/taverns-red/toast-stats/issues/1504)) ([39d7016](https://github.com/taverns-red/toast-stats/commit/39d7016ccf1234e506b632e977f93c0f9ed16ed9))
* **pipeline:** snapshots/{date}/global-totals.json — the per-date worldwide rollup ([#1498](https://github.com/taverns-red/toast-stats/issues/1498)) ([#1509](https://github.com/taverns-red/toast-stats/issues/1509)) ([b7fdeb3](https://github.com/taverns-red/toast-stats/commit/b7fdeb3ab99a406a6a7e37687d1eb2a829712941))
* **pipeline:** v1/global-history.json — one worldwide row per program-year end ([#1499](https://github.com/taverns-red/toast-stats/issues/1499)) ([#1511](https://github.com/taverns-red/toast-stats/issues/1511)) ([3c680e9](https://github.com/taverns-red/toast-stats/commit/3c680e97324cdab429e77c79d0b2f16b36dd0bb0))

## [1.9.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.8.0...shared-contracts-v1.9.0) (2026-09-01)


### Features

* **whats-changed:** Club Success Plan submission events in the change feed ([#1460](https://github.com/taverns-red/toast-stats/issues/1460)) ([#1494](https://github.com/taverns-red/toast-stats/issues/1494)) ([8e339e5](https://github.com/taverns-red/toast-stats/commit/8e339e5d25e023eef60c2755440c1fc15aebee78))
* **whats-changed:** per-club payment events with payment-type attribution ([#1459](https://github.com/taverns-red/toast-stats/issues/1459)) ([#1485](https://github.com/taverns-red/toast-stats/issues/1485)) ([b4a029f](https://github.com/taverns-red/toast-stats/commit/b4a029f2b4fdd14b0362c25b3a170bbd96f716ce))

## [1.8.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.7.1...shared-contracts-v1.8.0) (2026-08-23)


### Features

* **pipeline:** fetch district daily reports in a parallel job, and fix the district_*.json collision ([#1428](https://github.com/taverns-red/toast-stats/issues/1428)) ([#1434](https://github.com/taverns-red/toast-stats/issues/1434)) ([c86c866](https://github.com/taverns-red/toast-stats/commit/c86c8661c765c2fbb98861d836a49b50e76d7a21))


### Bug Fixes

* **analytics:** DCP goals 2-3 read 0 for PY 2026-27 — resolve TI's 'or EOM' column rename ([#1399](https://github.com/taverns-red/toast-stats/issues/1399)) ([#1402](https://github.com/taverns-red/toast-stats/issues/1402)) ([f7ac01e](https://github.com/taverns-red/toast-stats/commit/f7ac01eeb0bfe7e18d34bce9363206294daaea8a))
* **frontend:** club history is keyed on the club number, and every skipped year says why ([#1437](https://github.com/taverns-red/toast-stats/issues/1437)) ([#1446](https://github.com/taverns-red/toast-stats/issues/1446)) ([4c30e85](https://github.com/taverns-red/toast-stats/commit/4c30e8590c7ddb262fb996b995899d0671b097be))
* one canonical club id across the eight identity sites ([#1440](https://github.com/taverns-red/toast-stats/issues/1440)) ([#1447](https://github.com/taverns-red/toast-stats/issues/1447)) ([2577eaa](https://github.com/taverns-red/toast-stats/commit/2577eaac146fc04d49d6002ebaa91c141d844721))
* say when a district realignment moved the boundary instead of calling transfers roster churn ([#1443](https://github.com/taverns-red/toast-stats/issues/1443)) ([#1448](https://github.com/taverns-red/toast-stats/issues/1448)) ([9914555](https://github.com/taverns-red/toast-stats/commit/99145553883f9c56e8a47735e7664679b7a49a69))
* suppress district year-over-year across the 2026 reformation boundary ([#1442](https://github.com/taverns-red/toast-stats/issues/1442)) ([#1449](https://github.com/taverns-red/toast-stats/issues/1449)) ([09b36a5](https://github.com/taverns-red/toast-stats/commit/09b36a5f018ffde63bdb7d0b199c3dbec0c82383))

## [1.7.1](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.7.0...shared-contracts-v1.7.1) (2026-07-03)


### Refactors

* rename @toastmasters/{analytics-core,shared-contracts,collector-cli} → @taverns-red/* ([#1258](https://github.com/taverns-red/toast-stats/issues/1258)) ([#1259](https://github.com/taverns-red/toast-stats/issues/1259)) ([5e33f2d](https://github.com/taverns-red/toast-stats/commit/5e33f2d7546e72eef1146b8ae84bf8a6df4903d9))

## [1.7.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.6.1...shared-contracts-v1.7.0) (2026-06-27)


### Features

* **changes:** add 'Club status changes' group — club operational-status transitions ([#1247](https://github.com/taverns-red/toast-stats/issues/1247)) ([#1248](https://github.com/taverns-red/toast-stats/issues/1248)) ([b9c1a72](https://github.com/taverns-red/toast-stats/commit/b9c1a7255888c7258a90cf2ec148defe53a498e3))

## [1.6.1](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.6.0...shared-contracts-v1.6.1) (2026-06-14)


### Bug Fixes

* **contracts:** add dcpGoalsAchieved to ClubStatisticsFileSchema ([#1143](https://github.com/taverns-red/toast-stats/issues/1143)) ([#1209](https://github.com/taverns-red/toast-stats/issues/1209)) ([0ed280c](https://github.com/taverns-red/toast-stats/commit/0ed280c761dfd76fc1f6cb7db0b4bd516c2e3b43))

## [1.6.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.5.0...shared-contracts-v1.6.0) (2026-05-31)


### Features

* **changes:** area & division status-transition events in the What-Changed feed ([#1014](https://github.com/taverns-red/toast-stats/issues/1014)) ([#1025](https://github.com/taverns-red/toast-stats/issues/1025)) ([94df6f4](https://github.com/taverns-red/toast-stats/commit/94df6f4ecd0d8a18bfe1ab30bf7ef60ee5b6d389))

## [1.5.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.4.0...shared-contracts-v1.5.0) (2026-05-27)


### Features

* **changes:** Phase 1 — snapshot diff engine + default district digest ([#793](https://github.com/taverns-red/toast-stats/issues/793)) ([#801](https://github.com/taverns-red/toast-stats/issues/801)) ([86d4ccb](https://github.com/taverns-red/toast-stats/commit/86d4ccb920a59160f42584b923a515eaf377ebeb))

## [1.4.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.3.0...shared-contracts-v1.4.0) (2026-05-23)


### Features

* **district-clubs:** [#489](https://github.com/taverns-red/toast-stats/issues/489) surface FAC-only clubs (ATOs / prospective) ([#594](https://github.com/taverns-red/toast-stats/issues/594)) ([d076fba](https://github.com/taverns-red/toast-stats/commit/d076fba705466ce3dd4765eecd32c8e2cd209a51))
* **find-a-club:** schema bump + Club hero CHARTERED + disable pre-push ([#429](https://github.com/taverns-red/toast-stats/issues/429) [#431](https://github.com/taverns-red/toast-stats/issues/431) [#432](https://github.com/taverns-red/toast-stats/issues/432)) ([#483](https://github.com/taverns-red/toast-stats/issues/483)) ([ca573cd](https://github.com/taverns-red/toast-stats/commit/ca573cd9f457a9a6f3e4954c7f932bf1a3d26531))

## [1.3.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.2.1...shared-contracts-v1.3.0) (2026-04-22)


### Features

* implement CompetitiveAwardsCalculator + pipeline integration ([#330](https://github.com/taverns-red/toast-stats/issues/330)) ([b81a1eb](https://github.com/taverns-red/toast-stats/commit/b81a1ebb7f4efaa49f8f7e2ae526640af45349c6))
* parse payment breakdown columns from All Districts CSV ([#327](https://github.com/taverns-red/toast-stats/issues/327)) ([df695cf](https://github.com/taverns-red/toast-stats/commit/df695cfdf489026629dd5292ccfe8bb7c8f7f5c3))
* parse prerequisite + Smedley columns from All Districts CSV ([#329](https://github.com/taverns-red/toast-stats/issues/329)) ([13589d2](https://github.com/taverns-red/toast-stats/commit/13589d226ae5668da9ace1b3a55cf058f7680faa))


### Bug Fixes

* exclude new charters from District Club Retention Award ([#336](https://github.com/taverns-red/toast-stats/issues/336)) ([#337](https://github.com/taverns-red/toast-stats/issues/337)) ([239a31a](https://github.com/taverns-red/toast-stats/commit/239a31acbb424483ea546c76c85f129d6e6b5707))

## [1.2.1](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.2.0...shared-contracts-v1.2.1) (2026-04-06)


### Bug Fixes

* add cspSubmitted to Zod schema so snapshots preserve it ([#300](https://github.com/taverns-red/toast-stats/issues/300)) ([d1406a9](https://github.com/taverns-red/toast-stats/commit/d1406a9026d8cfa497a28836f5f558c17fc90485))

## [1.2.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.1.1...shared-contracts-v1.2.0) (2026-04-03)


### Features

* **core:** incorporate granular DCP goals into data pipeline ([#273](https://github.com/taverns-red/toast-stats/issues/273)) ([dde0439](https://github.com/taverns-red/toast-stats/commit/dde04394bb22bf0c0d660e31110ce59ea711215c))


### Refactors

* split LazyCharts into individual files to fix fast refresh warning ([#251](https://github.com/taverns-red/toast-stats/issues/251)) ([9a8139d](https://github.com/taverns-red/toast-stats/commit/9a8139d7a4e3ef40f135cad9456cfba9ce145530))

## [1.1.1](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.1.0...shared-contracts-v1.1.1) (2026-03-29)


### Bug Fixes

* add ignoreDeprecations for TS7 moduleResolution=node10 deprecation ([aab7f32](https://github.com/taverns-red/toast-stats/commit/aab7f322febb51ba4f33396aad2ea7ef1b58e4ee))

## [1.1.0](https://github.com/taverns-red/toast-stats/compare/shared-contracts-v1.0.0...shared-contracts-v1.1.0) (2026-03-26)

### Features

- Add repository URL to package.json and `cspSubmitted` field to the district statistics club interface. ([617b97b](https://github.com/taverns-red/toast-stats/commit/617b97b1526e9336838acccedc3165261cfe3933))
- **analytics-core:** implement division and area data wiring with raw CSV preservation ([1750308](https://github.com/taverns-red/toast-stats/commit/175030829f19ebb3caa499d1a2dea6a3b6f008eb))
- **analytics-core:** implement per-metric rankings calculation and integration ([f857447](https://github.com/taverns-red/toast-stats/commit/f857447b81b59cf6067274f75a807b9a2023fffa))
- **backend:** complete refresh-service computation removal and analytics migration ([17dbf27](https://github.com/taverns-red/toast-stats/commit/17dbf273e48bf5c52c61821d158ce9159af4a02b))
- **shared-contracts:** establish canonical ClubHealthStatus type and resolve value mismatch ([916be21](https://github.com/taverns-red/toast-stats/commit/916be217390afdad12825f427aab2d1f42b201a2))
- **shared-contracts:** implement shared data contracts package ([3d8ce42](https://github.com/taverns-red/toast-stats/commit/3d8ce42b5f8e1a15a9e61b78f3fb4b91bbe8345c))
- **snapshot-storage:** implement GCS-backed snapshot storage provider ([f2817a6](https://github.com/taverns-red/toast-stats/commit/f2817a68e9d6628f05ffe7d784ba36f1bcb75d13))
- **snapshot-store:** implement latest snapshot pointer for O(1) cold-start resolution ([d5370ce](https://github.com/taverns-red/toast-stats/commit/d5370cef3f3d58b55c7a15feb7f7c78128110190))

### Refactors

- migrate frontend types to shared-contracts — DistrictRanking, ProgramYearWithData, AvailableRankingYearsResponse ([#130](https://github.com/taverns-red/toast-stats/issues/130)) ([8572f0f](https://github.com/taverns-red/toast-stats/commit/8572f0f1ca76ff3a5ef172c509f3075e83a695bd))
- Remove meta-level property tests for test utilities and upd… ([51fe303](https://github.com/taverns-red/toast-stats/commit/51fe303e15a6a8fc6e129de42c0304693a651ed6))
- Remove meta-level property tests for test utilities and update various existing property tests. ([36a44c1](https://github.com/taverns-red/toast-stats/commit/36a44c13ebc57e7f9629f396393c533cf1534358))
- rename scraper-cli to collector-cli across the codebase ([#99](https://github.com/taverns-red/toast-stats/issues/99)) ([eac9a3b](https://github.com/taverns-red/toast-stats/commit/eac9a3ba3d1b857e0c53efeef953584b73edae66))
