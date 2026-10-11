# date-completeness fixtures (#1761, ADR-015 step 3)

Recorded 2026-10-11 from single-object reads of
`gs://toast-stats-data-ca/snapshots/2026-10-10/{manifest,metadata,global-totals,district_02}.json`
(`gcloud storage cat | gunzip`; no listing of contents, no mirror).

- `prod-district_02.json` — the real file trimmed to three clubs: two
  Find-a-Club-enriched records (`clubs[]` 28 keys, `clubPerformance[]` 36
  keys) and one the FAC did not match (17 / 25 keys). Contact values
  (`email`, `phone`, `website`, `facebookLink`) are replaced with
  placeholders; keys and types are unchanged.
- `staging-district_02.json` — the same clubs as a non-daily re-run writes
  them (D-1, #1758): the 11 keys `FindAClubMerger` adds are absent and so is
  `data.prospectiveClubs`. The stripped key set equals the real unenriched
  record's key set in the same prod file, so this is the observed shape, not
  an invented one.
- `prod-global-totals.json` — verbatim (`clubsByCountry.countries` has 158
  rows). `staging-global-totals.json` — the same with `countries: []` and
  every club `unknown`, which is what `buildGlobalTotals` writes without FAC.
- `prod-manifest.json` — verbatim except `districts[]` trimmed to two rows.
- `prod-metadata.json` — verbatim.
