# Changelog

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
