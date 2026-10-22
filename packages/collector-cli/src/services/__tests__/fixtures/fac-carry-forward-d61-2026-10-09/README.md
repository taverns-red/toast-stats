# fac-carry-forward-d61-2026-10-09 — an enriched snapshot (#2237)

`district_61.json` is `gs://toast-stats-data-ca/snapshots/2026-10-09/district_61.json`
(read once, read-only, 2026-10-22), trimmed with jq to three clubs:

- `3045` and `9560`: matched by the 2026-10-10 daily's Find-A-Club merge, so
  their `clubs[]` and `clubPerformance[]` rows carry the FAC fields. The
  `clubPerformance` ids are zero-padded (`00003045`), the `clubs[]` ids are
  not: the carry-forward joins them through `normalizeClubId`.
- `28678196`: in the snapshot but not in FAC (snapshot-only), so no FAC field.

`divisionPerformance` / `districtPerformance` are kept for the same clubs,
`divisions` / `areas` cut to one entry each, `prospectiveClubs` to two.
Every value is verbatim. The file holds no email or phone (#2026).
