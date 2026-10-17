# Region membership series fixture (#2127)

Recorded from the prod CDN (`https://cdn.taverns.red/time-series/`) on
2026-10-17 (single-object reads), then projected with `jq` to the fields the
region-membership-series builder reads (`districtId`, `programYear`,
`dataPoints[].date`, `dataPoints[].membership`, `sourceGapDates` when present).
Nothing else is edited.

- `time-series/district_{75,76,80,87,93}/2025-2026.json` — every district the
  history places in Region 09 for 2025-26, so the region is whole.
- `time-series/district_61/2025-2026.json` — Region 05 for 2025-26 (only one
  of its twelve districts is present here).
- `time-series/district_U/2025-2026.json` — the undistricted bucket, which the
  history does not place in any region.

No recorded file carries `sourceGapDates` (prod has none for 2025-26); the
gap tests add one in memory and say so.

Region membership comes from the region-rollups fixture's real history
(`../region-rollups/config/district-region-history.json`, asOf 2026-10-12).

Do not regenerate from the live CDN; the expected sums in the tests were
computed from these bytes.
