# EPIC: Program Year selection correctness (frontend)

**Status:** Groomed 2026-07-03 · target META_EPIC #606
**Merges two asks** (per operator "merge into prior EPIC if that makes sense"):
the PY-selector gap and the premature program-year rollover — both live in the
same `programYear` hooks + `DataControlsBar` subsystem and are interdependent,
so they ship as one epic with sequenced workstreams.

## Problem

Two related defects in how the frontend handles the Toastmasters program year
(July→June):

1. **Premature calendar rollover.** The default program year is calendar-based
   (`getCurrentProgramYear()` → `new Date()`), so on 2026-07-01 it flips to PY
   2026-2027 — which has **no data yet** (June 2026 is still in month-end
   reconciliation and belongs to PY 2025-2026, see closing-period work #1284 /
   #1289 / #1292). The app should stay on the latest program year that actually
   has data until the new year publishes.

2. **Missing PY selector on PY-scoped pages.** Several pages show
   program-year-scoped data but give the user no way to choose the year (and
   default to the empty/current calendar year). The district hub + subnav pages
   have the selector (`DataControlsBar`); these do not.

## Evidence (verified)

- **Release PR #1253 is blocked** by `DistrictClubsPage.test.tsx:277`:
  club-nav state captured `?status=vulnerable&py=2025` instead of
  `?status=vulnerable` — the app appended `py=2025` because 2025 is no longer
  the calendar-current PY. A data-driven default makes 2025 the default again
  (param omitted) → the test passes at the source.
- `useUrlProgramYear` deletes `?py=` when the selected year equals
  `getCurrentProgramYear().year`, else sets it → the rollover changes URL
  behavior repo-wide.
- `useAvailableProgramYears` already sorts program years by data and exposes the
  newest PY-with-snapshots (`availableProgramYears[0]`) — the data-driven answer
  is already computable; it's just not used as the default.

## Root cause

`getCurrentProgramYear()` (calendar) is the default in `ProgramYearContext`
(init) and the comparator in `useUrlProgramYear` (URL param include/delete). The
default is established **before** data availability is known;
`DistrictDetailPage` has a late-correction `useEffect` that patches it after
render, but the initial default is still wrong and other pages lack even that.

## Solution

Introduce a **data-driven default program year** = the latest PY that has
snapshots (from `useAvailableProgramYears`), and thread it through
`ProgramYearContext` + `useUrlProgramYear` in place of the calendar year. Keep
`getCurrentProgramYear()` only where the _calendar_ year is genuinely meant
(e.g. "exclude the current, in-progress PY" in history summaries). Then bring
every PY-scoped page onto the shared selector so the choice is consistent.

## Workstreams / sprint breakdown

### Sprint 1 — Data-driven default program year (root cause; unblocks #1253)

- Add `useDefaultProgramYear()` returning `availableProgramYears[0]` (latest PY
  with data), falling back to `getCurrentProgramYear()` only when no data yet.
- Consume it in `ProgramYearContext` init and `useUrlProgramYear` (param
  include/delete comparator) so the default is the data-driven year, not the
  calendar year. Self-healing: switches to the new PY the day it publishes.
- Audit + fix all program-year-coupled tests. **Verified breakage:**
  `DistrictClubsPage.test.tsx:277`. **Candidates to confirm in-sprint:**
  `useUrlProgramYear.test.ts:49`, `useClubHistory.test.tsx:151`,
  `useProgramYearSummaries.test.tsx:109` (these reference `getCurrentProgramYear`
  or hardcode the year). Prefer fixing via the data-driven semantics; pin the
  clock (`vi.setSystemTime`, cf. #1285) only where a test genuinely asserts the
  _calendar_ helper.
- **DoD includes: PR #1253's Test Suite passes** (release unblocked).

### Sprint 2 — PY selector on region/aggregate pages

Add the shared PY selector (`DataControlsBar` or its PY chip) to:

- `RegionsPage` (`/regions`), `RegionPage` (`/region/:n`) — the pages the
  operator named.
- `AwardsPage` (`/awards`) — competitive standings are PY-scoped.

### Sprint 3 — PY selector on division/area/club pages

- `DivisionPage`, `AreaPage` (currently hardcode "latest snapshot only").
- `ClubDetailPage` (reads `?py=` but renders no selector — users must edit the
  URL / use back).
- `ClubHistoryPage` (multi-year table; add a per-year focus/selector).

## Explicitly out of scope (genuinely not PY-scoped)

`MethodologyPage`, `McpPage`, `HistoryPage` (archive of all completed years),
`DistrictChangesPage` (arbitrary date-pair compare), and redirect-only pages.

## Selector inventory (from exploration)

- **Has selector (9):** DistrictsPage + district subnav (detail, clubs,
  divisions, rankings, grid, action-list, trends, analytics).
- **Gap — PY data, no selector (7):** RegionsPage, RegionPage, AwardsPage,
  DivisionPage, AreaPage, ClubDetailPage, ClubHistoryPage.
- **N/A (non-PY / latest-archive / redirects):** Methodology, Mcp, History,
  DistrictChanges, DivisionRedirect/Area/Club redirects.
  </content>
