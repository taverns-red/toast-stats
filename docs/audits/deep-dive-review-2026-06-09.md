# Deep-Dive Project Review & Live-Site Compliance Audit — 2026-06-09

**Scope:** full codebase, open issues/roadmap, docs, test/CI infra, live site (https://ts.taverns.red), CDN data (https://cdn.taverns.red), and a three-way cross-check against official Toastmasters International dashboards.
**Method:** 9 parallel audit probes + adversarial verification (every critical/high finding independently re-reproduced by 3 skeptic agents; only majority-confirmed findings are marked VERIFIED) + a manual live browser walkthrough + 2 follow-up probes (pipeline, mcp-server).
**Agents:** 45+; all evidence cited as file:line or live URL with exact numbers.

---

## 1. Executive summary

**The headline question — "is the site properly reporting statistics in compliance with Toastmasters business rules?" — gets a split answer:**

- **Primary surfaces: YES, exactly.** A full three-way cross-check (official TI CSV ⟷ rules-reference recompute ⟷ live site) at the identical as-of date (2026-06-08) found **zero mismatches across all 162 D61 clubs, 35 areas, 8 divisions, and district aggregates**. Recomputing the 10 DCP goals, Goals Met, and distinguished levels from raw official columns per `docs/toastmasters-rules-reference.md` reproduces TI's own reported values 100% — including all 12 Smedley clubs, the CSP gate, and the net-growth alternatives. DAP/DDP/District-tier math (post-#799 model) is correct on every live recognition path.
- **Secondary/derived surfaces: NO — six verified wrong-number bugs.** The drift lives in _forked re-implementations_ of the rules: the time-series builder, the analytics modules, the frontend per-goal panel, and the region aggregator each re-implement club rules independently and have drifted from the canonical implementations (which are correct). Pattern: **the rule logic is healthy at its single sources of truth; every defect is a duplicated copy that rotted.**

Pipeline/freshness is healthy: the #1083/#1092 closing-gate saga is genuinely resolved — prod promoted autonomously through May closing, prod == staging == 2026-06-08, generated 2026-06-09T13:41Z.

---

## 2. VERIFIED wrong-number defects (critical/high — each confirmed by 3 independent re-verifications)

### C1. Analytics Goals 5/6 always 0% — legacy CSV header

`DistinguishedClubAnalyticsModule.ts:733,738` reads `'Level 4s, Level 5s, or DTM award'`; live raw records carry `'Level 4s, Path Completions, or DTM Awards'`. Missing key → 0. Live `district_61_distinguished-analytics.json` reports Goal 5 = 0/162 and Goal 6 = 0/162; raw same-date truth is **105/162 and 77/162**. Unit tests pin the legacy header (test:692-693), hiding the bug. `DataTransformer.ts:291-298` and frontend `dcpGoals.ts` have the correct header — third copy drifted.

### C2. DCP Goal 10 requires Oct AND Apr dues — rule is OR

§10.2 (and TI's own Goals Met): officer list + (Oct **OR** Apr dues). `DataTransformer.ts:309-311` is correct; frontend `dcpGoals.ts:123-144` and `DistinguishedClubAnalyticsModule.ts:749-757` require **all three**. Live D61: 7 clubs qualified Oct-only + 15 Apr-only = **22 club detail pages whose per-goal panel contradicts the page's own TI-sourced Goals Met headline** (e.g. CFB Kingston 00009560: headline 3, panel sums 2). Live analytics Goal 10 count 122; correct 144.
_(This is the reconciliation of the apparent probe contradiction: raw data + headline = correct; the per-goal checkmarks = wrong for these 22 clubs.)_

### C3. Time-series club health uses `dcpGoals > 0` instead of the monthly checkpoint + CSP

`TimeSeriesDataPointBuilder.calculateClubHealthCounts` (211-227) comments "Classification rules from ClubHealthAnalyticsModule" but implements neither the §5.3 monthly table nor the CSP gate. Live D61 2026-06-08: **trends surface 78 thriving / 38 vulnerable vs dashboard 57 / 59** for the same date (the dashboard file matches §5 exactly, 0 misclassifications across 411 clubs checked in 3 districts). Also: its `isDistinguished` status-match expects words ('smedley') but live values are letters ('D','S','P','M') — dead branch.

### C4. Region leaderboard %-distinguished uses wrong denominator (Lesson 60 regression)

`aggregateRegions.ts:167` divides by current `paidClubs`; canonical rule (§9, `distinguishedPercent.ts`) divides by **paid club base**. Live: R13 shows 49.7% (displays "50%") vs correct 43.8%; every region inflated 0.3–6.0pp. Feeds region ranks + Borda scores (ranks happen to match today, but can flip).

### C5. #798 float overshoot survivors publish off-by-one President's targets

`TargetCalculator.ts:37,72` `Math.ceil(base * 0.55)` and `distinguishedCountdown.ts:110-112` — the exact float form `divisionGapAnalysis.ts:86-96` was fixed to avoid (100×0.55 = 55.000…01 → 56). **Live CDN: D86 presidents target 56 (correct 55), D94 111 (correct 110)**; 228 of bases 1..10000 overshoot. Internally inconsistent with `DistinguishedDistrictCalculator.meetsThreshold`, which passes a district at exactly 55%.

### C6. Time-series payments omit Late + Charter payments

`TimeSeriesDataPointBuilder.calculateTotalPayments` (144-158) sums Oct + Apr + New only. Live D61: time-series last point **5,684 vs headline 5,800** (late 11 + charter 105 omitted). Payment trend charts understate vs the rankings number shown on the same page.

### Also verified (high, UX-level)

- **H1. October/December DCP checkpoints disagree with the reference** — `AnalyticsUtils.ts:95-128`: Oct→2 (doc: 1), Dec→3 (doc: 2). Invisible in June; will misclassify clubs as vulnerable next Oct/Dec. _Decide which artifact is right (doc vs code) against the official CSP/recognition calendar before "fixing."_
- **H2. Distinguished projection is CSP-blind** — `ClubHealthAnalyticsModule.ts:451,513` hardcodes `cspSubmitted=true`; live D61 projectedDistinguished = 58 includes Dorval City (00005600, no CSP — ineligible per §3.3). CSP-aware count: 57.
- **H3. Snapshot aggregate blocks structurally zero** — every live snapshot publishes `divisions[]` all-zero, `areas[].paymentsTotal=0`, `totals.distinguished*=0` (D61 truth: 57). `DataTransformer.ts` extractDivisions (463-509) / extractAreas / calculateTotals (589-605) read CSV columns that don't exist ('Club Count', 'Total to Date') or match 'distinguished' against `club.status` (only ever Active/Low/Suspended). Currently unconsumed by the UI — wrong data in a public artifact, and a trap for any future consumer (incl. MCP).
- **H4. No scroll restoration** — `createBrowserRouter` without `<ScrollRestoration/>`; deep-scrolled leaderboard click lands the district page mid-content once chunks are warm.

---

## 3. Live-site walkthrough (manual, browser)

All pages render correctly with **zero app console errors**: landing (KPIs, awards race, rankings), district hub/Clubs/Divisions/Changes/Trends, club detail, Awards, History, Regions, dark mode, omni-search. Spot-checked rule math live and found it compliant:

- Club page (90 Elgin, 07238597): independent goal display (5,7,9,10 achieved without 1–4); tier gaps correctly use net-growth alternative for D/S (+2 members = base+3), hard 20-floor for President's, 25 for Smedley; June checkpoint = 5.
- Divisions page: `ceil(45% × base)` checks (Div A 6/9 on base 18, Div C 6/11 on base 23 ✓), 75% visit gates, net-loss → N/A gating ✓.
- District hub gap panel internally consistent with club base 156 / payment base 5,764 (D targets 158 / 5,822 / 71 ✓).

Cosmetic catches: landing intro copy says "**117** Toastmasters districts" while the KPI reports **128 tracked**; the Distinguished-composition caption reads "57 of **162 paid** (35%)" but 162 is _total_ clubs (paid = 151; %-of-paid = 37.7%, %-of-base = 36.5%) — mislabeled denominator.

## 4. Data coverage gaps (CDN, confirmed by hand)

- **PY 2021-22 entirely absent** (dates.json jumps 2021-06-30 → 2022-07-31; D61 `availableProgramYears` skips it; History page silently omits the year).
- **2026-01-31 and 2026-02-28 month-end snapshots missing**; stray non-month-end 2026-02-13 retained; gap 2026-02-13 → 2026-03-22. Month-ends are supposed to be the thinning policy's keep-set.
- `docs/month-end-closing-dates.json` stale at dataMonth 2026-01; its #203 auto-maintainer (`ClosingDateRegistry`) has **zero production callers** (dead code).

## 5. Issues & roadmap state

Healthy: no obsolete open issues; closing-gate saga resolved and verified; flakiness-epic gates (R20/R21/R22) fully intact; sentinel 10/10 green; 0 prod vulnerabilities; lint 51/500.

**The runner queue (#606) is EMPTY — all 7 epics ticked — while real work is stranded outside it:**

| Stranded work                           | State                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| #1080 achievementCount relabel          | roadmap-labeled but runner-invisible (no epic line)                                                                             |
| #922 mobile loading→loaded CLS (~140px) | fully specified, idle since 05-29, unqueued                                                                                     |
| Prune cron (#1037)                      | parked while #1036 audit is a **NO-GO**: time-series (1,221 objects) + club-trends (1,089) never pruned, 3 latent deletion bugs |
| Omni-search Phase 2 (divisions/areas)   | operator-deferred 06-01, **no tracking issue exists**                                                                           |
| 2017→now rerun execution                | runbook hardened (§2d), **prod GCS versioning still Suspended**, no issue owns the run                                          |

**Waiting on operator:** #1070 (greenlight Education-Achievement backfill), #1049 (live MCP E2E from a real client), #1037 (destructive cron flip), ops#37 rename (stale since 04-25; blocks #787 + Brand Phase 2).
**Hygiene:** release PR #1089 mergeable 5 days; dependabot #1094; 7 ticked epics not swept to archive #1048; decision log missing the #1083 closure entry.

## 6. Docs drift (medium cluster)

README/architecture.md/data-pipeline-flow.md/CLAUDE.md still describe the **deleted Express backend** (Cloud Run/Firestore/React 18) and a **pre-staging direct-to-prod pipeline** — data-pipeline-flow.md's manual-fix section actively instructs mutating prod, bypassing the #316/#1034 gates. product-spec.md missing 4 shipped feature sets (omni-search, error pages, Changes page, held-promotion alerting). The 2017-rerun runbook ends with a committed `</content></invoke>` tool artifact (from #1050) and its §2a pre-flight reads the prod bucket while the rebuild reads staging. Rules reference §11/§12/§15 still state the pre-#799 paid-units denominator that v1.3 corrected in §6/§7/§9 — the doc contradicts itself.

## 7. Test/CI enforcement gaps

- **main has no required status checks** — CI green is advisory; notable given autonomous sprint-runner merges (ruleset enforces only deletion/non-fast-forward).
- **collector-cli is never typechecked/built in PR CI** — its type errors first surface in the scheduled data pipeline (data-pipeline.yml:113).
- ci.yml push trigger targets a non-existent `develop` branch → no post-merge CI on main. Node 22 pinned inconsistently (no .nvmrc/engines at root).

## 8. Medium/low backlog (selected, unverified by skeptics but evidence-cited)

- District subpages + ClubDetailPage discard query error states → CDN failure renders a false "Club Not Found" with no retry.
- DistinguishedDistrictTrophyCase repeats the Lesson-107 null-until-data CLS pattern on the district hub (distinct from #922).
- Amber `--rt-stats` focus ring 2.86:1 on light surfaces (WCAG 1.4.11 needs 3:1).
- ~1,600 lines of dead hooks/utils (gradient validation, touch target, CDN cache monitor); dead `extractVisitData` legacy-model export.
- ~100-line PY/date-selection block copy-pasted across 7 district pages with in-place `.sort()` of memoized arrays.
- Every live snapshot fails the shared-contracts Zod schema (FindAClubMerger writes objects/booleans into `clubPerformance`); schema enforced nowhere in the publish path.
- `DistinguishedDistrictCalculator` treats missing prerequisite columns as "No" → historical years scored NotDistinguished instead of Unknown (§12.5) — a 2017-rerun hazard.
- `trackDistinguishedAchievements` inlines thresholds (no net-growth alt, no CSP); distinguished YoY picks any calendar-year−1 snapshot (can compare a PY to itself); timezone-sensitive program-month derivation (UTC parse + local getMonth); `dcpProjections` adds April renewal _payments_ to _members_ (consumer is unmounted dead code).
- Officer-award qualification (Education & Training) gates on full Distinguished tier while sibling award uses metric-level goals — verify against Item 1490.

## 9. Pipeline & MCP follow-up probes

### 9a. MCP server (packages/mcp-server) — 2 of 8 tools down in production

Empirically tested the real `CdnClient` + tool handlers against the live CDN:

- **`get-district-snapshot` and `get-club-health` return not-available for EVERY date ≥ 2026-05-15, including latest.** Live `clubPerformance` rows fail `ScrapedRecordSchema` (`coordinates: Invalid input`) — `FindAClubMerger.ts:96` writes `coordinates`/`address` objects and booleans into 158/162 raw rows, but the shared schema allows only `string|number|null`. No write-path code validates with these schemas, so the MCP server is the first and only validating consumer and the drift shipped silently (boundary: 2026-04-30 parses OK, 2026-05-15 onward fails). Failure is fail-closed (typed not-available, never fabricates) — good safety posture, broken product.
- **Worse on historical dates that DO parse:** `get-district-snapshot` then serves the zeroed aggregates (H3) as authoritative — divisions all-zero, `totals.distinguished*` 0/0/0 with a cite-the-source URL — while `get-time-series` (distinguishedTotal=57) and `query-rankings` contradict it. Same question, different tool, opposite answer.
- All 50 package tests pass on **invented fixtures** whose snapshot has `clubPerformance: []` and non-zero aggregates — exactly the two ways prod differs. CI green while 2/8 tools are down.
- **#1049 (the live E2E gate that would have caught this) was never run** — epic #1042 closed with it still open. Running it now would fail; it should be blocked on the schema fix.
- Smaller: `resolve-club` bare object lookup returns `available:true` with undefined district for prototype-member clubIds (`constructor`, `__proto__` — verified live); fix with `Object.hasOwn`.
- Verified solid: readOnlyHint on all 8 tools, regex preflights block path traversal, stderr-only logging, no-analytics-core guard test, fail-closed envelope, #1045 docs accurate.

### 9b. Data pipeline & promotion gates

**Promotion gates: healthy.** #1034 value gate (fail-closed) + the #1090/#1093 closing-pinned direction-agnostic auto-allow are merged on main; last 10 data-pipeline runs green (latest 2026-06-09T13:35Z); zero open promotion-held/pipeline-stale issues. _Caveat: the current local branch (`docs/runbook-2d-hardening`, base a650932f) predates the CPAA merges — rebase before touching gate code._

**All cross-probe leads root-caused in producer code:**

- **H3 zeroed aggregates** — `extractDivisions` (DataTransformer.ts:463-509) reads 'Club Count'/'Membership'/'Total to Date'; real divisionperformance headers are 'Membership to date'/'Total Paid Division Clubs'. `extractAreas` reads a payments column clubperformance doesn't have. `calculateTotals` (:594-637) string-matches 'distinguished' but live values are letter codes D/S/P/M.
- **C6 payments undercount** — 'Late Ren.'/'Total Chart' are never extracted into ClubStatistics, so `AnalyticsComputeService.convertToDistrictStatisticsInput` (:325-354) can't include them. 5,684 + 11 + 105 = 5,800 exactly.
- **C3 health drift** — confirmed; additionally `AnalyticsComputeService.ts:350` maps _operational_ clubStatus into 'Club Distinguished Status', so the time-series `isDistinguished` always falls to the 5-goal heuristic.
- **Schema gap** — `DistrictStatisticsFileSchema` is referenced only by an integration _test_; production writes (TransformService.ts:1226,1577) and the gsutil upload steps never validate.
- **Coverage gaps root-caused: collection outages, NOT pruning.** Staging raw-csv has no dates 2026-01-09→02-12 and 2026-02-14→03-21, so the Jan/Feb month-ends were never collected. The stray 2026-02-13 was published by the 2026-04-17 rebuild because its raw-csv dir lacks `metadata.json` and `ClosingPeriodDetector.detect` (:60-64) **fails open** to the raw date instead of remapping to 2026-01-31. **PY 2021-22 is backfillable**: TI verified to still serve it (districtsummary 6/30/2022 fetch OK); the closing-date registry has 11/12 months (2022-04 missing). Recovery path: `scripts/rescrape-historical.ts`.

**New pipeline findings:**

- **Prune hazard (do not run prune as-is):** prune is dispatch-only and hasn't run since ≤2026-03 (~60 non-month-end 2026 dailies retained). A run today would classify 2026-02-13 as a non-keeper (no metadata → no remap) and **permanently delete the only January-2026 raw data**. Also: the GCS delete loop keys raw-csv deletions by _snapshot_ dates (orphans remapped dirs); prune never touches time-series/club-trends/v1/rank-history; prod is never pruned (rsync without `-d`), so a prune freezes promotion until manual reconciliation. This hardens the #1036 NO-GO.
- **R2 violation:** rescrape mode's store sync (data-pipeline.yml:617-623) omits `district-awards-history.json` (daily + rebuild sync it) yet pushes it back at :781-785 — a single-PY rescrape would overwrite the accumulated GCS store with a partial file.
- **ClosingDateRegistry dead code** (#203 never wired): zero production callers; registry JSON stale at 2026-01; its only consumer is `rescrape-historical.ts` — the exact tool the backfill needs.
- **validateDistrictId tripwire gaps:** TransformService.ts:212 + AnalyticsComputeService.ts:207 `path.join` without validation; `parseDistrictList` only splits/trims. Bounded risk (operator-controlled input) but contradicts the tripwire.
- **Stale tripwire:** `SnapshotBuilder.build()` no longer exists in tracked source (deleted with the backend); district tracking now lives in TransformService.ts:2079-2126 (single path). Retire/re-point the CLAUDE.md + rules.md tripwire.
- **Verified compliant:** #1062 daily-reports ingest (promote-only structural per Lesson 154, provenance explicit, personal columns structurally excluded, Zod-validated writes); R4 repo-wide (stdout JSON-only).

## 10. Suggested issues

**Filed 2026-06-09 as #1095–#1116** (epics #1095-#1102 in the order below; singles #1103-#1116 matching items 8-20). Not yet queued in #606 — queueing order is an operator decision. Priority-ordered:

**Epic-worthy (queue candidates for #606):**

1. **Epic: Consolidate DCP goal + club-health rule definitions to one source** — fixes C1+C2+C3+H1+H2 at the root. The defect _family_ is triplication (DataTransformer / DistinguishedClubAnalyticsModule / frontend dcpGoals.ts + TimeSeriesDataPointBuilder fork). Acceptance: single shared implementation in shared-contracts or analytics-core consumed by all four sites; live trends == dashboard counts; per-goal panel sums == TI Goals Met for all clubs; goals 5/6 non-zero.
2. **Epic: Schema contract repair + publish-time enforcement** — ScrapedRecordSchema vs FAC enrichment (restores the 2 down MCP tools), fix DataTransformer extractDivisions/extractAreas/calculateTotals (H3), validate snapshots against shared-contracts at write/staging time so drift fails loudly, record real-CDN fixtures for mcp-server, then run #1049.
3. **Epic: Recognition denominator + rounding sweep** — C4 (aggregateRegions paid-base), C5 (integer-safe 55% in TargetCalculator + distinguishedCountdown), computePerformanceTargets legacy 50%-of-paid target; add a cross-implementation property test (same inputs → same targets everywhere).
4. **Epic: Backfill data gaps + closing-remap hardening** — PY 2021-22 (TI still serves it) + 2026-01/02 month-ends via `rescrape-historical` (first: add registry entries 2026-02..2026-05 + 2022-04); make the rebuild's closing remap fail CLOSED when `metadata.json` is absent (consult the registry / CSV As-of footer) so strays like 2026-02-13 can't recur; fold into the tracked 2017→now rerun.
5. **Epic: wrap #1080** (runner-visible line) and **Epic: wrap #922** (mobile CLS) — existing specified work, just unqueued.
6. **Epic: Omni-search Phase 2** (divisions/areas index) — restore the lost operator deferral.
7. **Epic: Prune coverage hardening** — un-park #1037's autonomous portion: extend prune to time-series/club-trends layers, fix the latent deletion bugs (snapshot-date-keyed raw-csv deletion; metadata-less dates must be protected — a run today would delete the only Jan-2026 data; prod-reconciliation step), keep the cron flip operator-gated. **Sequence AFTER the backfill epic.**

**Single issues:** 8. fix(routing): add `<ScrollRestoration/>` (H4). 9. fix(pages): surface query errors — stop rendering "Club Not Found" on network failure. 10. fix(district-hub): reserve TrophyCase slot while competitive-awards loads (Lesson 107 pattern). 11. fix(a11y): amber focus ring 3:1 contrast. 12. fix(copy): landing "117 districts" vs 128 tracked; Distinguished-composition "of 162 paid" mislabel. 13. docs: README/architecture/data-pipeline-flow/CLAUDE.md staging-era rewrite; product-spec 4 missing features; rules-reference §11/§12/§15 self-contradiction; runbook artifact + §2a bucket fix. 14. ci: required status checks on main; typecheck collector-cli in PR CI; remove dead `develop` trigger; pin Node 22 once. 15. data: month-end-closing-dates.json stale + ClosingDateRegistry dead code — wire into the daily pipeline or delete (#203 follow-up); backfill registry 2026-02..2026-05 + 2022-04. 16. fix(pipeline): rescrape mode missing district-awards-history.json pre-sync (R2 — can clobber the GCS store); enforce validateDistrictId in parseDistrictList + the two snapshot-path builders. 17. fix(mcp): resolve-club `Object.hasOwn` guard (prototype-member clubIds return available:true). 18. docs: retire/re-point the stale `SnapshotBuilder.build()` tripwire (class deleted with the backend; tracking now in TransformService.ts:2079-2126). 19. chore: dead-code sweep (~1.6K lines frontend + extractVisitData); ratchet lint cap 500→60; sweep #606 ticked epics to #1048. 20. fix(analytics): distinguished YoY same-PY comparison; timezone-safe program-month; dcpProjections payments-as-members (+ delete unmounted table); trackDistinguishedAchievements → shared eligibility utils; DistinguishedDistrictCalculator Unknown-vs-No for missing prerequisites (pre-2017-rerun).

## 11. Critic-identified residual gaps (not yet audited)

GCS bucket IAM/staging public exposure + CDN cache headers; secret scanning + workflow token permissions + possibly-orphaned Cloud Run/Firestore infra; full accessibility pass (only landing is Lighthouse-gated, desktop-only); performance budgets for heavy pages/mobile; 2017-backfill behavior testing before the rerun.

---

_Generated by the 2026-06-09 ultracode deep-dive (workflow wf_747a9299-7a1 + follow-ups). Verification: every critical/high claim above marked VERIFIED was independently re-reproduced by 3 adversarial agents instructed to refute it; majority-confirm required._
