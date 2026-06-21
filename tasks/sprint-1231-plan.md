# Sprint 3 / #1231 — Area Director Action List

Route `/district/:districtId/action-list`. Reuse-only (no new analytics).

## Data sources (all existing)

- **Close-to-Distinguished**: `useDistrictAnalytics().allClubs` → `calculateClubProjection(club)` → `isCloseToDistinguished({projection, cspSubmitted})`. Gap = `projection.gapToDistinguished.{members,goals}`.
- **Visit gaps**: `useDistrictStatistics(id,date,'divisions')` → `extractDivisionPerformance(stats, stats.asOfDate)` → `DivisionPerformance[]`. Per `AreaPerformance`: `currentRound`, `recognitionState`, `clubsMissingCurrentRoundVisit` (deadline-aware, already derived). Area is a gap when `clubsMissingCurrentRoundVisit.length > 0`.
- **Intervention-required**: `useDistrictAnalytics().interventionRequiredClubs` (ClubTrend, `currentStatus==='intervention-required'`).

## Modules

1. `utils/actionListData.ts` — pure `buildActionList(input, scope)` → 3 section arrays. Unit-tested (no page mount). Scope `{division?, area?}` filters by `divisionId`/`areaId`. (R3: page owns scope, passes as arg.)
2. `config/districtSections.ts` — add `{ label: 'Action List', segment: 'action-list' }` (end). Update `DistrictSubnav.test` pinned list; `errorRecovery.test` derives automatically.
3. `pages/DistrictActionListPage.tsx` — hooks → util → presentational sections. URL-synced scope via `useUrlState('division'/'area')` (page-owned, L124/L144). CSV export via `csvExport`. Dark-mode + responsive (reuse subpage chrome).
4. `App.tsx` — lazy route.
5. Tests: util unit test (membership + empty states); page test in `pages/__tests__/` (URL scope sync, sections render, links resolve to canonical club/area pages, empty states).

## Acceptance crit mapping

- Route renders 3 sections from existing predicates ✓ (modules 1,3)
- Concrete gap reused, never re-derived (R3) ✓ — `gapToDistinguished` straight from projection
- Visit-gap reuses deadline-aware `recognitionState`/`currentRound` (no forked rule) ✓
- Tests cover membership + empty states; links resolve ✓
- Verified on PR preview (Playwright, both engines) ✓
