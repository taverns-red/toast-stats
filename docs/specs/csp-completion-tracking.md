# Spec — Club Success Plan (CSP) completion tracking

**Status:** Draft for operator review · **Date:** 2026-09-12 · **Author:** Claude (spec only — no implementation, no issue created)
**Scope:** Surface the clubs that have **not** submitted a Club Success Plan and weave that into (a) the district and division narratives, (b) the area narratives, and (c) the Area Director action list.

> Terminology guard: in this codebase the literal token `CSP` is **also** used for Content-Security-Policy (Firebase hosting headers, Lighthouse gate, `tasks/lessons/lessons/a-csp-in-hosting-config-is-invisible-to-the-localhost-lighthouse-gate.md`). Everything in this spec means **Club Success Plan**. Grep for `cspSubmitted` / `Club Success Plan` / `clubSuccessPlan`, never bare `CSP`.

---

## 1. Problem statement and job-to-be-done

Since program year 2025-26 Toastmasters International requires a submitted Club Success Plan before a club can earn **any** Distinguished level, however many DCP goals it meets (`docs/toastmasters-rules-reference.md` §3.3; `frontend/src/content/programYearRuleChanges.ts` → `py-2025-2026-club-success-plan-required`). Toast Stats already enforces that gate everywhere it computes a tier, and the club detail page shows a ✓/✗ per club. What it does **not** do is tell a leader, at the level they actually work at, _which_ clubs are blocked.

On the live D61 snapshot of 2026-09-11, **116 of 161 clubs (72%) have not submitted** (§2.2). Nine of 34 areas have **zero** submitters. A Division Director reading "Division A is not yet distinguished … 3 more clubs need to become distinguished" is not told that 13 of the division's 18 clubs _cannot_ become distinguished until a form is filed — a paperwork gap, not a performance gap, and the cheapest lever the leader has.

**Jobs-to-be-done**

| Persona                 | Job                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Area Director           | "Which of my clubs still need to file a CSP so I can chase them at the next visit?"                                   |
| Division Director       | "How much of my Distinguished gap is paperwork rather than performance?"                                              |
| District Director / PQD | "What fraction of the district is CSP-blocked, and where?" — one line in the overview, one CSV to hand to trio calls. |

---

## 2. Data availability — findings with evidence

### 2.1 Verdict: **World (a) — the field exists end-to-end.** No collector, analytics-core, or shared-contracts changes are required for the core feature.

The scrape → transform → analytics → CDN → frontend path already carries a per-club boolean, and the frontend already consumes it in three places (club page, Close-to-Distinguished predicate, What-Changed feed). The feature is a **frontend derivation + presentation** change, gated by program year.

### 2.2 Evidence — live CDN (fetched 2026-09-12, `curl -s --compressed`)

**Manifest**

```
$ curl -s --compressed https://cdn.taverns.red/v1/latest.json
{ "_format": {"version":"1.0.0","type":"manifest"}, "latestSnapshotDate": "2026-09-11", "generatedAt": "2026-09-12T10:03:59.568Z" }
```

**Raw district snapshot** — `snapshots/2026-09-11/district_61.json` → `data.clubPerformance[]` (161 rows). The upstream Toastmasters dashboard column is literally `CSP`, values `Y`/`N`:

```
club fields: ["District","Division","Area","Club Number","Club Name","Club Status","CSP","Mem. Base",
  "Active Members","Net Growth","Goals Met","Level 1s","Level 2s or EOM", … ,"Club Distinguished Status",
  "charterDate","coordinates","address", …]
CSP value distribution: { "N": 116, "Y": 45 }
example: {"Division":"A","Area":"01","Club Number":"00003045","Club Name":"Limestone City Club",
  "Club Status":"Active","CSP":"N","Mem. Base":"13","Active Members":"16","Goals Met":"1", …}
```

**Computed analytics the frontend reads** — `snapshots/2026-09-11/analytics/district_61_analytics.json` (this is the file `useDistrictAnalytics` fetches: `frontend/src/hooks/useDistrictAnalytics.ts:240` → `cdnAnalyticsUrl(snapshotDate, districtId, 'analytics')`). Every `data.allClubs[]` row carries a normalized boolean **and** a human-readable risk factor:

```
allClubs rows: 161   cspSubmitted: { false: 116, true: 45 }
example: {"clubId":"3045","clubName":"Limestone City Club","divisionId":"A","areaId":"01",
  "cspSubmitted":false,"clubStatus":"Active","currentStatus":"vulnerable",
  "distinguishedLevel":"NotDistinguished","riskFactors":["CSP not submitted"]}
```

Crosstabs on the same file (useful for edge cases in §6):

```
clubStatus × cspSubmitted:   Active|false 113 · Ineligible|false 3 · Active|true 44 · Low|true 1
currentStatus × cspSubmitted: vulnerable|false 84 · intervention-required|false 32 · thriving|true 22
                              · intervention-required|true 7 · vulnerable|true 16
per division (clubs / not submitted): A 18/13 · B 28/21 · C 22/19 · D 17/12 · F 19/14 · G 20/12 · H 19/15 · I 18/10
areas: 34 total · 0 areas with every club submitted · 9 areas with NO submitters
```

