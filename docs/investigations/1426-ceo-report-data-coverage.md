# CEO Report "Numeric Snapshots" — Toast Stats data-coverage audit (#1426)

**Status:** Evaluation complete · operator ruling recorded 2026-08-19 (see §7)
**Source analysed:** `ceo-report-august-2026.pdf` (20 pp.), TI CEO Report archive
(<https://www.toastmasters.org/about/world-headquarters/ceo-reports>)
**Date:** 2026-08-19
**Question:** can Toast Stats produce the data in the CEO Report?

---

## 1. Answer in one paragraph

**Yes for the scoreboard, no for the corporate sections.** Eight of the ten
Numeric-Snapshot metrics are already inside data the collector fetches and GCS
stores today — none of them needs a new Toastmasters data source. Two need a
small parser/pipeline fix each. One (membership-building awards) has **no
source** in any surface we ingest. The country choropleths are reproducible only
against a _club_-country proxy, not TI's member-address basis. Everything from
"Education and Product Sales" onward (Pathways adoption, CQMS, social media,
Smedley Fund) lives in TI-internal systems and is permanently out of reach.

The real work is not data acquisition. It is that **every artifact we publish is
per-district** — `snapshots/{date}/district_{id}.json`,
`snapshots/{date}/all-districts-rankings.json`, `time-series/district_{id}/…`.
There is no worldwide rollup and no global time series. The CEO Report is
entirely global-with-5-year-history. That rollup is the build.

> **Resolved — archive coverage confirmed (#1456).** This audit originally
> flagged the CEO Report's 2021-22 → 2025-26 window as an unverified
> prerequisite, because the audit session could not reach `cdn.taverns.red` to
> check it. The CEO Report oracle (#1429, landed by PR #1438) has since settled
> it: **5/5 program-year coverage, with the 2022-06-30 year-end snapshot
> present.** The 5-year series has no hole where TI's window starts, and the
> rollup can be scoped against the full range.

---

## 2. What the report actually contains

Extracted from the August 2026 PDF. Percentages are TI's YoY deltas.

### Numeric Snapshots (pp. 1–9) — the reproducible core

| Metric                             | 2021-22 | 2022-23 | 2023-24 | 2024-25 | 2025-26                   |
| ---------------------------------- | ------- | ------- | ------- | ------- | ------------------------- |
| Total membership (as of Mar 31)    | 282,055 | 266,554 | 272,338 | 265,261 | **265,512**               |
| Membership payments (as of Jun 30) | 563,443 | 549,636 | 557,370 | 549,007 | **548,483**               |
| Paid clubs (as of Jun 30)          | 14,749  | 14,271  | 13,846  | 13,833  | **13,708**                |
| New clubs                          | 703     | 817     | 958     | 951     | **932**                   |
| Suspended clubs                    | 1,017   | 1,036   | 988     | 817     | **733**                   |
| Average club size (Jun 30)         | 16.5    | 17.2    | 17.3    | 17.9    | **18.1**                  |
| Distinguished clubs (all tiers)    | 5,727   | 6,462   | 6,386   | 6,737   | **6,587** (48.1% of paid) |
| Distinguished districts            | 8       | 18      | 33      | 37      | **42**                    |

Distinguished-club tier split, 2025-26: Distinguished 2,349 · Select 1,037 ·
President's 1,289 · **Smedley 1,912** (first year the tier existed).

Membership building awards (3 series × 5 years): Smedley Award 862, Talk Up
Toastmasters 859, Beat the Clock 1,843 → **3,567 total** in 2025-26.

Education awards (3 years × 6 series), 2025-26: L1 35,025 · L2 25,835 ·
L3 17,996 · L4 12,882 · L5 9,143 · **DTM 1,034** → **101,916 total**.

Three choropleths: members by country, clubs by country, education awards
earned by country (as % of that country's membership).

Also: district reformations — 93 districts effective 2026-07-01, new district
numbers 201–231.

### Narrative sections (pp. 10–14) — not reproducible

Education & product sales ($1,709,490), Pathways adoption (81.5%, 107,860 paths
worked, 12.5% non-English), Member Experience (CQMS CSAT 91%, 62,000 cases, Ora
Tor 36,000 conversations), Social Media (follower counts, campaign impressions),
Smedley Fund. All TI-internal — no public surface exposes them.

---

## 3. Metric-by-metric coverage

Legend: ✅ derivable from data we already store · ⚠️ derivable but blocked on a
named gap · ❌ no source.

### ✅ Total membership — 5-year trend

Sum `totals.totalMembership` (`DistrictStatisticsFile`) across every district at
the target snapshot date. Prune retains one snapshot per month per PY, so the
March 31 and June 30 dates the CEO Report keys off are exactly the dates we keep.
Per-PY history additionally exists pre-aggregated in `DistrictAwardsHistoryStore`
(`totalMembership`, `avgClubSize`, `activeClubs` per district per PY) and in
`time-series/district_{id}/{programYear}.json` (`membership` per data point).

_Caveat:_ our membership is `Active Members` from `clubPerformance`, summed over
districts. TI's "total membership" is its own paid-member count and includes the
undistricted (`U`) bucket. The collector can fetch `U`
(`fetch-find-a-club --include-undistricted`, and `U` appears in the All Districts
summary), but confirm it is in the district set for any date we roll up.

**Ruled (2026-08-19):** include `U` in global sums, and label the district count
separately so "93 districts" does not silently become 94.

### ✅ Membership payments — 5-year trend

Sum `rankings[].totalPayments` from `snapshots/{date}/all-districts-rankings.json`
at the PY-end date. The same file also carries the payment breakdown
(`newPayments` / `aprilPayments` / `octoberPayments` / `latePayments` /
`charterPayments`, #327) — a finer cut than the CEO Report publishes.

### ✅ Paid clubs — 5-year trend

Sum `rankings[].paidClubs`. **This one already ships**: the Districts page global
KPI strip (#356) renders "Paid Clubs · Global" from exactly this sum. What is
missing is only the history — the KPI is latest-snapshot-only.

### ✅ Average club size — 5-year trend

Membership ÷ paid clubs at the PY-end snapshot. Note the CEO Report's basis is
**not** the March membership figure: 265,512 ÷ 13,708 = 19.4, not the published
18.1, so TI is dividing a June-30 membership (≈248,100) by paid clubs. Pin the
basis before publishing a number labelled the same way TI labels it.
`DistrictAwardsHistoryStore.avgClubSize` already stores a per-district per-PY
value — check its basis matches before reusing it for a global figure.

**Ruled (2026-08-19):** publish June-30 membership ÷ paid clubs, stated on the
methodology page. We do not chase 18.1; landing near it is validation.

### ✅ Distinguished clubs by tier + % of paid clubs — 5-year trend

`DistrictTotalsFile` carries **disjoint per-tier counts** sourced from the
`Club Distinguished Status` letter codes (#1124): `distinguishedClubs` (D),
`selectDistinguishedClubs` (S), `presidentDistinguishedClubs` (P),
`smedleyDistinguishedClubs` (M). Sum the four for "distinguished or better";
divide by the paid-club sum for the 48.1%. The same tiers are on
`all-districts-rankings.json`.

_Caveat:_ `smedleyDistinguishedClubs` is absent from snapshots written before
2026-06 — correctly so, the tier did not exist. A 5-year chart must render the
Smedley series as starting in 2025-26, not as zeros.

### ✅ Distinguished districts — 5-year trend

`DistinguishedDistrictCalculator` scores a district from its `DistrictRanking`,
with **per-era rulesets** (`CURRENT` ≥2026 · `ERA_2025` · `ERA_2022` ·
`ERA_2018` · `ERA_2016`) — so historical years are scored under the rules that
actually applied. Count districts at Distinguished or better per PY-end snapshot.
Per-district year-end tiers are also already persisted in
`DistrictAwardsHistoryStore.distinguishedTier`.

_Caveat:_ the calculator's tri-state (true / false / **undefined** when the CSV
column is absent for that year) matters here — a district whose prerequisites are
unknowable must not be silently counted as failing (#1116 item 5).

### ⚠️ New clubs — needs a global rollup only

The signal is `Charter MM/DD/YY` in the `Charter Date/Suspend Date` column of
`district-performance.csv`, which we store raw on every snapshot
(`DistrictStatisticsFile.districtPerformance`). It is already parsed:
`parseCharterDateFromStatusField` + `BordaCountRankingCalculator.countNewCharteredClubs`
→ `DistrictRanking.newCharteredClubs` (#336). Summing that across districts gives
a global new-club count today.

_Caveat:_ `newCharteredClubs` counts clubs that chartered this PY **and are still
paid** at the snapshot date. TI counts clubs _organized_ during the year,
including ones since suspended — so our number will run low. The New Clubs daily
report (`ac6df5db…`) is the cleaner source, and is already parsed
(`NewClubRecord` with `charterDate` + `status`) — but see the pipeline gap below.

**Ruled (2026-08-19):** source new clubs from the New Clubs report, which makes
this metric depend on #1428. If #1428 stalls, ship `newCharteredClubs` under a
distinct label ("new clubs still active") — never as "new clubs".

### ⚠️ Suspended clubs — parser gap

Same column, other prefix: `Susp MM/DD/YY`. We store the raw column but never
read that branch — `parseCharterDateFromStatusField` matches `^Charter\s+` and
returns `null` for everything else, by design for #336.

Adding a `parseSuspendDateFromStatusField` sibling + a per-district count of
suspensions dated inside the PY yields the metric from data already on disk, for
every historical snapshot, with no new fetch. This is the single highest-value /
lowest-cost gap in the audit.

_Discipline (Lesson 47, R7):_ this exact column produced a silent
`?? undefined` failure once already. Any parse change ships with an integration
test against a real fixture carrying the literal column name, and is verified
against live data — not unit tests alone.

### ⚠️ Education awards by level + DTM — pipeline gap

The Education Achievements daily report (`c757d313…`) is _precisely_ this data
and finer: it emits one row per achievement with a path-and-level award code
(`PM3Presentation Mastery Level 3`, `DL5Dynamic Leadership Level 5`, …). We
already parse it into de-identified per-(club, award) counts
(`EducationAchievementActivityRecord.achievementCount`), the personal `Member`
column dropped at parse time. Summing across districts and mapping award code →
level gives the CEO Report's L1–L5 bars; DTM needs its award code confirmed
present in the report (the D61 fixtures are too small to contain one).

Two things block it:

1. **`fetch-daily-reports` is not wired into `data-pipeline.yml`.** The nightly
   workflow calls `discover-districts`, `scrape`, `fetch-find-a-club`,
   `merge-find-a-club`, `compute-analytics`, `transform`, `prune`, `rebuild`,
   `value-diff` — and never `fetch-daily-reports`. So
   `snapshots/{date}/district_{id}_reports.json` is not being produced on a
   schedule, even though the frontend reads it (`fetchCdnDistrictReports`,
   `clubStatusOverlay` — the shipped #1069 closing-period club-status overlay).
   This is a standalone bug well beyond this audit's scope — filed as **#1428**,
   which also documents a filename-collision landmine that makes naive wiring
   fail the publish gate.
2. **Prior program years need the archive backfill.** The current-PY report is
   live; historical PYs come from the Educational Achievement Archive
   (`a30b93f3…`, empty for the current PY, populated per `?year=`). The backfill
   exists (`EducationArchiveBackfill`, `backfill-education-archive`, runbook
   `docs/runbooks/education-archive-backfill.md`) but **#1070 is still open and
   operator-gated** — so the 3-year comparison the CEO Report draws is not
   available until that runs.

_Semantics (#1080):_ our count is **raw achievement activity**, not DCP credit
(DCP counts distinct members per tier; the dedup is unrecoverable after the
`Member` column is dropped). That is the _right_ basis here — the CEO Report is
counting awards earned, and its own levels sum to its stated total
(35,025+25,835+17,996+12,882+9,143+1,034 = 101,915 vs. 101,916 published). Do
not conflate this series with `clubPerformance`'s DCP level columns.

### ❌ Membership building awards — no source

Smedley Award, Talk Up Toastmasters, Beat the Clock are membership-campaign
awards. They appear in **none** of the four dashboard CSVs (All Districts,
District, Division, Club Performance) and in **none** of the 12 district daily
reports enumerated in the #1063 spike. There is no known anonymous surface.

Reproducing this trio would need a new source to be found first. Treat as
blocked, not as work.

### ⚠️ Country choropleths — club-country proxy only

Find-A-Club enrichment writes `address.country` (from FAC `CountryName`) onto
matched `clubPerformance` rows and onto `ClubStatisticsFile.address.country`
(#429/#431, contract #1123). The nightly pipeline does run
`fetch-find-a-club` + `merge-find-a-club`.

- **Clubs by country** — reproducible directly, modulo FAC match rate (unmatched
  clubs have no country and must be shown as an explicit "unknown" bucket, never
  silently dropped).
- **Members by country** — only as _members of clubs registered in that country_.
  TI's basis is the member's own record. Close for most countries, wrong for
  online/cross-border clubs.
- **Education awards by country** — the daily report is club-keyed, so this is a
  proxy of a proxy, and TI additionally normalises by the country's membership.

**Ruled (2026-08-19): ship clubs-by-country only.** A methodology footnote does
not travel with a screenshot, and members-by-country is the map most likely to be
lifted out of context. One map we can compute honestly beats three we have to
qualify.

### ✅ District reformations

93 districts effective 2026-07-01, new numbers 201–231. `discover-districts`
already enumerates the live district set per program year, and the frontend's
omni-search already resolves every district that has ever existed to its most
recent year (#1403). Nothing to build beyond stating the count.

### ❌ Everything from p.10 onward

Education & product sales, Pathways adoption / paths worked / non-English share,
CQMS satisfaction and case volume, Ora Tor conversations, social-media
followers and campaign metrics, Smedley Fund disbursements. All internal TI
systems with no public data surface. Permanently unavailable; do not plan around
them.

---

## 4. The actual prerequisite: a global rollup

Every ✅ above is "sum a field we already have across districts, at a PY-end
snapshot" — and nothing in the pipeline does that. Concretely what is missing:

- `snapshots/{date}/global-totals.json` — one object per snapshot date:
  membership, payments, paid clubs, active clubs, avg club size, the four
  distinguished tiers, distinguished-district count, new clubs, suspended clubs,
  district count. Computed in `compute-analytics` from the same per-district
  inputs it already loads.
- `v1/global-history.json` — one row per PY-end date, so a 5-year chart is one
  fetch. Derived layers already retain full daily resolution and are exempt from
  prune (#1132), so a dated global series is safe to keep.

Both are additive files that auto-promote through the ADR-002 staging gate, in
the same shape as the existing `v1/rankings.json` / `v1/rank-history/` artifacts.

## 5. Definition parity — the trap to avoid

TI's numbers carry TI-internal bases we cannot see: which clubs count as paid on
a given date, whether undistricted clubs are in, how mid-year suspensions net
against charters, and what membership figure the average-club-size divisor uses
(demonstrably _not_ the March figure the same page publishes).

The right posture is the one this codebase already takes elsewhere: publish our
numbers with **our** definitions stated on the methodology page, and treat a
close match to the CEO Report as _validation_, not as a target to fit. Tuning a
definition until a number matches a PDF is how a silent wrong-basis metric gets
shipped.

## 6. Sequencing (as ruled)

0. **Validate the calculators against the CEO Report's five published years**
   (#1429) — the report publishes exactly the totals our calculators produce, so
   it is a free external oracle for per-era rulesets that have never been checked
   against a published number. Confirmations de-risk everything below;
   mismatches are bugs in figures users already see. Also verify `v1/dates.json`
   coverage here (see §1).
1. **Unblock the daily-reports pipeline gap** (#1428, as a parallel job) — a live
   defect affecting a shipped feature, independent of this evaluation.
2. **`Susp` parser branch** — smallest, unblocks a whole CEO-report series from
   data already on disk.
3. **Global rollup artifact** (`global-totals.json` + `global-history.json`) —
   the one build that lights up all six ✅ rows at once.
4. **Extend `/history`** with the global trend series + methodology note. Not a
   new page: `HistoryPage` already answers "how each completed program year
   finished" from year-end all-districts rankings, which is the CEO Report's
   frame. A parallel `/global` route would split one question across two surfaces.
5. **Education-awards series** — after #1070 runs, once historical PYs exist.
6. **Clubs-by-country map** — with an explicit "unknown" bucket for clubs Find-A-Club
   did not match.
7. **Membership-building awards** — parked until a source is found.

## 7. Operator ruling — 2026-08-19

Recorded on #1426. Seven questions, seven answers:

| #   | Question                 | Ruling                                   |
| --- | ------------------------ | ---------------------------------------- |
| 1   | Where does it live?      | Extend `/history`; no new global page    |
| 2   | Country maps?            | Clubs-by-country only                    |
| 3   | Average club size basis? | June-30 membership ÷ paid clubs, stated  |
| 4   | Undistricted (`U`)?      | Include; label district count separately |
| 5   | New clubs definition?    | New Clubs report (depends on #1428)      |
| 6   | #1428's ~24 min?         | Parallel job — not absorbed, not trimmed |
| 7   | Run #1070 backfill?      | Yes, after #1428                         |

Plus: validate against the CEO Report's published figures first (#1429), ahead of
the rollup build.

## 8. Sources consulted

- `ceo-report-august-2026.pdf`, pp. 1–14 (text + rendered chart labels)
- `packages/shared-contracts/src/types/district-statistics-file.ts` (`DistrictTotalsFile`, `ClubStatisticsFile`)
- `packages/shared-contracts/src/types/all-districts-rankings.ts` (`DistrictRanking`)
- `packages/shared-contracts/src/schemas/district-reports.schema.ts` (`EducationAchievementActivityRecord`, `NewClubRecord`)
- `packages/analytics-core/src/rankings/programYearDates.ts`, `BordaCountRankingCalculator.ts` (`countNewCharteredClubs`)
- `packages/analytics-core/src/rankings/DistinguishedDistrictCalculator.ts` (per-era rulesets)
- `packages/collector-cli/src/services/{DailyReportFetcher,DistrictReportsBuilder,EducationArchiveBackfill,DistrictAwardsHistoryStore,FindAClubService}.ts`
- `.github/workflows/data-pipeline.yml` (the invoked `collector-cli` command set)
- `docs/investigations/1063-daily-reports-ingest-spike.md` (the 12 report GUIDs + keep/EXCLUDE map)
- Issues #1062, #1069, #1070, #1080, #1147, #336, #1124, #1125, #1132, #1428, #1429
