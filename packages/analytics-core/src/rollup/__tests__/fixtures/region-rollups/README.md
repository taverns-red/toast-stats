# Region rollups fixture (#1799)

Recorded from `gs://toast-stats-data-staging` on 2026-10-13 (single-object
reads), then projected with `jq` to the fields the region-rollups builder reads.
Person-level fields (email, phone, address, coordinates, meeting details) are
dropped; nothing else is edited.

- `snapshots/2026-06-30/` — the 2025-26 June close. Its rankings were collected
  on 2026-07-25 (`metadata.snapshotId`), so the program year must come from the
  directory date. Rankings rows kept: `01`, `111`, `68`, `U` (real rows, the
  other 124 dropped). District files: those four plus `district_201.json`, a
  renumbered 2026-27 district stamped onto this date (#1465) that holds most of
  District 01's clubs. It is out of the date's district set.
- `snapshots/2026-10-12/` — District 61 only (rankings row `61`), the daily
  feed era with `data.prospectiveClubs`.
- `config/district-region-history.json` — the real history the identity-history
  builder wrote (staging `derived/` copy, asOf 2026-10-12), unprojected.

Do not regenerate from the live bucket; the expected counts in the tests were
computed from these bytes.