**Daily-reports file (submission dates)** — `snapshots/2026-09-11/district_61_reports.json` → `sections.clubSuccessPlan` (161 records; `programYear: "2026-2027"`). It agrees exactly with the base column (45 dated ⇔ 45 `Y`), and non-submitters carry the literal string `"Not Submitted"`:

```
{"sources":[{"reportType":"club-success-plan","tableId":"99b20422-…","asOf":"September 12, 2026"}],
 "records":[{"clubNumber":"1009147","division":"D","area":"33","submissionDate":"July 9, 2026","clubName":"Los Amigos Online"}, …]}
submissionDate: 45 dated in 2026 · 116 = "Not Submitted"
```

**Program-year boundary (real data, not assumption)**

| Snapshot                           | Raw `CSP` column                              | `analytics` `cspSubmitted`                             |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `2025-06-30` (last of PY 2024-25)  | **column absent** (170 rows, all `undefined`) | `true: 170` — normalized by `getCSPStatus` (`?? true`) |
| `2025-07-31` (first of PY 2025-26) | present: `N: 156, Y: 8`                       | `false: 156, true: 8`                                  |
| `2026-09-11` (PY 2026-27)          | present: `N: 116, Y: 45`                      | `false: 116, true: 45`                                 |

Two consequences drive the design: (1) the analytics file **cannot** distinguish "submitted" from "not tracked that year" — pre-2025-26 clubs read `true`; (2) the column resets to `N` for essentially every club on July 1 (156 of 164 on the first 2025-26 snapshot).

`v1/dates.json` shows `2026-06-30` followed directly by `2026-07-26` — no snapshots for the first 25 days of July 2026. That is consistent with the #1284 rollover tripwire (TM's dashboard lags July 1), recorded here as an observation, not a diagnosis.

### 2.3 Evidence — code path (exact files)

