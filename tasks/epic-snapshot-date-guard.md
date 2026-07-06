# Epic — Systemic snapshot-date guard (sourceCsvDate ≠ snapshotDate)

**Status:** groomed, not yet queued. **Scope:** frontend + frontend test infra.
**Class:** systemic-guard epic — the goal is that a 5th recurrence of the
closing-window date-conflation bug _cannot ship_, not merely that the 4 known
instances stay fixed.

## Problem

Toastmasters' month-end "closing" reconciliation pins a snapshot to the
month-end date while the dashboard **as-of** date (`sourceCsvDate`) keeps
advancing. Verified live on 2026-07-06:

- `v1/latest.json` → `latestSnapshotDate: 2026-06-30` (pinned)
- `v1/rankings.json` → `date: 2026-07-05` (this **is** the sourceCsvDate)
- `snapshots/2026-06-30/all-districts-rankings.json` →
  `metadata.sourceCsvDate: 2026-07-05` (and `metadata.snapshotId: 2026-07-05` —
  the metadata's own "snapshotId" is _also_ the as-of date, a pipeline-side
  naming landmine)

Per-snapshot CDN files are stored under the **snapshot date**
(`snapshots/{snapshotDate}/…`), but `fetchCdnRankingsForDate` returns
`{ rankings, date }` where `date` is the **sourceCsvDate**
(`frontend/src/services/cdn.ts:154` — `date: raw.metadata?.sourceCsvDate || date`).
The two values are equal ~340 days a year and diverge for ~1–3 weeks each
close, so any code keying a per-snapshot fetch on `data.date` passes every test
and every mid-month manual check, then 404s → `null` → **blank UI, no error**
during closing.

**Recurrences (all fixed, all the same root cause):** #1289 (promote-gate
base-drift), #1292 (counter cap), #1296 (freshness badge wrong date), #1315
(RegionPage keyed `useCompetitiveAwards(data?.date)` → blank
Distinguished-District countdown/tier columns).

## Root cause

One field name — `date` — carries two divergent meanings across the CDN read
layer, and nothing (type, name, test fixture) distinguishes them:

1. **API shape:** `CdnRankingsData.date` is silently the sourceCsvDate
   (`cdn.ts:120,154`), while every `snapshots/{date}/…` fetch parameter means
   the snapshot date. The compiler is happy to feed one into the other.
