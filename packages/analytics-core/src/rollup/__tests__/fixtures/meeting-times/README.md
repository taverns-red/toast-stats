# Meeting-times fixture (#1814)

Recorded from the prod CDN (`https://cdn.taverns.red`) on 2026-10-20 with
single-object reads (`curl --compressed … | jq`), streamed straight into the
projection below, so no unprojected copy touched disk.

- `snapshots/2026-10-19/district_{17,49,61,U}.json` — `data.clubs[]`
  projected to `clubId` and the parsed `meetingSchedule[]` (#1789) only.
  No name, free-text day/time, location, website, email, phone or link.
  Values are not edited. Four districts from four buckets: 17 (Region 12),
  49 (Region 01), 61 (Region 05) and the undistricted `U` (no region).
- `snapshots/2026-10-19/all-districts-rankings.json` — the real file with the
  `rankings` rows cut to those four districts.

Region membership comes from the clubs-by-region fixture's recorded history
(`../clubs-by-region/config/district-region-history.json`, asOf 2026-10-16).

The expected counts in `meetingTimes.test.ts` were taken with jq over these
bytes, not from the builder. Do not regenerate from the live CDN.
