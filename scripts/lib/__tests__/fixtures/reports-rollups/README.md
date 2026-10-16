# Reports rollups fixture (#2012)

Recorded from `gs://toast-stats-data-ca` (prod) on 2026-10-16, single-object
reads, then projected with `jq` and written compact. Nothing else is edited.

- `snapshots/2026-10-15/district_61_reports.json` — the real D61 daily-reports
  sidecar (collected 2026-10-16, program year 2026-2027). Kept: the sections the
  builder reads (`aprilDuesRenewal`, `octoberDuesRenewal`, `officerList`,
  `prospectiveClubs`, `coaches`, `sponsorsMentors`). Every `name`, `clubName`
  and `location` value is blanked to `""`. The sidecar carries no person names
  (the sponsors/mentors section is already counts, #1795).
- `snapshots/2026-10-15/all-districts-rankings.json` — that date's rankings,
  `metadata` plus the real `61` row, unedited (the other 93 rows dropped).
- `config/district-region-history.json` — the real prod history (asOf
  2026-10-15), `districts` and `conflicts` projected to `61` and `86` (both in
  Region 05 for 2026-27; `86` is used by the tests as a district without a
  sidecar).

Do not regenerate from the live bucket; the expected counts in the tests were
computed from these bytes with jq.
