# Sprint 1229 — Per-club historical view (`/district/:districtId/club/:clubId/history`)

Epic #1228 Sprint 1. Route corrected from stub `/club/:id/history` → real nesting
`district/:districtId/club/:clubId/history` (Lesson 80: trust the router reality).

## Data source (no pipeline/contract change)

- `fetchCdnSnapshotIndex()` → this district's available snapshot dates.
- Group dates by program year via `getProgramYearForDate(d).year` (timezone-safe).
- Per **completed** PY (year frozen at Jun 30), take the **latest in-PY date** =
  year-end snapshot (this IS the nearest-prior-to-Jun-30 settled value, #621 pattern).
- `fetchCdnDistrictSnapshot<DistrictStatisticsFile>(yearEndDate, districtId)` →
  find `.clubs[]` row by `clubId` (parsed `ClubStatisticsFile`).
- Lesson 139 guard: year-end is published ~mid-July; group by max-in-PY avoids the
  program-year-equality drop. Current incomplete PY excluded.

## Columns (per program year row)

| Column                               | Field on ClubStatisticsFile                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| DCP goals met (0–10)                 | `dcpGoals`                                                                     |
| Distinguished tier (—/D/S/P/Smedley) | `distinguishedStatus` code → `distinguishedTierName` (M=Smedley, #1226 landed) |
| Membership base → end (net)          | `membershipBase` → `membershipCount` (net = diff)                              |
| Payments (Oct/Apr renewals)          | `octoberRenewals`, `aprilRenewals`                                             |
| Club status                          | `clubStatus` (Active/Suspended/Low/Ineligible)                                 |

Missing club for a year → em-dash row, never crash (AC). Absent `distinguishedStatus` → em-dash tier.

## Build order (TDD, commit per step, ref #1229)

1. `utils/clubHistory.ts` — `ClubHistoryRow` type + `buildClubHistoryRow(startYear, yearEndDate, club?)` pure fn + `resolveClubTier(code?)`. RED→GREEN unit tests (incl. missing-year, Smedley, word-form, single-year).
2. `hooks/useClubHistory.ts` — enumerate PYs, fetch year-end snapshots, extract club row. Tests mock cdn services (incl. nearest-prior = max-in-PY).
3. `components/ClubHistoryTable.tsx` — TanStack sortable table, tier badge, CSV export, sticky id col, responsive, dark-mode. (Comparison-across-rows → keep table per Lesson 105.)
4. `pages/ClubHistoryPage.tsx` — breadcrumb (District › Clubs › Club › History), empty/single-year/error states.
5. `App.tsx` route + History link from ClubDetailPage hero.
6. CSV export helper in `csvExport.ts`.
7. Lesson + product-spec update. Playwright preview verify (Chromium + WebKit).

## DoD

Full DoD. Verify on PR preview channel. Lessons: 80 (route), 105 (table-not-cards),
123 (clubPerformance tier), 139 (year-end July lag), 117 (no duplicate tier map).
