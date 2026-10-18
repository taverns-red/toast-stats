# Clubs-by-region fixture (#1800)

Recorded from `gs://toast-stats-data-staging` on 2026-10-17 with single-object
reads (`gcloud storage cat … | gunzip | jq`), streamed straight into the
projection below, so no unprojected copy touched disk.

- `snapshots/2026-10-16/district_{17,49,61,U}.json` — `data.clubs[]` projected
  to the fields the clubs-by-region builder reads: `clubId, clubName,
divisionId, areaId, membershipCount, membershipBase, paymentsCount,
aprilRenewals, dcpGoals, status, clubStatus, cspSubmitted, coordinates`
  and `address.{city,country}`. Contact, link and meeting fields (website,
  social links, `location`, meeting day/time/schedule) and the street address
  are dropped. Values are not edited. Four districts from four buckets: 17
  (Region 12), 49 (Region 01), 61 (Region 05, two clubs without coordinates)
  and the undistricted `U` (no region, two clubs without coordinates).
- `snapshots/2026-10-16/all-districts-rankings.json` — the real file with the
  `rankings` rows cut to those four districts.
- `snapshots/2026-10-16/region-rollups.districts.json` — the pipeline's own
  `region-rollups.json` for the date, cut to the four district rows (`world`
  and `regions` removed). The builder's health and tier classification is
  tested against it.
- `config/district-region-history.json` — the real history (asOf
  2026-10-16), unprojected. District 61 is Region 09 in 2018-19 → 2023-24 and
  Region 05 from 2024-25, which the program-year test relies on.

Do not regenerate from the live bucket; the expected counts in the tests were
computed from these bytes.