| Stage                      | File                                                                                                                                                                                                              | What it does                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transform                  | `packages/analytics-core/src/transformation/DataTransformer.ts:401-407`                                                                                                                                           | `extractString(record, 'CSP', 'Club Success Plan')` → `club.cspSubmitted = normalized === 'yes' \|\| normalized === 'y'`; left `undefined` when the column is absent |
| Contract                   | `packages/shared-contracts/src/types/district-statistics-file.ts:194` · `schemas/district-statistics-file.schema.ts:140`                                                                                          | `cspSubmitted?: boolean` / `z.boolean().optional()`                                                                                                                  |
| Rule                       | `packages/analytics-core/src/analytics/ClubEligibilityUtils.ts:318-338`                                                                                                                                           | `getCSPStatus(club)` → `club.cspSubmitted ?? true` (pre-2025-26 ⇒ treated as submitted)                                                                              |
| Health                     | `packages/analytics-core/src/analytics/ClubHealthAnalyticsModule.ts:225, 342, 370-371, 533-538`                                                                                                                   | Thriving requires CSP; pushes risk factor `'CSP not submitted'`; forces `NotDistinguished` when unsubmitted                                                          |
| Time series                | `packages/analytics-core/src/timeseries/TimeSeriesDataPointBuilder.ts:230`                                                                                                                                        | per-point `cspSubmitted`                                                                                                                                             |
| Reports                    | `packages/shared-contracts/src/schemas/district-reports.schema.ts:69-76, 146` · `packages/collector-cli/src/services/DistrictReportsBuilder.ts:212-214`                                                           | `clubSuccessPlan` section with `submissionDate`                                                                                                                      |
| Diff                       | `packages/shared-contracts/src/schemas/snapshot-diff.schema.ts:47, 82` · `frontend/src/pages/DistrictChangesPage.tsx:78-82`                                                                                       | `csp` What-Changed events (#1460)                                                                                                                                    |
| Frontend type              | `frontend/src/hooks/useDistrictAnalytics.ts:56`                                                                                                                                                                   | `ClubTrend.cspSubmitted?: boolean`                                                                                                                                   |
| Frontend raw-snapshot path | `frontend/src/utils/extractDivisionPerformance.ts:145-148, 251-300`                                                                                                                                               | private `getCSPStatus(club)` reads `club['CSP']` etc. (`'y'`/`'n'` handled); gates `determineDistinguishedLevel`                                                     |
| Existing consumers         | `frontend/src/pages/ClubDetailPage.tsx:740-757` (✓/✗/— stat) · `frontend/src/utils/closeToDistinguished.ts:16-35` · `frontend/src/utils/actionListData.ts:111` · `frontend/src/components/ClubsTable.tsx:378-381` | already read `cspSubmitted`                                                                                                                                          |

There is **no** exported "is CSP required this program year" helper anywhere (`grep -rn "CSP_REQUIRED\|isCspEra\|cspRequired"` → nothing). The 2025-26 boundary is encoded only as prose comments and the `?? true` default. That is the one small rule addition this spec proposes (§3).

### 2.4 Worlds (b) and (c) — ruled out

- (b) "exists upstream but not scraped": ruled out — the `CSP` column is in every 2025-26+ raw snapshot on the CDN and the transformer maps it.
- (c) "does not exist upstream": ruled out — see (a).

---

## 3. Proposed data model / rule additions

**No shared-contracts schema change. No CDN file-format change. No collector change.** Additions are frontend-side derived shapes plus one tiny rule helper.

### 3.1 analytics-core — one rule helper (R7: nothing exists; R16: rebuild `dist` after)

`packages/analytics-core/src/analytics/ClubEligibilityUtils.ts` (next to `getCSPStatus`):

- `export const CSP_REQUIRED_FROM_PROGRAM_YEAR = '2025-2026'`
- `export function isCspRequired(programYear?: string): boolean` — `undefined` → `true` (current rules, mirroring how `getConfirmedDistinguishedLevel` treats an omitted year); otherwise lexical compare of the `"YYYY-YYYY"` label, which is safe for this label format.
- Re-export from `packages/analytics-core/src/index.ts`.

Rationale: the boundary is TI's rule, so it lives beside the other TI rules (#1406 precedent: rung ladder by program year lives here, not in the frontend).

### 3.2 frontend — `AreaPerformance` / `DivisionPerformance` (`frontend/src/utils/divisionStatus.ts`)

Mirror the #973 visit-gap shape exactly so the narrative generator and the action list consume the same source of truth:

```ts
// AreaPerformance — new fields
/** false when the program year predates CSP tracking OR the snapshot has no CSP column. Consumers render nothing when false. */
cspTracked: boolean
/** Active clubs (per isIneligibleStatus) without a submitted CSP. Sorted by clubNumber. */
clubsMissingCsp: MissingVisitClub[]            // reuse the {clubNumber, clubName} shape
/** Suspended/ineligible clubs without a CSP, flagged separately (operator rule "active only, flag others"). */
clubsMissingCspIneligible: IneligibleMissingVisitClub[]
/** Clubs with a submitted CSP (any status) — the numerator for "N of M submitted". */
cspSubmittedCount: number

// DivisionPerformance — new roll-ups (sum of areas)
cspTracked: boolean
cspSubmittedCount: number
clubsMissingCspCount: number                    // active only
```

Consider renaming `MissingVisitClub` → a neutral `ClubRef` alias in the same commit _only_ if it stays a pure type alias (no runtime churn); otherwise reuse as-is and note it.

### 3.3 frontend — action list (`frontend/src/utils/actionListData.ts`)

```ts
export interface CspNotSubmittedItem {
  clubId: string; clubName: string; divisionId: string; areaId: string
  /** Health classification, so the row can say "vulnerable" / "intervention required". */
  currentStatus: ClubHealthStatus
}
export interface ActionListSections { …; cspNotSubmitted: CspNotSubmittedItem[]; cspTracked: boolean }
```

`buildActionList` already receives `programYear` (R3 — page-owned, #1406); it gates on `isCspRequired(programYear)`.

---

## 4. Collector / analytics-core changes

**Required:** none beyond §3.1 (a pure helper + unit test + `npm run build:analytics-core`).

**Explicitly not doing (and why):**

- Not adding a district-level `cspSubmittedCount` to `all-districts-rankings.json` / `v1/rankings.json` — the count is a trivial reduce over `allClubs`, already fetched by every consuming page. Adding a pipeline field would defer live verification to the next scheduled run (see memory: data-sprint verification) for no benefit.
- Not joining `district_{id}_reports.json` submission dates in v1 — `useDistrictAnalytics` already fetches the reports file (line 247-249) for the dues overlay, so a later sprint can add a `cspSubmittedOn` overlay cheaply. Out of scope here (see §10).

---

## 5. Existing surfaces and how the feature composes with them

### 5.1 Two data paths — and why both are touched

| Path                                                                  | Source                                                             | Who uses it                                                                                                                                                 | CSP field                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Raw snapshot** → `extractDivisionPerformance(snapshot, pinnedDate)` | `district_{id}.json` (`clubPerformance` rows)                      | `DistrictDivisionsPage` → `DivisionAreaRecognitionPanel` → `DivisionAreaProgressSummary`; `DivisionPage`; `AreaPage`; `DistrictActionListPage` (visit gaps) | `club['CSP']` (`Y`/`N`), read by the private `getCSPStatus` at `extractDivisionPerformance.ts:260` |
| **Analytics** → `useDistrictAnalytics`                                | `analytics/district_{id}_analytics.json` (`allClubs: ClubTrend[]`) | `DistrictOverview`; `DistrictActionListPage` (close-to-D, intervention); `AreaPage`/`DivisionPage` club tables                                              | `ClubTrend.cspSubmitted`                                                                           |

The narratives are fed by the raw path; the action list's club-level rows and the district overview are fed by the analytics path. Both already exist and both already carry CSP — the feature adds derivation, not fetching. Parity between the two paths is guaranteed by construction (same upstream column, both normalize `y`→true), and the existing `AreaPageParity.test.tsx` / `DivisionPageParity.test.tsx` pattern is extended to prove it (§7).

### 5.2 Narrative generators (pure functions — the integration points)

- `frontend/src/utils/areaProgressText.ts` — `generateAreaProgressText(area: AreaWithDivision, gapAnalysis)`. The area row carries everything (visits, `recognitionState`) and the generator reads it directly (#974 pattern, R3). The CSP clause is a new private `generateCspClause(area)` appended after `generateCurrentRoundVisitText`, in all three branches (net-loss / achieved / not-distinguished), returning `''` when `!area.cspTracked`.
- `frontend/src/utils/divisionProgressText.ts` — `generateDivisionProgressText(division, gapAnalysis)`. Same pattern; a count-only clause (divisions are too big to name clubs).
- Consumers of the generators pick the change up **with no edits**: `DivisionAreaProgressSummary.tsx:195-233` (overview list), `DivisionPage.tsx:94-104` (`divisionNarrative`), `AreaPage.tsx:113-126` (`areaNarrative`). `DivisionAreaRecognitionPanel.tsx` is a container that passes `divisions` through; its only change is the explanatory footer copy in `DivisionAreaProgressSummary` ("Progress descriptions include … and Club Success Plan status.").

### 5.3 Action list

- `frontend/src/utils/actionListData.ts` — `buildActionList(input, scope)` composes three sections from existing predicates. Add a fourth, `cspNotSubmitted`, from `input.clubs` (analytics `allClubs`), scoped via the existing `inScope`, excluding ineligible statuses, sorted division → area → name. Add `formatCspRow(item)` beside `formatCloseGap`/`formatVisitGap` so the row and the CSV share one string.
- `frontend/src/pages/DistrictActionListPage.tsx` — owns scope (`?division=`/`?area=`), program year (`effectiveProgramYear.label`, line 217) and pinned date; passes them to `buildActionList` (lines 205-226). Add one `<ActionListSection id="action-csp" testId="section-csp">` after the intervention section, extend `totalItems`, `handleExport`, and the intro paragraph. Styles reuse `frontend/src/styles/components/action-list.css` (`.action-list-section`, `.action-list-item`, `.action-list-item__meta`) — no new CSS.

### 5.4 District overview

- `frontend/src/components/DistrictOverview.tsx` — currently a header line ("161 clubs · avg 16.2 members/club") plus composition bar + payment donut; it takes `selectedDate` and `programYearStartDate` from `DistrictDetailPage.tsx:649-660`. Add a `programYear: string` prop (the label, exactly as `DistrictDetailPage` already passes to `DistinguishedDistrictTrophyCase` and `ClubGrowthAchievementCard` at lines 672 / 700) and a one-sentence CSP line under the header, computed from `analytics.allClubs`. R3: the year is threaded from the page, never inferred from `allClubs[0]`.

### 5.5 Program-year gating — one rule, three entry points

| Surface                                 | Year source (page-owned)                                                                                                                                 | Gate                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Raw path (`extractDivisionPerformance`) | `getProgramYearForDate(snapshotDate).label` — already computed at line 442 for the tier ladder (#1406); `snapshotDate` is the page's pinned date (#1321) | `cspTracked = isCspRequired(programYear) && cspColumnPresent` |
| Action list                             | `input.programYear` from `effectiveProgramYear.label`                                                                                                    | `isCspRequired(programYear)`                                  |
| District overview                       | new `programYear` prop                                                                                                                                   | `isCspRequired(programYear)`                                  |

`cspColumnPresent` is a belt-and-braces check on the raw path only (the column is either on every row or none — verified 2025-06-30 vs 2025-07-31). It is _not_ "re-deriving the year from data" (R3): the year gate is the prop; the column check only guards against a malformed snapshot rendering "0 of N submitted".

---

## 6. UX — exact copy

Placeholders in `{braces}`. Pluralisation via the existing `plural()` helper in `actionListData.ts` (hoist to a shared util if a second file needs it — `areaProgressText` has its own inline `clubWord`/`verb` idiom; keep that idiom there for consistency with the visit clause).

### 6.1 Area narrative (appended sentence(s), after the visit clause)

Tracked, some missing, no ineligible:

> Club Success Plans: **{2} of {5} submitted** — {3} active clubs still need to submit: {Limestone City Club, CFB Kingston Toastmasters, KEYS Toastmasters Club}. No club can be Distinguished until its plan is in.

Singular:

> Club Success Plans: 4 of 5 submitted — 1 active club still needs to submit: {KEYS Toastmasters Club}. It cannot be Distinguished until its plan is in.

All submitted:

> Club Success Plans: all {5} clubs have submitted.

None submitted (9 real D61 areas today):

> Club Success Plans: **none of the {5} clubs has submitted** — {list}. No club in this area can be Distinguished until plans are in.

With ineligible clubs (mirrors the visit clause suffix):

> … still need to submit: {A, B}. (1 suspended/ineligible club excluded.)

Not tracked (`cspTracked === false`): **no sentence at all.** Never render "0 of N" for a year that had no requirement.

Real example, Area A01 (Division A), D61 2026-09-11 — all 5 clubs `N`, of which Toastmasters At St. Lawrence College (01849755) is `Club Status = Ineligible`, so it is flagged rather than listed (E3), and the denominator is the 4 active clubs. Verified on the #1559 preview channel against the CDN; club names are in **club-number order** (3045, 9560, 7260126, 7833019), not alphabetical, per §3.2:

> Area 01 (Division A) is not yet distinguished (…). … Club Success Plans: none of the 4 clubs has submitted — Limestone City Club, CFB Kingston Toastmasters, Toastmasters At Queen's, KEYS Toastmasters Club. (1 suspended/ineligible club excluded.) No club in this area can be Distinguished until plans are in.

### 6.2 Division narrative (appended, count only)

> Club Success Plans: **{5} of {18} clubs have submitted; {13} have not** and cannot be Distinguished until they do.

All submitted:

> Club Success Plans: all {18} clubs have submitted.

Not tracked: no sentence.

Real example, Division A, D61 2026-09-11 — 18 clubs, 13 without a plan, but one of those (St. Lawrence College, above) is Ineligible and therefore excluded from the active count; 5 + 12 = 17 is self-consistent by construction. Verified on the #1559 preview channel:

> Division A is not yet distinguished (…). … Club Success Plans: 5 of 17 clubs have submitted; 12 have not and cannot be Distinguished until they do.

### 6.3 District overview (one line under the "N clubs · avg …" header, `DistrictOverview.tsx`)

> **{113} of {158} active clubs ({72}%) have not submitted a Club Success Plan** — required for any Distinguished level this year. [See which clubs →](/district/{id}/action-list#action-csp) {3} suspended/ineligible clubs without a plan are not counted.

Decision (#1561 review, verified against the live analytics file — `Active|false 113 · Ineligible|false 3 · Active|true 44 · Low|true 1`): the overview counts **active clubs only**, numerator and denominator, so the number a user clicks equals the badge on the action-list section it lands on; the ineligible clubs are named in the action list's own footnote voice. The earlier draft's "116 of 161" was the raw column count and would have linked a 116 to a list of 113. Denominator = non-ineligible clubs with a known value (an ineligible club that _has_ filed is excluded too). The trailing sentence is omitted when no ineligible club is missing a plan.

All submitted:

> Every club has submitted its Club Success Plan.

Not tracked: line omitted. The link target is the new action-list section anchor (`id="action-csp"`), scoped to the whole district; the action list already supports `?division=`/`?area=` if the user narrows from there.

### 6.4 Action list (`DistrictActionListPage.tsx`)

Intro paragraph (extend, don't replace):

> Prioritized to-dos for this district: clubs within reach of Distinguished, areas with outstanding club visits, clubs that need intervention, **and clubs that still need to submit a Club Success Plan**. Filter to your division or area and share the link.

Section (fourth, after "Clubs needing intervention"):

- Heading: **Clubs without a Club Success Plan** · count badge `{113}` (active clubs only — the 3 ineligible non-submitters are footnoted, not counted; verified on the #1561 preview)
- Row: `{Limestone City Club}` (link to `/district/{id}/club/{clubId}`) · meta `{A}/{01} · CSP not submitted · {vulnerable}`
- Empty text: "Every active club in this scope has submitted its Club Success Plan."
- Not tracked (pre-2025-26 year selected): **section not rendered** (`section-csp` absent), and the intro sentence's CSP clause is dropped too. See Open Question 3.
- Ineligible (suspended/closed/ineligible) clubs are excluded from the list; if any exist in scope, a footnote under the list: "{3} suspended/ineligible clubs without a plan are not listed."

CSV (`handleExport`), one row per item:
`['Club Success Plan not submitted', divisionId, areaId, clubName, 'CSP not submitted — required for Distinguished']`

Ordering within the section: division → area (numeric-aware `compareId`, already in the page) → club name. Rationale: an AD scoping to one area sees an alphabetical chase-list; a DD sees areas grouped.

### 6.5 What this deliberately does not change

- Club health classification, tier logic, `riskFactors` — untouched (they already encode CSP).
- Club page ✓/✗ (`ClubDetailPage.tsx:740`) — unchanged, already correct.
- What-Changed `csp` events (#1460) — unchanged.
- Clubs table — no new column/filter in this spec (candidate follow-up: a "No CSP" filter chip using the existing `useColumnFilters` pipeline, R11).

---

## 7. Edge cases

| #   | Case                                                                                                                          | Behaviour                                                                                                                                                                                                                                                                                                                                               | Where enforced                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Program year < 2025-26 (column absent; analytics normalizes to `true`)                                                        | `cspTracked=false`; no sentences, no section, no overview line. Never "all submitted" — that would be a lie of omission.                                                                                                                                                                                                                                | `isCspRequired` gate at all three entry points (§5.5); raw path also checks column presence                                                                                         |
| E2  | `ClubTrend.cspSubmitted === undefined` on a tracked year (type allows it; never observed in live data)                        | Treat as _unknown_: exclude from the not-submitted list **and** from the denominator; count separately as `unknownCount` and, if > 0, suffix "({n} clubs with no CSP data)".                                                                                                                                                                            | `actionListData`, `DistrictOverview`                                                                                                                                                |
| E3  | Suspended / closed / ineligible clubs without a CSP (3 `Ineligible                                                            | false` in D61 today)                                                                                                                                                                                                                                                                                                                                    | Excluded from the active list; counted in the flagged/footnote list, mirroring `clubsMissingCurrentRoundVisitIneligible`. Denominator for "N of M" = tracked, non-ineligible clubs. | export `isIneligibleStatus` from `extractDivisionPerformance.ts` and reuse it on `ClubTrend.clubStatus` in `actionListData` — one predicate, two paths (Lesson 052) |
| E4  | `Club Status: Low` with CSP `Y` (1 club today)                                                                                | Counted as submitted; "Low" is not ineligible.                                                                                                                                                                                                                                                                                                          | same predicate                                                                                                                                                                      |
| E5  | Area with `clubBase === 0`                                                                                                    | "Club Success Plans: no clubs in area." (mirrors the visit clause) or omit — pick omit; the visit clause already says "no clubs in area".                                                                                                                                                                                                               | `areaProgressText`                                                                                                                                                                  |
| E6  | Early program year: on 2025-07-31, 156 of 164 clubs were `N`                                                                  | The numbers are true and the action is real (chase submissions), so **show them**. Do not add a date-based softening in v1 — that would be a second, calendar-derived rule the page doesn't own. Revisit with Open Question 1 (TI deadline).                                                                                                            | —                                                                                                                                                                                   |
| E7  | Rollover (#1284): July snapshot may still carry the prior PY's June close while the frontend's calendar label says the new PY | Same exposure as every other PY-gated surface (`extractDivisionPerformance` derives the label from the pinned date today). No special handling; the collector resolves the PY once per run and the CSP column simply reflects whatever PY the snapshot really is. Document in the Methodology CSP paragraph. Observed: no snapshots for 2026-07-01..25. | docs only                                                                                                                                                                           |
| E8  | Club chartered mid-year (has `charterDate` from Find-A-Club; may appear with `N`)                                             | Listed like any other club in v1 — TI's dashboard shows it as `N` and a new club can still file a plan. Open Question 2 asks whether TI exempts them.                                                                                                                                                                                                   | —                                                                                                                                                                                   |
| E9  | Club moves area/division between snapshots                                                                                    | Rows come from the selected snapshot only; no cross-snapshot join.                                                                                                                                                                                                                                                                                      | by construction                                                                                                                                                                     |
| E10 | Scope filter (`?area=`) out of range                                                                                          | Section yields empty (Lesson 144), like the other three.                                                                                                                                                                                                                                                                                                | `inScope`                                                                                                                                                                           |
| E11 | Raw snapshot rows keyed by `Club Number` with leading zeros (`"00003045"`) vs analytics `clubId` `"3045"`                     | Do not join the two paths at all — each surface derives from its own source. Parity is proven by tests, not by a runtime join.                                                                                                                                                                                                                          | design                                                                                                                                                                              |
| E12 | Dark mode / 375px                                                                                                             | Text-only additions inside existing panels/sections; verify but no new tokens (R10).                                                                                                                                                                                                                                                                    | UX check                                                                                                                                                                            |

---

## 8. TDD test plan

All new logic is pure and lands in the **unit** project; page-level assertions go in `src/pages/__tests__/` (integration project, R22). Run `npm run test:no-page-mounts:check` before push. Rebuild `analytics-core` dist before any frontend test that imports `isCspRequired` (R16).

**analytics-core (unit)**

- `packages/analytics-core/src/analytics/__tests__/ClubEligibilityUtils.test.ts` (extend): `isCspRequired('2024-2025') === false`, `('2025-2026') === true`, `('2026-2027') === true`, `(undefined) === true`.

**frontend utils (unit project — pure functions, no rendering)**

- `frontend/src/utils/__tests__/extractDivisionPerformance.test.ts` (extend): given `clubPerformance` rows with `CSP: 'Y'|'N'` and mixed `Club Status`, the area row has `cspTracked`, `clubsMissingCsp` (active only, sorted by `clubNumber`), `clubsMissingCspIneligible`, `cspSubmittedCount`; division roll-ups sum areas; snapshot dated `2025-05-31` → `cspTracked === false` even if a stray `CSP` value is present? — **no**: dated pre-2025-26 with column present is contradictory; assert `cspTracked === false` (year gate wins). Column absent on a 2026 date → `cspTracked === false`.
- `frontend/src/utils/__tests__/areaProgressText.test.ts` (extend): each copy variant in §6.1 (some / one / all / none / with-ineligible / not-tracked-renders-nothing / `clubBase 0`). Assert exact sentence strings — these are the product.
- `frontend/src/utils/__tests__/divisionProgressText.test.ts` (extend): §6.2 variants.
- `frontend/src/utils/__tests__/actionListData.test.ts` (extend, using the existing `makeClub` factory which already sets `cspSubmitted`): section present with `programYear: '2025-2026'`; absent/`cspTracked=false` with `'2024-2025'`; ineligible exclusion; `undefined` handling (E2); ordering; scope filtering; `formatCspRow`.
- New `frontend/src/utils/__tests__/cspCompletion.test.ts` only if a shared `summarizeCspCompletion(clubs)` helper is extracted for the overview line (recommended — one reducer used by `DistrictOverview` and `buildActionList`).

**frontend components (unit project — component render, not a page)**

- `frontend/src/components/__tests__/DivisionAreaProgressSummary.csp.test.tsx`: render with a `DivisionPerformance[]` fixture carrying `clubsMissingCsp`; assert the area and division paragraphs contain the sentences; assert absence when `cspTracked=false`; assert the footer copy.
- `frontend/src/components/__tests__/DistrictOverview.csp.test.tsx` (same mocking style as `DistrictOverview.programYear.test.tsx`): `programYear='2026-2027'` + 3 clubs (2 `false`, 1 `true`) → "2 of 3 clubs (67%) have not submitted…" with the anchor link; `programYear='2024-2025'` → line absent; `undefined` handling.

**pages (integration project)**

- `frontend/src/pages/__tests__/DistrictActionListPage.test.tsx` (extend): `section-csp` renders rows and links; CSV export includes the section; `?area=` scoping; section absent for a 2024-25 year; empty state text.
- `frontend/src/pages/__tests__/AreaPageParity.test.tsx` / `DivisionPageParity.test.tsx` (extend): the scoped page's `area-progress-text` / `division-progress-text` equals the overview generator's output for the same fixture **including** the CSP clause — proves the raw-path derivation is shared, not duplicated.

**Red → Green discipline:** each `it()` above is committed failing first (the generator returns the old string; `buildActionList` has no `cspNotSubmitted` key → TypeScript red counts as a failing test for the type-shape commits).

**Non-regression:** full `npm run test` + `npm run quality:check`; Lighthouse CLS on the district hub must stay ≤ 0.1 — the new overview line renders only after `analytics` resolves, inside the same `{analytics && clubCount > 0 && …}` block as the existing subtitle, so it cannot add a late layout shift beyond the one that block already reserves (Lesson 107 shape).

---

## 9. Phased implementation plan (small commits; each leaves the tree green)

**Phase 0 — the rule (analytics-core)**

1. `test(analytics-core): isCspRequired boundary cases (#N)` — red
2. `feat(analytics-core): export isCspRequired + CSP_REQUIRED_FROM_PROGRAM_YEAR (#N)` — green; `npm run build:analytics-core`

**Phase 1 — raw-path derivation (`extractDivisionPerformance`, `divisionStatus`)** 3. `test(frontend): area/division rows carry CSP completion fields (#N)` — red (type + behaviour) 4. `feat(frontend): derive clubsMissingCsp/cspTracked per area and division (#N)` — green; export `isIneligibleStatus` 5. `refactor(frontend): share the active/ineligible split between visit and CSP lists (#N)` — small extraction, green

**Phase 2 — narratives (generators; all narrative consumers update for free)** 6. `test(frontend): area narrative names clubs without a CSP (#N)` — red 7. `feat(frontend): CSP clause in generateAreaProgressText (#N)` — green 8. `test(frontend): division narrative counts clubs without a CSP (#N)` — red 9. `feat(frontend): CSP clause in generateDivisionProgressText (#N)` — green 10. `test(frontend): Area/Division page parity includes the CSP clause (#N)` — should pass immediately (parity by construction); if red, that is a finding 11. `chore(frontend): progress-summary footer mentions CSP status (#N)`

**Phase 3 — action list** 12. `test(frontend): buildActionList emits cspNotSubmitted, year-gated and scope-filtered (#N)` — red 13. `feat(frontend): cspNotSubmitted section + formatCspRow (#N)` — green 14. `test(frontend): action list page renders the CSP section and exports it (#N)` — red (integration) 15. `feat(frontend): CSP section, intro copy, CSV rows on DistrictActionListPage (#N)` — green

**Phase 4 — district overview** 16. `test(frontend): DistrictOverview CSP line follows the page's program year (#N)` — red 17. `feat(frontend): CSP completion line + programYear prop on DistrictOverview (#N)` — green (page passes the label it already has)

**Phase 5 — docs, verification, close** 18. `docs: product-spec rows for CSP completion tracking; Methodology CSP paragraph notes the July reset and #1284 exposure (#N)` 19. Preview-channel verification on D61 (PY 2026-27 shows the section with 113 rows and the "3 suspended/ineligible clubs … not listed" footnote, and the overview line "113 of 158 active clubs (72%)"; switch PY to 2024-25 → section, sentences and overview line disappear; Area A01 narrative matches §6.1 real example; dark mode + 375px). Prune stale preview channels if the deploy 429s (memory: preview-channel quota). 20. Lesson only if something transferable surfaced (candidate: "a pipeline field normalized with `?? true` for one rule cannot be reused as a presence signal for another — gate on the year the page owns"). If that is already covered by Lesson/rule text, file nothing.

Estimated blast radius: `packages/analytics-core` (1 file + test), `frontend/src/utils` (4 files), `frontend/src/components` (2), `frontend/src/pages` (2), tests. Two workspaces touched — within the ≤3-unrelated-modules threshold; no refactor gate triggered.

---

## 10. Open questions for the operator

1. **TI deadline / cadence.** Does TI publish a date by which a CSP "should" be filed (the column resets to `N` for ~95% of clubs on July 1)? If so, the copy could say "due by {date}" like the visit clause's "Nov 30 / May 31". I did not find a deadline in `docs/toastmasters-rules-reference.md` and will not guess one. Until answered, v1 shows the raw count with no softening (E6).
2. **Newly chartered clubs.** Does TI exempt clubs chartered mid-year from the CSP requirement, or give them a grace window? v1 lists them (E8). If exempt, the row could be suppressed when `charterDate` is within the current PY — but only on a documented rule.
3. **Pre-2025-26 presentation.** Hide the action-list section entirely (spec'd), or render it with an explanatory empty state ("Club Success Plan tracking began in 2025-26")? Hiding is cleaner for historical years; the explanatory state is more discoverable. My recommendation: hide, because the intro paragraph and every narrative also go silent, and a section saying "not tracked" beside a count badge of 0 invites misreading.
4. **Submission dates.** The reports file already carries `submissionDate` per club and `useDistrictAnalytics` already fetches that file. Should the overview or action list show "submitted {date}" / "{n} submitted in the last 30 days"? Out of scope here; a natural Sprint 2 (adds a second overlay in the single join site at `useDistrictAnalytics.ts:255`).
5. **Overview placement.** One sentence under the "N clubs · avg" header (spec'd), or a fourth tile in `DistrictKpiStrip`? The strip is sticky and space-constrained; a sentence with a link to the action list is the lower-risk first cut.
6. **Clubs page filter chip.** Add a "No CSP" filter to `ClubsTable` in the same epic (R11 insertion into the existing pipeline) or defer? Not required for the three surfaces requested.
7. **MCP server.** `packages/mcp-server` exposes snapshot data read-only (ADR-008). No `cspSubmitted` references exist in its source today; should the action-list derivation be exposed as a tool as well? Out of scope unless requested.

---

## 11. Acceptance criteria (paste into the GitHub issue)

**Data / rules**

- [ ] `isCspRequired(programYear)` is exported from `@toastmasters/analytics-core`, returns `false` for `'2024-2025'` and earlier, `true` for `'2025-2026'`, later, and `undefined`; unit-tested.
- [ ] No shared-contracts schema, CDN file format, or collector change is required or made.

**Raw-snapshot derivation**

- [ ] `AreaPerformance` carries `cspTracked`, `clubsMissingCsp` (active only, sorted by club number), `clubsMissingCspIneligible`, `cspSubmittedCount`; `DivisionPerformance` carries `cspTracked`, `cspSubmittedCount`, `clubsMissingCspCount`.
- [ ] `cspTracked` is `false` when the page-owned program year is before 2025-26 **or** the snapshot rows have no `CSP` column; every consumer renders nothing in that state.
- [ ] The active/ineligible split uses the same `isIneligibleStatus` predicate as the visit-gap lists.

**Narratives**

- [ ] `generateAreaProgressText` appends the §6.1 clause (some / one / all / none / ineligible-suffix variants) and nothing when not tracked; exact strings unit-tested.
- [ ] `generateDivisionProgressText` appends the §6.2 clause; exact strings unit-tested.
- [ ] Divisions overview (`DivisionAreaProgressSummary`), `DivisionPage`, and `AreaPage` show the clause with no page-specific logic; parity tests extended and green.
- [x] Area A01 and Division A, D61, snapshot 2026-09-11 render the §6.1 / §6.2 real examples verbatim on the preview channel — "none of the 4 clubs has submitted … (1 suspended/ineligible club excluded.)" and "5 of 17 clubs have submitted; 12 have not" (verified on #1559; the examples were corrected to the rendered output, which applies the E3 ineligible rule the original draft had not).
- [ ] The Divisions-overview footer's "and Club Success Plan status" phrase is gated on the same `cspTracked` signal as the clauses — absent for a pre-2025-26 year.

**Action list**

- [ ] `buildActionList` returns `cspNotSubmitted` (with `cspTracked`) gated on the `programYear` it already receives; scoped by `division`/`area`; excludes ineligible clubs; sorted division → area → name; `undefined` `cspSubmitted` excluded and counted separately.
- [ ] `/district/:id/action-list` shows a fourth section "Clubs without a Club Success Plan" with count badge, club links, `{div}/{area} · CSP not submitted · {health}` meta, the empty state text, and the ineligible footnote; the intro paragraph mentions CSPs; the section and intro clause are absent for a pre-2025-26 year.
- [ ] CSV export includes one `Club Success Plan not submitted` row per listed club.

**District overview**

- [ ] `DistrictOverview` accepts `programYear` (label) from `DistrictDetailPage` and renders the §6.3 line with a link to `/district/{id}/action-list#action-csp`; omitted when not tracked; "Every club has submitted…" when the not-submitted count is 0.
- [ ] Lighthouse CLS on `/district/61` remains ≤ 0.1 on the preview channel.

**Quality gates**

- [ ] Failing tests committed before each implementation commit; no assertion pinning; `npm run quality:check` green; `npm run test:no-page-mounts:check` green.
- [ ] Verified on the PR preview channel at 375px, 768px, 1280px, light and dark; PY switch to 2024-25 hides every CSP surface.
- [ ] `docs/product-spec.md` updated (Divisions, Division, Area, Action List, Overview rows); Methodology CSP paragraph notes the July reset and the #1284 rollover exposure.
- [ ] Lesson filed only if a transferable insight surfaced; `npm run lessons:index` regenerated if so.