2. **Test blind spot:** fixtures set `sourceCsvDate === snapshotDate` unless a
   test deliberately diverges them, so the wrong keying is unobservable in the
   default test world (that's why RegionPage's existing tests missed #1315).
3. **Phantom field (new finding, this audit):** the frontend type
   `DistrictStatistics.asOfDate` (`frontend/src/types/districts.ts:70`) **does
   not exist in the live CDN file**. Verified against
   `snapshots/2026-06-30/district_61.json`: envelope keys are `districtId,
districtName, collectedAt, status, data`; `data` carries `snapshotDate`, no
   `asOfDate` at any level (matches `PerDistrictData` /
   `DistrictStatisticsFile` in `packages/shared-contracts/src/types/…` and the
   sole pipeline writer, `TransformService.ts:1335`). Every
   `snapshot.asOfDate` read is `undefined` at runtime.

## Audit — every per-snapshot fetch / date-scoped call site

### A. Per-snapshot fetch keying (the #1315 class)

| Call site                                                                                             | Date source                                                                                                                                     | Verdict                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `frontend/src/pages/RegionPage.tsx:286` `fetchCdnRankingsForDate(effectiveDate)`                      | `useProgramYearControls().effectiveDate` (from `dates.json`)                                                                                    | **SAFE**                                                                                               |
| `frontend/src/pages/RegionPage.tsx:299` `useCompetitiveAwards(effectiveDate)`                         | `effectiveDate`                                                                                                                                 | **SAFE** (the #1315 fix; regression test at `pages/__tests__/RegionPage.programYear.test.tsx:128-144`) |
| `frontend/src/pages/RegionsPage.tsx:52` `fetchCdnRankingsForDate(effectiveDate)`                      | `effectiveDate`                                                                                                                                 | **SAFE**                                                                                               |
| `frontend/src/pages/DistrictsPage.tsx:270` `fetchCdnRankingsForDate(effectiveRankingsDate)`           | `selectedDate ?? max(cachedDates)` (from `dates.json`)                                                                                          | **SAFE**                                                                                               |
| `frontend/src/pages/DistrictsPage.tsx:292` `useCompetitiveAwards(effectiveRankingsDate)`              | same                                                                                                                                            | **SAFE**                                                                                               |
| `frontend/src/pages/AwardsPage.tsx:70` `useCompetitiveAwards(effectiveDate)`                          | `useProgramYearControls().effectiveDate`                                                                                                        | **SAFE**                                                                                               |
| `frontend/src/pages/DistrictDetailPage.tsx:251` `useCompetitiveAwards(effectiveEndDate ?? undefined)` | `effectiveEndDate` from `allCachedDates` (`DistrictDetailPage.tsx:130-144`)                                                                     | **SAFE**                                                                                               |
| `frontend/src/hooks/useCompetitiveAwards.ts:23` `date ?? manifest.latestSnapshotDate`                 | manifest (pinned)                                                                                                                               | **SAFE**                                                                                               |
| `frontend/src/hooks/useMembershipData.ts:33-34` (`useDistrictStatistics`)                             | `selectedDate ?? manifest`                                                                                                                      | **SAFE**                                                                                               |
| `frontend/src/hooks/useMembershipData.ts:56-58` (`useMembershipHistory`)                              | manifest                                                                                                                                        | **SAFE**                                                                                               |
| `frontend/src/hooks/useDistrictAnalytics.ts:245-256`                                                  | `endDate ?? manifest`; all callers pass `effectiveEndDate` (Division/Area/ClubDetail/Trends/Analytics/Clubs/Grid/ActionList pages)              | **SAFE**                                                                                               |
| `frontend/src/hooks/useEducationalAwards.ts:20`                                                       | manifest                                                                                                                                        | **SAFE**                                                                                               |
| `frontend/src/hooks/useClubs.ts:17`                                                                   | manifest                                                                                                                                        | **SAFE**                                                                                               |
| `frontend/src/hooks/useClubHistory.ts:94`                                                             | per-PY latest from snapshot index                                                                                                               | **SAFE**                                                                                               |
| `frontend/src/hooks/useSnapshotDiff.ts:49-50`                                                         | `from`/`to` URL date pair                                                                                                                       | **SAFE**                                                                                               |
| `frontend/src/hooks/usePerformanceTargets.ts:170`                                                     | `snapshotDate ?? manifest`                                                                                                                      | **SAFE**                                                                                               |
| `frontend/src/hooks/useLeadershipInsights.ts:93-95`                                                   | manifest                                                                                                                                        | **SAFE**                                                                                               |
| `frontend/src/hooks/useDistinguishedClubAnalytics.ts:78-80`                                           | manifest                                                                                                                                        | **SAFE**                                                                                               |
| `frontend/src/hooks/useClubTrends.ts:94-96`                                                           | manifest                                                                                                                                        | **SAFE**                                                                                               |
| `frontend/src/utils/csvExport.ts:508-513` + `frontend/src/hooks/useDistrictExport.ts:48`              | manifest for the fetch; `sourceCsvDate` only in the "Data As Of" label (`csvExport.ts:559`, `useDistrictExport.ts:94`)                          | **SAFE**                                                                                               |
| `frontend/src/hooks/useProgramYearSummaries.ts:77-88`                                                 | fetch keyed on `yearEndDate` from `dates.json`; the returned `date` used **only** for the fallback lag check, deliberately reconciliation-aware | **SAFE (intentional as-of use)**                                                                       |

### B. As-of used as as-of (correct, but only by convention)

| Call site                                                                                                                                           | Verdict                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/DistrictsPage.tsx:887`, `pages/RegionsPage.tsx:131`, `pages/RegionPage.tsx:426` — `asOfDate={data?.date}` → `DataControlsBar` freshness pill | **CORRECT** (this is the as-of display slot) — but nothing except a comment stops the reverse mistake                                  |
| `frontend/src/hooks/useLatestAsOfDate.ts:45` — `asOfDate: rankings?.date`                                                                           | **CORRECT** by design (documented)                                                                                                     |
| `frontend/src/utils/dataFreshness.ts:36-50` — takes both, compares them                                                                             | **CORRECT** (the #1296 fix)                                                                                                            |
| `pages/DistrictsPage.tsx:435-445` — `useLastVisit({ currentDate: data?.date })` persists the sourceCsvDate as `lastSeenDate`                        | **AS-OF-OK** (as-of change ⇒ visible data changed, incl. daily closing refreshes) but the semantics are unlabeled — rename in Sprint 1 |

### C. UNSAFE / latent — new findings from this audit

| Call site                                                                                                                                                                              | Problem                                                                                                                                                                                                                                                                                                                                                                                           | Verdict                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `frontend/src/types/districts.ts:70` `asOfDate: string` on `DistrictStatistics`                                                                                                        | **Phantom field** — not present in the live CDN JSON (verified 2026-07-06)                                                                                                                                                                                                                                                                                                                        | **UNSAFE (lying type)**  |
| `frontend/src/pages/DivisionPage.tsx:68` and `frontend/src/pages/AreaPage.tsx:78-79` — `extractDivisionPerformance(snapshot, snapshot.asOfDate)`                                       | `snapshot.asOfDate` ⇒ `undefined` ⇒ `utils/extractDivisionPerformance.ts:393` falls back to `todayIso()` ⇒ `getCurrentVisitRound(wallclock)` (`:681`). During the July closing window the wall clock is in the **next program year** while the pinned snapshot is June 30 — visit-round/deadline derivation flips to the new PY against old data. Same divergence class as #1315, live right now. | **UNSAFE (latent)**      |
| `frontend/src/pages/DistrictActionListPage.tsx:192` — `extractDivisionPerformance(districtStatistics, districtStatistics.asOfDate)`                                                    | same phantom ⇒ `todayIso()` fallback                                                                                                                                                                                                                                                                                                                                                              | **UNSAFE (latent)**      |
| `frontend/src/pages/DistrictActionListPage.tsx:206` — `snapshotDate: districtStatistics?.asOfDate ?? effectiveEndDate ?? ''` → `getAreaVisitDeadlines` (`utils/actionListData.ts:113`) | lands on `effectiveEndDate` — **safe only by accident** of the phantom being undefined                                                                                                                                                                                                                                                                                                            | **FRAGILE**              |
| `pages/DivisionPage.tsx:162`, `pages/AreaPage.tsx:181`, `pages/ClubDetailPage.tsx:514` — `asOfDate={snapshot?.asOfDate}`                                                               | always `undefined` ⇒ the freshness pill on Division/Area/Club never shows the as-of date (contradicts `useLatestAsOfDate.ts` doc comment)                                                                                                                                                                                                                                                         | **BROKEN (display gap)** |
| `frontend/src/services/cdn.ts:139-157` `fetchCdnRankingsForDate` return `date`                                                                                                         | the root API flaw — field named `date` is the sourceCsvDate; three call sites re-spread it (`useDistrictRanking.ts:19`, `RegionPage.tsx:288`, `DistrictsPage.tsx:273`, `RegionsPage.tsx:54`)                                                                                                                                                                                                      | **THE ROOT**             |

Pipeline-side note (out of scope here, file separately if pursued):
`TransformService.ts:1078-1083` writes `metadata.snapshotId = sourceCsvDate`
into a folder named by the pinned snapshot date — same naming landmine one
layer down.

## Guard design

Three candidate layers were weighed:

1. **API-shape fix (rename/remove).** Delete the ambiguous `date` field from
   the rankings fetch return; expose `asOfDate` (and `snapshotDate` where the
   function actually knows it — `fetchCdnRankingsForDate`'s own argument).
   _Pro:_ the compiler enumerates every consumer at the moment of change; the
   antipattern (`data.date` → fetch key) becomes **unwritable** because the
   field no longer exists. _Con:_ one-time churn across ~6 files.
2. **Test-layer guard.** (a) Make shared CDN fixtures diverge
   `sourceCsvDate ≠ snapshotDate` **by default**, so every page test runs in
   the closing window; (b) per-consumer divergence render tests (the
   `RegionPage.programYear.test.tsx:128-144` pattern). _Pro:_ catches semantic
   misuse types can't see (e.g. wall-clock/PY-scoped logic — the Section C
   class); guards future consumers who bypass the typed layer. _Con:_ per-test
   maintenance; a genuinely new hook with its own fixture could still opt out.
3. **Branded `SnapshotDate` type.** Nominal brand on the snapshot-date string;
   `snapshots/{date}/…` service functions require it; only validated sources
   (dates.json-derived `effectiveDate`, manifest `latestSnapshotDate`) mint it.
   _Pro:_ permanent compile-time wall, covers hooks added years from now.
   _Con:_ churn at every boundary; `as SnapshotDate` casts can rot the guarantee
   unless lint-banned.

**Chosen: layered 1 + 2, then 3 as hardening.** Layer 1 kills the existing
antipattern at its source and is prerequisite cleanup for the brand. Layer 2 is
the only layer that catches the _semantic_ variant (Section C: right type,
wrong meaning — `todayIso()`/as-of flowing into PY-scoped logic). Layer 3 makes
the fetch-keying variant unrepresentable for all future code. A lint/AST check
for `data.date → hook` was rejected as redundant: after Sprint 1 the field
doesn't exist, and the brand rejects any workalike.

## Sprint breakdown

Each sprint is a self-contained single-session unit, TDD-shaped, releasable on
its own. Order matters: 1 → 2 → 3 → 4.

### Sprint 1 — Remove the ambiguous `date` from the rankings fetch API

**Change set**

- `frontend/src/services/cdn.ts:97-157` — `CdnRankingsData` loses `date`; gains
  `asOfDate: string` (from `metadata.sourceCsvDate`, or `raw.date` on the
  `v1/rankings.json` path) and `snapshotDate?: string` (set on the
  `fetchCdnRankingsForDate` path to **its own `date` argument**; `undefined` on
  the `fetchCdnRankings()` fallback/latest path, which doesn't know it —
  consumers must key fetches on their page-owned `effectiveDate` per R3, never
  on this return).
- Consumers (the compiler will enumerate; known set):
  `pages/RegionPage.tsx:288,426` · `pages/RegionsPage.tsx:54,131` ·
  `pages/DistrictsPage.tsx:273,435-445,887` · `hooks/useDistrictRanking.ts:19`
  · `hooks/useProgramYearSummaries.ts:77-88` (lag check reads `asOfDate`) ·
  `hooks/useLatestAsOfDate.ts:45` (reads `asOfDate` — comment updates) — plus
  their tests.
- `pages/DistrictsPage.tsx:435` — pass `currentAsOfDate` (renamed prop) into
  `useLastVisit`; rename `lastSeenDate` semantics doc in
  `hooks/useLastVisit.ts:1-13` (behavior unchanged — as-of comparison is the
  intended "data changed since last visit" signal).

**TDD**

- Red: unit test on `cdn.ts` — `fetchCdnRankingsForDate('2026-06-30')` with a
  fixture whose `metadata.sourceCsvDate = '2026-07-05'` returns
  `{ snapshotDate: '2026-06-30', asOfDate: '2026-07-05' }` and **has no `date`
  property**; type-level `@ts-expect-error` on `.date` access.
- Green: rename; fix compile errors one consumer at a time.

**Acceptance criteria**

- [ ] `CdnRankingsData` has no `date` field; `grep -rn "\.date\b"` over
      rankings-query consumers returns 0 fetch/key/comparison uses.
- [ ] Every `DataControlsBar asOfDate=` on Districts/Regions/Region pages is
      fed from `asOfDate`.
- [ ] Full suite green; no behavior change outside naming (pill shows the same
      dates as before).

### Sprint 2 — Excise the phantom `DistrictStatistics.asOfDate`; key division/area date logic on the snapshot date

**Change set**

- `frontend/src/types/districts.ts:70` — delete `asOfDate` (or retype the
  envelope truthfully; the live file has `data.snapshotDate` only).
- `frontend/src/utils/extractDivisionPerformance.ts:389-393` — make the
  `snapshotDate` param **required**; delete the `?? todayIso()` fallback (it is
  the wall-clock backdoor into `getCurrentVisitRound` at `:681`).
- Callers pass the page's snapshot date:
  `pages/DivisionPage.tsx:68` and `pages/AreaPage.tsx:78-79` →
  `effectiveEndDate` (both already have it from
  `useDistrictProgramYearControls`); `pages/DistrictActionListPage.tsx:192,206`
  → `effectiveEndDate`; audit remaining callers via
  `grep -rn "extractDivisionPerformance(" frontend/src` (known:
  `utils/diffAreaDivisionStatus.ts:115` already passes `snapshot.snapshotDate`
  — safe).
- Freshness pill on Division/Area/Club: replace the always-undefined
  `asOfDate={snapshot?.asOfDate}` (`DivisionPage.tsx:162`, `AreaPage.tsx:181`,
  `ClubDetailPage.tsx:514`) with the `DistrictDetailHeader.tsx:46,81` pattern —
  `useLatestAsOfDate()` gated on `isLatestSnapshot`.

**TDD**

- Red: render test for DivisionPage/AreaPage with fake timers in July
  (wall clock `2026-07-06`), snapshot fixture pinned `2026-06-30` — assert the
  visit round/deadline derives from the **snapshot's** program year (R2 /
  May 31), not the wall clock's new PY. This fails today via the `todayIso()`
  fallback. Second red: pill shows the global as-of date on the latest
  snapshot (fails today — currently blank).
- Green: change set above.

**Acceptance criteria**

- [ ] `grep -rn "asOfDate" frontend/src/types/districts.ts` → 0;
      `snapshot.asOfDate` / `districtStatistics.asOfDate` reads → 0.
- [ ] `extractDivisionPerformance` has no wall-clock fallback; TS forces a date
      at every call site.
- [ ] Divergence-window render tests pass; full suite green.

### Sprint 3 — Divergence-by-default fixtures + per-consumer reconciliation tests

**Change set**

- `frontend/src/__tests__/integration/utils/mockCdnData.ts` (+ any per-page
  local rankings mocks): default fixtures set
  `metadata.sourceCsvDate = snapshotDate + 5 days` so **every** page test runs
  inside the closing window; fixture docstring names the invariant and links
  the lesson. Tests that assert equal-date behavior must opt in explicitly.
- Add divergence-scenario tests (mirror
  `pages/__tests__/RegionPage.programYear.test.tsx:128-144`) for each
  per-snapshot consumer that lacks one: `DistrictsPage` awards keying
  (`:270,292`), `AwardsPage` (`:70`), `DistrictDetailPage` trophy case
  (`:251`), Division/Area visit-round gating (locks Sprint 2 in).
- Mutation check as part of the sprint's verification (not CI): temporarily
  revert the #1315 fix locally and confirm the new suite fails.

**Acceptance criteria**

- [ ] Default mock rankings fixtures have `sourceCsvDate ≠ snapshotDate`.
- [ ] Each consumer listed above has a test asserting the per-snapshot fetch
      was called with the snapshot date and **not** the as-of date.
- [ ] Suite green; no `testTimeout` bumps; no quarantine entries.

### Sprint 4 — Branded `SnapshotDate` at the service layer (hardening)

**Change set**

- New `frontend/src/types/snapshotDate.ts`: `type SnapshotDate = string &
{ readonly __brand: 'SnapshotDate' }` + the **only** mint points:
  `snapshotDatesFrom(datesIndex)`, `snapshotDateFromManifest(manifest)`, and a
  validating `toSnapshotDate(raw)` for URL-sourced dates (`?date=`,
  `useUrlDatePair`).
- Require `SnapshotDate` on every `snapshots/{date}/…` entry point in
  `services/cdn.ts`: `fetchCdnRankingsForDate` (`:139`),
  `fetchCdnCompetitiveAwards` (`:327`), `cdnAnalyticsUrl` (`:347`),
  `cdnSnapshotUrl` (`:358`), `cdnDistrictReportsUrl` (`:388`),
  `fetchCdnDistrictSnapshot` (`:429`), `fetchCdnDistrictAnalytics` (`:442`).
- `useProgramYearControls().effectiveDate` (`hooks/useProgramYearControls.ts:106-112`)
  and `useDistrictProgramYearControls().effectiveEndDate`
  (`DistrictDetailPage.tsx:130-144` extraction lives in
  `hooks/useDistrictProgramYearControls.ts`) return `SnapshotDate | undefined`.
  `asOfDate` values stay plain `string` — passing one no longer compiles.
- ESLint `no-restricted-syntax` rule banning `as SnapshotDate` /
  `<SnapshotDate>` outside `types/snapshotDate.ts` (keeps the brand honest).

**TDD**

- Red: type-test file with `// @ts-expect-error` cases — `asOfDate` into
  `useCompetitiveAwards`; raw string into `fetchCdnCompetitiveAwards`;
  plus a runtime test that `toSnapshotDate` rejects non-`YYYY-MM-DD`.
- Green: brand + mint + signature changes; fix call sites (mostly zero-runtime
  churn since the safe sites already flow from the mint sources).

**Acceptance criteria**

- [ ] All seven `cdn.ts` per-snapshot entry points require `SnapshotDate`.
- [ ] `grep -rn "as SnapshotDate" frontend/src --include="*.ts*" | grep -v types/snapshotDate` → 0, and the lint rule enforces it.
- [ ] Type-tests + full suite + `npm run quality:check` green.

## Definition of done (epic)

- All four sprints merged; each verified on its PR preview channel pre-merge.
- During the next closing window (or by fixture): Region/Districts/Awards/
  District-detail/Division/Area pages render complete data with
  `sourceCsvDate > snapshotDate`.
- Lesson INDEX regenerated if any sprint files a new lesson
  (`npm run lessons:index`).

## Relevant lessons

- [Key per-snapshot fetches on the snapshot date, not the as-of sourceCsvDate](tasks/lessons/lessons/key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate.md) — the canonical statement of this bug class (#1315, recurrence #4)
- [Pin related queries to the same snapshot date](tasks/lessons/lessons/pin-related-queries-to-same-snapshot-date.md) — why the awards query is threaded from the page's date at all, and the `mockResolvedValue` (not `Once`) test trap
- [A year-end snapshot's source date falls in July, so a program-year equality guard drops every year](tasks/lessons/lessons/a-year-end-snapshots-source-date-falls-in-july-so-a-program-year-equality-guard-drops-every-year.md) — as-of vs snapshot divergence at the PY boundary (Sprint 2's exact hazard)
- [Resolve the active program year by data, not the calendar](tasks/lessons/lessons/resolve-the-active-program-year-by-data-not-the-calendar.md) — wall-clock-derived dates are the same divergence family (the `todayIso()` fallback)
- [A dated CDN snapshot is a PerDistrictData envelope — mock the wrapper or the page reads empty on live](tasks/lessons/lessons/a-dated-cdn-snapshot-is-a-perdistrictdata-envelope-mock-the-wrapper-or-the-page-reads-empty-on-live.md) — fixture shape for Sprints 2–3
- [A field's name (and comment) can lie about whether it's populated in your surface](tasks/lessons/lessons/a-fields-name-and-comment-can-lie-about-whether-its-populated-in-your-surface.md) — the phantom `asOfDate` is a textbook instance; verify against the live CDN, not the type
