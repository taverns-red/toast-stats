# Feature Spec — Global Club Rankings ("The Race to Distinguished")

---

## Operator rulings — 2026-09-12 (AUTHORITATIVE; override §9 recommendations)

### R-A. Tier qualification — REUSE the existing analytics-core rules (#296, #1406)

**Do not re-derive tier qualification from raw `clubPerformance`.** The operator's
rule is already implemented, tested, and published. Source of truth:
`packages/analytics-core/src/analytics/ClubEligibilityUtils.ts`.

The membership basis switches at April 1 of the program year:

| Snapshot period                        | Function to call                                                                       | Membership input                     |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| Before April 1 (data months Jul–Mar)   | `getConfirmedDistinguishedLevel(dcpGoals, aprilRenewals, membershipBase, programYear)` | `aprilRenewals` (confirmed renewals) |
| On/after April 1 (data months Apr–Jun) | `determineDistinguishedLevel(dcpGoals, membership, netGrowth, programYear)`            | `membershipCount`                    |

Tier thresholds (2025-26 onward; `clubTiersForProgramYear` handles earlier years,
where the Smedley rung did not exist — #1406). **Note the net-growth alternative
differs per tier; do not assume a flat +5:**

| Tier          | DCP goals | Membership                   |
| ------------- | --------: | ---------------------------- |
| Smedley       |        10 | 25 members                   |
| President's   |         9 | 20 members                   |
| Select        |         7 | 20 members OR net growth ≥ 5 |
| Distinguished |         5 | 20 members OR net growth ≥ 3 |

**Already published per club** — no new computation is needed for the current
snapshot. Verified on `snapshots/2026-09-11/analytics/district_61_analytics.json`,
`data.allClubs[]` carries both:

- `distinguishedLevel` — e.g. Pointe Claire Toastmasters (9750): 5 goals,
  49 members / 43 base → `"Distinguished"`. D61 tally: 158 `NotDistinguished`, 3 `Distinguished`.
- `isProvisionallyDistinguished` — the pre-April confirmation flag from
  `isDistinguishedProvisional(level, aprilRenewals, membershipBase, dataMonth)`.

**What the race work actually needs** is therefore NOT a new rules engine, but:

1. a **global aggregation** of these existing per-district fields into one artifact, and
2. a **daily crossing-date store** (R9) recording when each club first reached each tier.

Reusing these functions is mandatory — forking a second copy of the ladder is
exactly the drift lessons 61/76 warn about, and `getCSPStatus` in the same file
is the shared-rule precedent.

### R-A2. Crossings are STICKY

A club that reaches a tier keeps its `reachedOn` date even if it later falls
below the requirement. `reachedOn` is written once and never revised (consistent
with the §12 criterion "re-running compute for an already-stored date changes no
`reachedOn`"). Show current standing separately from the crossing date.

Expect a **step change at April 1** as the basis switches from confirmed
renewals to actual membership; label it as the renewal-basis switchover rather
than presenting it as a single-day surge.

### R-B. Naming — use the real tier names

Call a qualifying club **Distinguished / Select Distinguished / President's
Distinguished** plainly, including before April 1. This deliberately departs from
TI, which does not confer status until the April 30 stamp; the operator has made
that call knowingly.

This **overrides** the §12 acceptance criterion "Pre-April copy never uses
'Distinguished' without 'requirements'" — delete it. Keep a distinct rosette for
clubs carrying TI's _official_ code so the two remain distinguishable on screen
without hedging the language. `isProvisionallyDistinguished` drives a subtle
"unconfirmed" affordance, NOT a change of noun.

`/methodology` must carry a plain-language basis statement: Toast Stats
recognises a club as Distinguished when it meets the requirements, which may
precede TI's official April 30 recognition.

**Status:** Draft for review — no implementation, no issue filed yet
**Date:** 2026-09-12
**Author:** Claude (Fable 5.1) for Ron Servant
**Grounding:** every data claim below was verified against the live CDN or the
source tree on 2026-09-12; measurements are reproduced with the exact commands
so they can be re-run.

---

## 1. Problem statement

Toast Stats is single-district deep: a club president can see how their club is
doing against the other 160 clubs in their district, and a district director can
see how the district ranks among ~94 districts. **Nobody can see where a club
stands among the ~14,400 clubs in the world**, and nobody can see the thing club
members actually talk about at officer meetings in September: _"Are we going to
be Distinguished this year — and could we be one of the first?"_

The Distinguished Club Program is already a race with four finish lines
(Distinguished → Select → President's → Smedley) that every club runs on the
same rules. Toast Stats already holds a daily worldwide snapshot of the inputs.
The missing piece is a worldwide, club-level, time-aware surface that turns those
inputs into recognition — without turning them into shame.

**Goal:** a `/clubs` area of the site that answers, for any program year:

1. Which clubs in the world were **first to meet the requirements** for each
   Distinguished tier, and **when** (the "race").
2. How **your club** stands worldwide — framed against clubs like yours, never
   against a bottom-of-the-world list.
3. How **districts** compare on the share of their clubs that have crossed each
   line (the district-vs-district standings the awards page does not cover).

**Non-goals (v1):** any global list that has a bottom; per-member data; anything
that requires data TI does not publish on the dashboards.

---

## 2. Data availability — findings with evidence

### 2.1 Scope: every district, every club, one file per district

The daily pipeline scrapes **all** districts TI lists, including lettered `F` and
the undistricted bucket `U`. Evidence (live):

```
curl -s --compressed https://cdn.taverns.red/snapshots/2026-09-11/manifest.json
  → districts: 94, successfulDistricts: 94, failedDistricts: 0
  → ids: F, U, 02, 03, 06, 17, … 231   (post-2026-07-01 reformation set)
curl -s --compressed https://cdn.taverns.red/snapshots/2026-09-11/all-districts-rankings.json
  → 94 rows; Σ activeClubs = 14,377; Σ paidClubs = 13,906
curl -s --compressed https://cdn.taverns.red/config/club-index.json
  → totalClubs: 14,377 (clubId → {districtId, clubName})
```

Pre-reformation dates carry **128** districts (2026-03-31 … 2026-05-31); the
2024-06-30 year-end carried 130, 2025-06-30 carried 132. The district set is a
per-date fact and must be read from that date's own rankings file, exactly as
`globalRollup.ts` already does (#1465/#1466).

### 2.2 There is NO all-clubs artifact — club data is sharded per district

| What exists                                                       | Club-level?                                             | Global?                          |
| ----------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| `snapshots/{date}/district_{id}.json` (`PerDistrictDataSchema`)   | **Yes** — `data.clubs[]` + raw `data.clubPerformance[]` | No — 94 files                    |
| `snapshots/{date}/all-districts-rankings.json`                    | No — one row per district                               | Yes                              |
| `snapshots/{date}/global-totals.json` (#1498)                     | No — worldwide sums only                                | Yes                              |
| `v1/global-history.json` (#1499)                                  | No — one row per completed PY                           | Yes                              |
| `snapshots/{date}/competitive-awards.json` (#330)                 | No — district awards                                    | Yes                              |
| `config/club-index.json`                                          | id → name/district only (search index)                  | Yes, 987 KB **identity-encoded** |
| `snapshots/{date}/analytics/district_{id}_club-trends-index.json` | Yes — per-club goal + membership trend                  | No — per district                |
| `time-series/district_{id}/{PY}.json`                             | No — district aggregates per date                       | No                               |

**Consequence:** a client-side global leaderboard would mean 94 requests per
page view. Measured cost on 2026-09-11 (all 94 `district_*.json`, gzip on the
wire):

```
python3 scan.py 2026-09-11 → wireBytesAllDistricts: 4,480,262 (4.5 MB gz)
manifest fileSize Σ        → 49,315,187 bytes decoded (49.3 MB)
```

That is 50× the largest thing the frontend fetches today (`club-index.json`,
987 KB) and would be repeated on every visitor's first load. **A pre-computed
global artifact produced by the collector is mandatory; this is not a frontend
feature with a pipeline nice-to-have.**

### 2.3 The club-level fields the race needs all exist in the raw record

From `snapshots/2026-09-11/district_61.json` → `data.clubPerformance[0]` (raw
CSV columns, verbatim) and the typed `data.clubs[0]`:

| Need               | Raw `clubPerformance` column               | Typed `clubs[]` field            | Notes                                                                                                   |
| ------------------ | ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Goals met (count)  | `Goals Met`                                | `dcpGoals: number`               | Use the count; **never infer which goals** (tripwire)                                                   |
| Per-goal booleans  | `Level 1s` … `Off. List On Time` (10 cols) | `dcpGoalsAchieved: boolean[10]`  | Independent goals — the array is the source, not a 1..N prefix                                          |
| Members            | `Active Members`                           | `membershipCount`                |                                                                                                         |
| Base               | `Mem. Base`                                | `membershipBase`                 | Net growth = members − base (§4.4)                                                                      |
| CSP submitted      | `CSP` (`Y`/`N`)                            | `cspSubmitted?: boolean`         | Absent before PY 2025-26 → treat as submitted (`getCSPStatus`)                                          |
| Official tier code | `Club Distinguished Status` (`'' D S P M`) | `distinguishedStatus?: string`   | Normalise with `classifyDistinguishedTier` / `normalizeTierCode` (word forms exist historically, #1431) |
| Club identity      | `Club Number` (zero-padded `00003045`)     | `clubId: '3045'` (unpadded)      | Match on the normalised form both ways (#1229)                                                          |
| Division / Area    | `Division`, `Area`                         | `divisionId`, `areaId`           |                                                                                                         |
| Country            | —                                          | `address.country` (FAC-enriched) | Present only after `merge-find-a-club`; optional                                                        |

The Distinguished ladder is already a single tested function —
`determineDistinguishedLevel(dcpGoals, membership, netGrowth, programYear)` in
`packages/analytics-core/src/analytics/ClubEligibilityUtils.ts` — with the
ruleset selected by program year (Smedley rung only from PY 2025-26, #1406) and
the CSP gate layered on by callers (`getCSPStatus`, #1139). The spec reuses it
and adds no second definition (Lesson 052 / 117).

Thresholds (rules-reference §3.2, mirrored in `CLUB_TIERS_2025`):

| Tier          | Goals | Members | Alternative       |
| ------------- | ----- | ------- | ----------------- |
| Distinguished | 5     | 20      | OR net growth ≥ 3 |
| Select        | 7     | 20      | OR net growth ≥ 5 |
| President's   | 9     | 20      | —                 |
| Smedley       | 10    | 25      | — (PY 2025-26+)   |

### 2.4 The single most important finding: TI's official tier code is a wall, not a race

Rules-reference §3.4: _"Distinguished status is only valid from April 1 onwards."_
The data confirms TI implements this literally. Scanning **every** district file
on each date (`scan.py`, run 2026-09-12):

| Date       | Districts | Clubs  | Clubs with a tier code (`D/S/P/M`)                                     | Clubs meeting Distinguished requirements on the numbers but **no** code |
| ---------- | --------- | ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 2026-03-31 | 128       | 14,963 | **0**                                                                  | **4,129**                                                               |
| 2026-04-30 | 128       | 14,660 | **3,479** (D 1,134 · S 965 · P 624 · M 756)                            | 2                                                                       |
| 2026-05-31 | 128       | 14,734 | 4,225 (D 1,336 · S 1,047 · P 781 · M 1,061)                            | 1                                                                       |
| 2026-06-30 | 128       | —      | 6,587 (`global-totals.json`: base 2,349 · S 1,037 · P 1,289 · M 1,912) | —                                                                       |

Three conclusions, each load-bearing for the design:

1. **"First to be Distinguished" on the official code is a 3,479-way tie** on
   the first snapshot after April 1. There is no race in that signal. (This is
   the same seasonal gap Lesson 123 found in `totals.distinguished*`.)
2. **TI's stamp is exactly the formula.** On 04-30 only 2 of 3,481 formula-
   qualifying clubs lacked a code; on 05-31 only 1. So "met the requirements"
   computed from raw fields is a faithful, testable proxy — and it is the
   _only_ signal that produces a race.
3. **The race is real on the derived signal.** Current PY 2026-27, Distinguished
   requirements met (goals ≥ 5 AND (members ≥ 20 OR net growth ≥ 3) AND CSP
   not `false`):

   | Snapshot                              | Clubs meeting Distinguished requirements |
   | ------------------------------------- | ---------------------------------------- |
   | 2026-07-26 (first snapshot of the PY) | **1**                                    |
   | 2026-07-31                            | 10                                       |
   | 2026-08-31                            | 104                                      |
   | 2026-09-11                            | 184                                      |

   One club in the world had crossed the line on the first snapshot. That is a
   leaderboard people will screenshot.

**Design rule that follows:** the race is run on _"met the requirements for
{tier}"_ (derived, per snapshot, from raw `clubPerformance` via
`determineDistinguishedLevel` + `getCSPStatus`). The official TI code is shown
as a **confirmation badge** once it appears (April onward), never as the race
clock. Copy must say "met Distinguished requirements", not "became
Distinguished", before the official stamp — §3.4 says pre-April clubs "are not
officially recognized", and `provisionalDistinguished.ts` documents why:
pre-April `Active Members` still counts members who will not renew in April.

### 2.5 History and date resolution: crossing dates are recoverable only if captured at collection time

`v1/dates.json` (185 dates, 3,480 B) shows the cadence:

- **2017-01-31 → 2026-05-31: month-end only** (one snapshot per month).
- **2026-06-06 → today: daily, with gaps** — 06-06…06-30 daily; then 07-26…07-31;
  08-11…08-17; 08-19…08-31; 09-04…09-11. (Jul 1–25, Aug 1–10, Aug 18, Sep 1–3
  have no snapshot; the 07-01→07-25 gap is TI's program-year rollover lag, #1284.)
- **Prune policy (`PruneService.ts`, #181/#1280): keeps two snapshots per month**
  — the month-end and the first-of-month — and deletes the rest. The quarterly
  prune is operator-gated and not yet wired as a trigger, but it is the stated
  retention contract.

So a crossing date derived _after the fact_ from surviving snapshots degrades
from "the day it happened" to "sometime in a ~2-week window" once a prune runs.
The PY 2025-26 race (backfilled) is inherently **monthly** resolution.

Existing per-club history does not rescue this:

- `ClubTrendsStore` (`club-trends/{PY}/district_{id}.json`, R9 pattern) keeps
  per-club `dcpGoalsTrend` + `membershipTrend` per date — but **no CSP history**
  (a hard gate since 2025-26) and it is per district (94 files).
- `time-series/district_{id}/{PY}.json` is district aggregates only
  (`distinguishedTotal` — which is the official code count, i.e. 0 until April).

**Design rule that follows (R9):** the collector must upsert a persistent,
GCS-backed **first-reached store** every daily run, recording for each club and
tier the first snapshot date on which the requirements were met **and the
previous snapshot date** (so the UI can say "between 08-17 and 08-19" honestly).
Pruning snapshots can then never erase a crossing.

### 2.6 Serving characteristics to design against

```
snapshots/…/*.json  → x-goog-stored-content-encoding: gzip, cache-control: max-age=3600, must-revalidate
v1/*.json, config/*.json → identity (NOT gzipped), cache-control: max-age=300
```

A new artifact must live under `snapshots/{date}/` to get gzip and the 1-hour
CDN TTL for free (`cp -r -Z` in the upload step). Putting it under `v1/` would
ship it uncompressed.

Reference sizes (wire / decoded): `all-districts-rankings.json` 6.3 KB / 90.6 KB;
`district_61.json` 52 KB / 761 KB; `district_F.json` 66 KB / 1.0 MB;
`competitive-awards.json` 12.6 KB / 223 KB; `global-totals.json` 2.0 KB / 12 KB;
`district_61_club-trends-index.json` 40 KB gz. Gzip ratio on these JSON files is
~14×.

### 2.7 Where a new global artifact slots in (existing precedent)

`AnalyticsComputeService.writeGlobalTotals()` already builds
`snapshots/{date}/global-totals.json` at `compute-analytics` time from the
district files present on the runner (`buildGlobalTotals` in
`packages/analytics-core/src/rollup/`), with a `backfill-global-totals` pipeline
mode and `scripts/build-global-totals.ts` as thin glue. The schema lives in
`packages/shared-contracts/src/schemas/global-totals.schema.ts` and is
validated by the CDN schema canary. **The new artifact copies this shape
exactly** — builder in analytics-core, store in collector-cli, schema in
shared-contracts, thin script for backfill.

---

## 3. Proposed pre-computed artifact

### 3.1 Two pipeline outputs

| Output                                 | Path                                                                                                         | Purpose                                                                                                                                                                                                                                    | Lifetime                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **First-reached store** (internal, R9) | `CACHE_DIR/club-race/{programYear}/first-reached.json` ↔ `gs://…/club-race/{programYear}/first-reached.json` | Accumulates the earliest snapshot date each club met each tier's requirements. Synced from GCS before compute, upserted, pushed back — same step as time-series/club-trends (`[daily] Sync time-series, club-trends, prev-year from GCS`). | One file per PY, ~14K entries, grows monotonically |
| **Published artifact**                 | `snapshots/{date}/global-club-race.json`                                                                     | What the frontend reads. Built from _today's_ district files + the store.                                                                                                                                                                  | Per date; gz on the wire                           |

The store is the source of truth for `reachedOn`; the artifact is a projection.
Rebuild and rescrape modes stream dates ascending, and the upsert uses
`min(existing, date)` per (club, tier), so re-running any date is idempotent.

### 3.2 Store schema (`ClubRaceStoreData`)

```ts
{
  programYear: '2026-2027',
  updatedAt: ISO,
  /** Every snapshot date ever upserted, ascending — gives "observedAfter". */
  observedDates: ['2026-07-26', '2026-07-27', …],
  clubs: {
    [clubId /* normalised, unpadded */]: {
      districtId: '61',           // district at first sighting; updated if the club moves
      reached: {
        Distinguished?: { on: '2026-08-12', after: '2026-08-11' | null },
        Select?:        { on: …, after: … },
        President?:     { on: …, after: … },
        Smedley?:       { on: …, after: … },
      },
      /** First snapshot date the official TI code (D/S/P/M) was seen. */
      official?: { code: 'S', on: '2027-04-01', after: '2027-03-31' },
    }
  }
}
```

`after` is `null` when `on` is the first observed date of the PY (the club was
already over the line when we started looking — copy: "by 26 Jul 2026").

### 3.3 Published artifact schema (`GlobalClubRaceSchema`, Zod, shared-contracts)

```ts
{
  _format: { version: '1.0.0', type: 'global-club-race' },
  date: '2026-09-11',                 // pinned snapshot date (SnapshotDate brand)
  programYear: '2026-2027',
  generatedAt: ISO,

  /** Same scope block as global-totals (#1465): the date's OWN rankings set. */
  scope: {
    districts: { total: 94, numbered: 93, includesUndistricted: true },
    clubsScanned: 14377,
    excludedDistricts: [],           // files present but not in the rankings set
  },

  /** Everything the UI needs to state its basis without hard-coding rules. */
  ruleset: {
    programYear: '2026-2027',
    cspRequired: true,               // PY ≥ 2025-26
    smedleyAvailable: true,          // PY ≥ 2025-26
    officialRecognitionFrom: '2027-04-01',
    tiers: [ { level:'Distinguished', goals:5, members:20, netGrowthAlternative:3 }, … ],
  },

  /** Date-resolution facts so the UI can be honest about "when". */
  observation: {
    firstObservedDate: '2026-07-26',
    previousSnapshotDate: '2026-09-10' | null,
    observedDates: 34,               // count, not the list (list lives in dates.json)
    resolution: 'daily' | 'monthly' | 'mixed',   // derived from median gap
  },

  /** Cumulative counts per snapshot date — the "race chart". */
  timeline: [
    { date: '2026-07-26', Distinguished: 1, Select: 0, President: 0, Smedley: 0, official: 0 },
    …
  ],

  /** Worldwide distribution, so any club's percentile is computable client-side
      from 11 + a few numbers — no 14K-row payload needed. */
  distribution: {
    goalsMet: [n0, n1, …, n10],                    // 11 buckets, Σ = clubsScanned
    membership: { lt12: n, from12to19: n, from20to24: n, ge25: n },
    byTierRequirementsMet: { none: n, Distinguished: n, Select: n, President: n, Smedley: n },
    byOfficialCode: { none: n, D: n, S: n, P: n, M: n },
    /** Cohort histograms for "clubs like yours": goalsMet × membership band. */
    cohorts: { lt12: [11], from12to19: [11], from20to24: [11], ge25: [11] },
  },

  /** Every club that has met at least Distinguished requirements this PY.
      Bounded by reality: 184 today, ≤ ~7,000 at a year-end (6,587 in 2025-26). */
  reached: [
    {
      clubId: '3045', clubName: 'Limestone City Club',
      districtId: '61', divisionId: 'A', areaId: '01',
      country: 'Canada' | null,
      /** Highest tier whose requirements are met TODAY (may be lower than a
          tier in `tiers` if membership fell — never hidden, never labelled). */
      currentLevel: 'Select',
      goalsMet: 7, members: 21, membershipBase: 18, netGrowth: 3, cspSubmitted: true,
      dcpGoalsAchieved: [true,false,…],          // 10 independent booleans (tripwire)
      tiers: {
        Distinguished: { reachedOn: '2026-08-12', observedAfter: '2026-08-11', rank: 37 },
        Select:        { reachedOn: '2026-09-04', observedAfter: '2026-08-31', rank: 4 },
      },
      official: { code: 'S', since: '2027-04-01' } | null,
    }, …
  ],

  /** District standings — 94 rows. */
  byDistrict: [
    {
      districtId: '61', region: '07', clubs: 161, paidClubBase: 158,
      reached: { Distinguished: 9, Select: 3, President: 1, Smedley: 0 },
      /** reached.Distinguished ÷ paidClubBase × 100 — Lesson 60 denominator. */
      percentOfBase: 5.7,
      firstReachedOn: { Distinguished: '2026-07-28', Select: '2026-08-20', President: null, Smedley: null },
      /** Worldwide firsts this district owns (rank 1 entries), for the podium. */
      worldwideFirsts: 0,
    }, …
  ],
}
```

Ranking rule (pipeline, unit-tested): within a tier, order by `reachedOn`
ascending; **ties share a rank** (competition ranking 1,1,1,4 — reuse the
semantics of `frontend/src/utils/tieRankingUtils.ts:computeTiedRanks`); tie
order within a date is `goalsMet` desc, then `members` desc, then `clubName`
— but the shared rank is what is displayed. Every club that reached on the
first observed date ties at rank 1 with `observedAfter: null`.

### 3.4 Size budget (calculated, to be verified in Phase 1 with a real file)

| Section           | Rows         | Bytes/row (decoded)                      | Sept       | Year-end    |
| ----------------- | ------------ | ---------------------------------------- | ---------- | ----------- |
| `reached`         | 184 / ~6,600 | ~330 (with the 10-boolean array + tiers) | 61 KB      | ~2.2 MB     |
| `byDistrict`      | 94           | ~260                                     | 25 KB      | 25 KB       |
| `timeline`        | ≤ 365        | ~90                                      | 3 KB       | 33 KB       |
| rest              | —            | —                                        | ~4 KB      | ~4 KB       |
| **Total decoded** |              |                                          | **~95 KB** | **~2.3 MB** |
| **Wire (÷14)**    |              |                                          | **~7 KB**  | **~165 KB** |

Year-end wire cost is below `club-index.json` (987 KB identity) which the omni
search already pulls. **Hard budget: the schema canary fails if the artifact
exceeds 3 MB decoded / 250 KB gz.** If `reached` growth ever threatens it, drop
`dcpGoalsAchieved` from the row (the club page has it) before anything else.

### 3.5 Pipeline wiring (small, bounded)

1. `[daily] Sync … from GCS` step: add `club-race/` to the synced prefixes (R2).
2. `AnalyticsComputeService`: after `writeGlobalTotals`, call
   `writeGlobalClubRace(snapshotDate)` → `ClubRaceStore.load|create` →
   `upsertFromSnapshots(date, districtFiles)` → `save` → `buildGlobalClubRace()`
   → write `snapshots/{date}/global-club-race.json`. Record
   `globalClubRacePath` / `globalClubRaceFailed` in the compute result, exactly
   as `globalTotalsFailed` is today.
3. Upload step: `club-race/` pushed back alongside `club-trends/`.
4. `scripts/build-global-club-race.ts` (thin glue) + pipeline mode
   `backfill-global-club-race` that walks a PY's dates ascending — used once to
   backfill PY 2025-26 (monthly) and 2026-27 (07-26 → today).
5. `scripts/check-cdn-schema.ts` (`cdn-schema-canary.yml`): add the artifact.
6. `packages/mcp-server`: **not in scope**; a `get-global-club-race` tool is
   listed as a follow-up (ADR-008 surface, §9).

---

## 4. UX

### 4.1 Routes (real subpages, ADR-005 — no client-side tabs)

Top-bar nav gains **Clubs** between Regions and Awards
(`AppShellTopBar.tsx` `NAV_LINKS`). All routes lazy-loaded in `App.tsx`.

| Route                                | Page                         | Content                                                                                                                                                                                                                                                                          | Phase |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `/clubs`                             | `ClubsWorldPage`             | Hub: KPI strip, podium preview (top 3 per tier), cumulative race chart, top-5 districts preview, basis/caveat block. Links out to everything below.                                                                                                                              | 2     |
| `/clubs/race/:tier`                  | `ClubsRacePage`              | Full "first to meet the requirements" leaderboard for one tier. `:tier ∈ distinguished \| select \| presidents \| smedley` (unknown → branded 404). Filter chips: region, district, country. `?highlight=<clubId>` scrolls to and outlines a row (deep link from the club page). | 2     |
| `/clubs/districts`                   | `ClubsDistrictStandingsPage` | District-vs-district table: clubs reached per tier, % of paid-club base, first-reached dates, worldwide firsts. Sortable; region filter.                                                                                                                                         | 3     |
| `/clubs/streaks`                     | `ClubsStreaksPage`           | Multi-year consecutive-Distinguished clubs (year-end official codes, 2016-17 →).                                                                                                                                                                                                 | 4     |
| `/district/:id/club/:cid` (existing) | `ClubDetailPage`             | New **"Worldwide standing"** card: percentile within cohort + link to `/clubs/race/:tier?highlight=:cid`.                                                                                                                                                                        | 2     |
| `/district/:id` (existing hub)       | —                            | One line in the Distinguished status card: "N clubs have met Distinguished requirements — Dth worldwide by share" → `/clubs/districts`.                                                                                                                                          | 3     |

A `ClubsSubnav` (`nav[aria-label="Clubs worldwide sections"]`, `aria-current`
on the active route) mirrors `DistrictSubnav`: _Overview · Race · Districts ·
Streaks_. Program-year selection reuses `useProgramYearControls` +
`DataControlsBar` (as `/awards` does); a past PY resolves to that year's latest
snapshot date (same rule as `global-history`'s `yearEndDate`). Freshness pill
via `useLatestAsOfDate` (pinned `SnapshotDate` vs as-of, epic #1319).

### 4.2 Screens

**Hub `/clubs`**

- Eyebrow (mono, `--rt-track-loose`): `PROGRAM YEAR 2026-2027 · AS OF 11 SEP 2026`.
- KPI strip (4 tiles, one per tier): count of clubs that have met the
  requirements, delta since previous snapshot, and — after April — the official
  count beside it ("184 met requirements · 0 confirmed by TI").
- **Podium** per tier: three cards, `--rt-stats` amber accent on rank 1, club
  name → club page, district chip → district, "reached by 26 Jul" / "between
  11 Aug and 12 Aug". Ties render as a stacked list under one rank label ("1st
  — 3 clubs"), never as three "1st" cards.
- **Race chart**: Recharts step line, cumulative clubs per tier by snapshot
  date; gap days are not interpolated (show as flat with a subtle gap marker,
  tooltip "no snapshot"). Pad y symmetrically when `range === 0` (tripwire).
- Top-5 districts by % of base → `/clubs/districts`.
- **Basis block** (always visible, not a tooltip): "Met the requirements" is
  computed from TI's dashboard fields under the PY ruleset; TI confirms
  recognition from April 1; pre-April membership includes members who may not
  renew; dates are snapshot dates — "between A and B" means we did not collect
  on the days in between. Link to `/methodology#club-race`.

**Race `/clubs/race/:tier`**

- Table (ADR-006 column model): Rank · Club (→ club page) · District (→ district)
  · Reached (date or "between A and B") · Goals met (10-dot strip from
  `dcpGoalsAchieved`, independent goals) · Members (with net growth) · Official
  (rosette from the recognition vocabulary when `official` is present).
- Default sort by rank; `useUrlSort` for the rest. Filters in the URL
  (`useUrlStringSet` for region/district/country) so a shared link reproduces
  the view (Lesson 070).
- Below 640 px the table becomes the existing card-row pattern with the rank and
  reach date as the primary line; horizontal scroll only inside the table
  container, never the body.
- Empty state (July): "No club has met {tier} requirements yet this program
  year. First snapshot: 26 Jul 2026." with last year's first-three as context.

**District standings `/clubs/districts`**

- Table: District · Region · Base clubs · Met D / S / P / Sm · % of base ·
  First reached (D) · Worldwide firsts. Default sort: % of base desc. **No
  "last place" affordance** — rows below the median carry no colour; the top
  decile gets the amber accent. "My district" pin via `useMyDistrict`.

**Club page card "Worldwide standing"**

- "Top 18 % of clubs worldwide by goals met · top 9 % among clubs with 20–24
  members" — computed from `distribution.cohorts` client-side.
- If the club has reached a tier: "37th club in the world to meet Distinguished
  requirements (12 Aug)" → deep link. If not: the next-tier gap the page
  already shows (`dcpProjections`), plus "N clubs like yours have reached it".
  No rank is ever shown for a club that has not reached.

### 4.3 Accessibility, mobile, brand

- Verify at 375 / 768 / 1280 px and in `[data-theme='dark']` (UX persona rule).
- Tables: `<caption>`, `th scope`, `aria-sort` via `SortableHeader`; podium
  duplicates as an ordered list for screen readers (`<ol>` is the DOM; the cards
  are presentation). Tier colour is never the only signal — rosette + label
  (recognition registry pattern, #1361). 44 × 44 targets. `prefers-reduced-motion`
  disables any chart animation. Axe scan in the integration project.
- Tokens: `--rt-stats` accent for rank-1 and top-decile highlights; text on
  `--rt-paper`/`--rt-bg-2` via `--rt-ink*`; never hand-edit
  `rt-brand-v1.css`. Legacy `--color-tm-*` stays for existing chrome (Phase 2
  chrome migration is blocked on ops#37).

---

## 5. Gamification mechanics — ranked shortlist

Scored on: does the data support it honestly (§2), does it motivate without a
victim, and does it earn a route.

### Recommended (build, in this order)

| #   | Mechanic                                                                 | Why it earns its place                                                                                                                                                                                          | Data                                                                    | Phase |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----- |
| 1   | **The Race — first to meet each tier's requirements, with dates**        | The headline. Positive-only (only clubs that crossed appear), naturally time-bound, has a real winner at daily resolution (1 club on 07-26). Ties are honest.                                                   | Store + artifact `reached[]`/`timeline`                                 | 2     |
| 2   | **Cohort percentile on the club page ("clubs like yours")**              | Every club gets a private, contextual number; small clubs compare to small clubs (membership bands), so a 14-member club at 4 goals can be "top 20 % of clubs your size". No list, no bottom.                   | `distribution.cohorts` — 44 numbers, no per-club payload                | 2     |
| 3   | **District-vs-district standings by share of base**                      | The one comparison district leaders already accept (they are ranked globally today). Uses the recognition denominator (paid-club base, Lesson 60) so a 40-club district and a 300-club district are comparable. | `byDistrict`                                                            | 3     |
| 4   | **Cumulative race chart (the "pack")**                                   | Turns the leaderboard into a season narrative: the July trickle, the April wall of official confirmations. Also the single best explainer of §2.4 to users.                                                     | `timeline`                                                              | 2     |
| 5   | **Streaks — consecutive years Distinguished+ (official year-end codes)** | Rewards sustained clubs, not just fast ones; 10 years of month-end history exist. Positive-only list.                                                                                                           | New year-end scan (≤ 10 dates × ≤ 132 files, backfill once, then +1/yr) | 4     |

### Rejected or deferred (and why)

| Mechanic                                                     | Verdict                        | Reason                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Global rank of every club (1 → 14,377)**                   | **Reject**                     | Has a bottom. Ranks 12,000-14,377 are small, new, or struggling clubs run by volunteers; publishing their number is shaming with no actionable content. The cohort percentile gives the same information privately.                                                                      |
| **Biggest climbers / fallers (movement)**                    | **Defer, climbers only**       | Climbers is fine; fallers is a public loss list. Needs prior-snapshot ranks — the store gives it cheaply. Consider as a hub "this week" strip in Phase 3 if usage warrants.                                                                                                              |
| **Regional races**                                           | **Fold into filters**          | A region filter on `/clubs/race/:tier` delivers it with zero new data; a separate route would be a nav item with no distinct content (ADR-005 §2).                                                                                                                                       |
| **Milestone badges (e.g. "first 100", "before Labour Day")** | **Defer**                      | Cute, but every badge is a rule someone must document in `/methodology` §10 and keep across PY rule changes. Ship the race first; badges can be derived from `rank` later without a data change.                                                                                         |
| **Country leaderboard**                                      | **Defer**                      | `address.country` depends on Find-A-Club enrichment; missing on the first snapshot of a PY (07-26 file was 1.77 MB vs 4.36 MB on 07-31 — FAC not yet merged). A country race with a hole in July is a support ticket. Available as a filter once the artifact carries `country \| null`. |
| **"Predicted to finish" projections**                        | **Reject for the global view** | `dcpProjections` exists per club, but a worldwide projection leaderboard is speculation presented as standing. Keep projections on the club page.                                                                                                                                        |
| **Points / XP / "levels" beyond TI's tiers**                 | **Reject**                     | TI already defines the ladder. Inventing a parallel score invites "your number is wrong" and undermines the methodology promise ("publish ours, state our basis").                                                                                                                       |

---

## 6. Fairness and ethics

This is a volunteer organisation; the club with 9 members meeting in a library
basement is doing something harder than the corporate club with 40. The design
commitments:

1. **No global list with a bottom.** Every list on `/clubs` is a list of
   achievements (reached, first, streak). A club that has not reached anything
   does not appear anywhere on the global surface.
2. **Percentiles are private and cohort-based.** Shown only on the club's own
   page, only as "top X %", only within a membership band. Never "you are
   11,204th".
3. **No "lost it" labels.** A club that met requirements in November and fell
   below 20 members in April keeps its reach date; the row shows today's numbers
   without a "lost" badge. TI's April confirmation is shown as a positive badge,
   not its absence as a negative one.
4. **Districts are ranked by share, not count**, and the district table has no
   bottom-decile styling. District leaders opted into global rankings already
   (`/` Borda rankings); clubs did not.
5. **Language.** "Met Distinguished requirements", "first to reach", "confirmed
   by TI" — never "winner"/"loser", never "Distinguished" for an unconfirmed
   club. The basis block is always visible.
6. **Undistricted `U` clubs** are eligible for the race (they are clubs) but `U`
   appears in `byDistrict` with `percentOfBase: null` — it has no base and cannot
   earn district recognition (#1426 ruling 4).

---

## 7. Performance

- **One request** for the whole `/clubs` area: `snapshots/{date}/global-club-race.json`
  (gz on the wire, 1-hour CDN TTL). Fetched via `fetchLatestSnapshotDate()` →
  `fetchCdnGlobalClubRace(date: SnapshotDate)` with `GlobalClubRaceSchema.safeParse`
  (same shape as `fetchCdnGlobalTotals`).
- Hook `useGlobalClubRace(date)` — `queryKey: ['global-club-race', date ?? 'latest']`,
  default `staleTime` 5 min / `gcTime` 10 min from `queryClient` (unchanged).
  All four routes share the query; navigating between subpages is free.
- Rendering: `reached` is ≤ 200 rows for most of the year and ≤ ~7,000 at year
  end. Phase 2 renders the race table with **`@tanstack/react-table` (already a
  dependency, ADR-006) + windowing above 500 rows** (`@tanstack/react-virtual`
  is the natural add — treat as a dependency decision, Software Architect
  persona). Filters run on the in-memory array.
- Club page: `distribution` only — no join against `reached` unless the club id
  is present (O(n) `find` on ≤ 7K rows is fine; precompute a `Map` in the hook).
- No new backend, no new request per club. Lighthouse budget: the hub must not
  regress CLS — reserve the KPI/podium slots with height-matched skeletons while
  the query resolves (Lesson 107 tripwire).

---

## 8. Edge cases

| Case                                                                     | Handling                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First snapshot of a PY (07-26): many clubs already over the line         | All tie at rank 1, `observedAfter: null`, copy "by 26 Jul 2026". The chart starts at that date; a caption states the PY rollover gap (#1284).                                                                                                         |
| Snapshot gaps (Aug 1–10, Aug 18, Sep 1–3)                                | `observedAfter` carries the true previous date; UI renders "between 17 Aug and 19 Aug". Never interpolate.                                                                                                                                            |
| Pruned dailies later                                                     | Store already holds the day; artifact for a surviving date is regenerated from the store, resolution preserved. Document in `docs/production-maintenance.md`.                                                                                         |
| Rewriting a past date (rescrape / rebuild)                               | Upsert is `min(existing, date)` per (club, tier) → idempotent. If a date is _deleted_ as wrong, a `rebuild-club-race` from surviving snapshots is required (resolution may degrade); loud stderr warning + a `store.rebuiltFrom` field.               |
| Club moves district (2026-07-01 reformation; mid-year transfers)         | Keyed by clubId; `districtId` updated to the latest sighting; `byDistrict` counts the club where it is _today_. A transfer never resets `reachedOn`.                                                                                                  |
| Club suspended/closed after reaching                                     | Stays in `reached` for the PY (it did reach); `currentLevel` reflects the latest snapshot; no label.                                                                                                                                                  |
| Membership falls below threshold after reaching (pre-April non-renewers) | `reachedOn` is immutable; `currentLevel` may be lower than the reached tier; §6.3 — no "lost" badge.                                                                                                                                                  |
| CSP flips `true → false` (rare, #1460)                                   | Same as above; the reach date stands; `currentLevel` drops.                                                                                                                                                                                           |
| PY < 2025-26 (backfill)                                                  | `cspRequired: false`, `smedleyAvailable: false`; the Smedley route renders "This tier did not exist in 2024-25" (never a zero list, #1406).                                                                                                           |
| PY 2025-26 backfill is monthly                                           | `observation.resolution: 'monthly'`; every `observedAfter` is the previous month-end; copy says "during August 2025".                                                                                                                                 |
| Official code appears (April) for a club never seen meeting requirements | Possible (TI data corrections, the 2-club discrepancy on 04-30). Include in `reached` with `tiers` empty for the derived signal and `official` set; rank only among derived reachers; log the count in `scope.officialWithoutDerived` for the canary. |
| Word-form tier values in historical files                                | `classifyDistinguishedTier` (substring-based, #1431).                                                                                                                                                                                                 |
| Zero-padded ids (`00003045`)                                             | Normalise once in the store; never string-compare padded vs unpadded.                                                                                                                                                                                 |
| `U` district                                                             | Eligible clubs; `percentOfBase: null`; excluded from district standings sort by default.                                                                                                                                                              |
| Missing district file on a date                                          | `scope.excludedDistricts`/`missing` published; the date's artifact still writes; the store is not upserted for absent districts (no false "lost").                                                                                                    |
| Artifact absent (pre-feature dates)                                      | Hook returns `null`; pages render the "not available for this date" state; nav item still present.                                                                                                                                                    |

---

## 9. Open questions

1. **Naming of the derived state** — "met the requirements for Distinguished"
   is accurate but long. Candidates: _Qualified_ (TI-neutral), _On the line_,
   _Reached_. Needs an operator ruling; it appears in every heading.
2. **Should the race honour TI's April 1 rule by hiding derived reach dates
   before April?** Recommendation: no — the pre-April signal is the whole race;
   §2.4 shows the official stamp is a wall. But this is the biggest product/
   ethics call and should be ruled on explicitly (and logged in `/methodology`
   §10 as a basis statement, not a rule change).
3. **Year-end freeze.** After 30 Jun the store for that PY should be frozen
   (no further upserts from July dates that TI still reports under the prior
   PY during rollover lag, #1284). Which signal freezes it — `resolveActiveProgramYear`
   or the closing-date registry?
4. **Tie policy on the first observed date.** Competition ranking (all rank 1)
   is proposed; an alternative is to exclude the first-observed-date cohort
   from "first" honours and label them "already there". Product call.
5. **Dependency:** `@tanstack/react-virtual` for the year-end 7K-row table vs.
   server-side pagination in the artifact (`reached` split into
   `reached-{tier}.json`). Recommend virtualisation (one artifact, one request);
   confirm with the Architect persona.
6. **MCP exposure** (`get-global-club-race`, ADR-008) — same sprint or follow-up?
7. **Streaks source** — official year-end code only (strict) or derived
   requirements at year-end (lenient, catches years TI's archive lost the code)?
   Strict is recommended; it is what the club's plaque says.

---

## 10. TDD test plan

Conventions: unit tests never mount a page (R22, `test:no-page-mounts:check`);
page mounts live in `frontend/src/pages/__tests__/` or
`src/__tests__/integration/`; no `testTimeout` bumps; quarantine stays empty.

### analytics-core (`packages/analytics-core/src/rollup/`)

- `clubRace.test.ts` — pure builder `buildGlobalClubRace({date, programYear, districtFiles, store})`:
  - Red: club at 5 goals/20 members/CSP `true` → in `reached` with `currentLevel: 'Distinguished'`; CSP `false` (PY ≥ 2025-26) → absent; CSP `undefined` (PY 2024-25) → present.
  - Net-growth alternative: 5 goals, 18 members, base 15 → Distinguished; same at 7 goals → Select only if growth ≥ 5.
  - Smedley absent for PY 2024-25 even at 10 goals/25 members.
  - `dcpGoalsAchieved` copied verbatim — property test: builder never derives goals from the count (fixture with goals met at indices {9, 3} only).
  - Ranking: same `reachedOn` → shared rank; next rank skips (1,1,1,4).
  - `observedAfter` = previous store date; `null` on first observed date.
  - `byDistrict.percentOfBase` uses `paidClubBase` (Lesson 60); `U` → `null`.
  - Distribution buckets sum to `clubsScanned`; cohort rows sum to the membership band counts.
  - Scope: a district file not in the date's rankings set → `excludedDistricts`, not counted (#1465).
  - Official code with no derived reach → `officialWithoutDerived` incremented, row present, no derived rank.
- `clubRace.property.test.ts` — monotonicity: for any ascending date sequence, `reachedOn` per (club, tier) never moves later; re-applying a date is a no-op.

### collector-cli

- `ClubRaceStore.test.ts` — load/create/upsert/save round-trip; `min()` upsert on out-of-order dates; id normalisation (`00003045` ≡ `3045`); district move updates `districtId` without touching `reached`; absent district on a date does not touch its clubs.
- `AnalyticsComputeService` — `globalClubRaceFailed` set and logged on builder throw; `global-totals` unaffected (isolation).
- `scripts/lib/clubRaceBackfill.test.ts` — walks a PY's dates ascending; monthly PY yields `resolution: 'monthly'`.

### shared-contracts

- `global-club-race.schema.test.ts` — round-trips the fixture; rejects negative counts, unknown tier keys, `percentOfBase` > 100; `_format.type` literal.
- `check-cdn-schema.ts` canary: artifact present for the latest date and ≤ budget (3 MB decoded).

### frontend — unit project

- `services/__tests__/cdn.globalClubRace.test.ts` — URL is `snapshots/{date}/global-club-race.json`; 404 → `null`; invalid shape → `null` + telemetry.
- `hooks/__tests__/useGlobalClubRace.test.tsx` — resolves latest date when undefined; `queryKey` stable; returns `Map` by clubId.
- `utils/__tests__/reachWindowCopy.test.ts` — `('2026-08-19','2026-08-17')` → "between 17 Aug and 19 Aug"; `('2026-07-26', null)` → "by 26 Jul 2026"; consecutive days → "on 12 Aug".
- `utils/__tests__/cohortPercentile.test.ts` — percentile from `distribution.cohorts`; band boundaries (12, 20, 25); empty cohort → `null` (never 100 %).
- `components/clubs/__tests__/RacePodium.test.tsx` — ties render as one rank with a stacked list; rank-1 uses the `--rt-stats` accent class; `<ol>` semantics.
- `components/clubs/__tests__/RaceTable.test.tsx` — 10-dot goal strip renders from the boolean array (fixture with non-prefix goals); official rosette only when `official` present; `?highlight` row gets `aria-current="true"`.
- `components/clubs/__tests__/ClubsSubnav.test.tsx` — `nav[aria-label]`, `aria-current` on active route.
- Guard: `src/__tests__/guards/clubsRaceNoBottom.guard.test.ts` — asserts no component under `components/clubs/` imports a "full list" sorter that could render unreached clubs (the exported fixture of 14K clubs must produce ≤ `reached.length` rows). Falsifiable by design.

### frontend — integration project

- `pages/__tests__/ClubsWorldPage.test.tsx`, `ClubsRacePage.test.tsx`,
  `ClubsDistrictStandingsPage.test.tsx` — mount with mocked hook; empty-July
  state; unknown `:tier` → 404 element; PY switch refetches the year-end date.
- `ClubDetailPage` — "Worldwide standing" card present/absent cases.
- Axe: all four routes, light + dark.
- Deep-link audit entries (`docs/design/deep-link-audit-2026-05-30.md` pattern):
  filters and `highlight` round-trip through the URL.

### Live verification (DoD)

- PR preview channel: `/clubs` renders the real artifact; the rank-1 club on
  2026-07-26 matches `scan.py 2026-07-26` (1 club) — recorded in the PR.
- Lighthouse CI: CLS ≤ 0.1 on `/clubs` (skeleton reservation).

---

## 11. Phased plan (small commits, each referencing the tracking issue)

Each phase is its own sprint issue under one epic; every bullet is a red → green
→ refactor triple committed separately.

**Phase 0 — Decision record (1 PR, docs only)**

- ADR-012 _"Global club race: derived-requirements signal, collector-built artifact, R9 store"_ — captures §2.4/§2.5 and the open-question rulings.
- `/methodology#club-race` basis text + `programYearRuleChanges.ts` guard satisfied (no rule change, a basis statement).

**Phase 1 — Pipeline (analytics-core → shared-contracts → collector-cli)**

1. `feat(contracts): GlobalClubRaceSchema + fixture`
2. `feat(analytics): buildGlobalClubRace pure builder` (tests first)
3. `feat(analytics): tie ranking + observedAfter`
4. `feat(collector): ClubRaceStore (R9)`
5. `feat(collector): write global-club-race.json in compute-analytics`
6. `ci(pipeline): sync club-race/ from GCS; push back on upload`
7. `feat(scripts): build-global-club-race + backfill mode`
8. `ci(canary): add global-club-race to check-cdn-schema`
9. Backfill dispatch: PY 2025-26 (monthly) and 2026-27 (07-26 →). Verify on
   staging → promote. Record the measured artifact sizes in the ADR.

**Phase 2 — Frontend core (`/clubs`, `/clubs/race/:tier`, club card)**

1. `feat(cdn): fetchCdnGlobalClubRace + useGlobalClubRace`
2. `feat(clubs): reach-window copy + cohort percentile utils`
3. `feat(clubs): ClubsSubnav + routes + nav link` (404 for bad tier)
4. `feat(clubs): hub KPI strip + podium (skeleton-reserved)`
5. `feat(clubs): race chart`
6. `feat(clubs): race table (react-table; virtualise > 500 rows)`
7. `feat(club-detail): Worldwide standing card + highlight deep link`
8. `docs(spec): product-spec.md Shipped row; lessons if any`

**Phase 3 — District standings**

1. `feat(clubs): /clubs/districts table` 2. `feat(district-hub): one-line link` 3. a11y + deep-link audit.

**Phase 4 — Streaks + MCP (separate epics, each needs its own data decision)**

---

## 12. Acceptance criteria

**Pipeline**

- [ ] `snapshots/{latest}/global-club-race.json` exists on prod, validates against `GlobalClubRaceSchema`, gz on the wire, ≤ 3 MB decoded.
- [ ] `reached.length` on 2026-07-26 equals 1 and on 2026-09-11 equals 184 for the Distinguished tier (matches `scan.py`; a mismatch must be explained by the ruleset, not tolerated).
- [ ] On 2026-04-30 (PY 2025-26 backfill) the official-code count in `distribution.byOfficialCode` equals 3,479 and `officialWithoutDerived` ≤ 2.
- [ ] Re-running compute for an already-stored date changes no `reachedOn`.
- [ ] After a simulated prune (delete a daily snapshot locally), regenerating a later date's artifact preserves the pruned day's `reachedOn`.
- [ ] `global-totals.json` output is byte-identical before/after the change (isolation).

**Frontend**

- [ ] `/clubs`, `/clubs/race/{distinguished,select,presidents,smedley}` are real routes with back-button and deep-link fidelity; `/clubs/race/foo` renders the branded 404.
- [ ] No global surface renders a club that has not met at least Distinguished requirements (guard test green).
- [ ] Every reach date renders as "on D", "between A and B", or "by D" per `observedAfter`; no date is ever shown as a point when it was a window.
- [ ] Pre-April copy never uses "Distinguished" without "requirements"; the official rosette appears only when `official` is set.
- [ ] Club page shows a cohort percentile for any club; shows a rank only when the club has reached.
- [ ] Verified at 375 / 768 / 1280 px, light + dark; axe clean; CLS ≤ 0.1 on `/clubs`.
- [ ] Unit project contains no page mounts (`test:no-page-mounts:check` green); quarantine empty; no timeout bumps.
- [ ] PR preview channel verification recorded in the PR; `docs/product-spec.md` updated.

---

## Appendix A — Reproduction commands

```bash
# Cadence
curl -s --compressed https://cdn.taverns.red/v1/dates.json | python3 -c "import json,sys; d=json.load(sys.stdin)['dates']; print(len(d), d[-40:])"

# Sizes (wire vs decoded)
for p in snapshots/2026-09-11/all-districts-rankings.json snapshots/2026-09-11/district_61.json config/club-index.json; do
  printf "%s wire=%s decoded=%s\n" "$p" \
    "$(curl -s https://cdn.taverns.red/$p -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}')" \
    "$(curl -s --compressed https://cdn.taverns.red/$p | wc -c)"; done

# Per-district tier population on a date
curl -s --compressed https://cdn.taverns.red/snapshots/2026-04-30/district_61.json | python3 -c "
import json,sys,collections; c=json.load(sys.stdin)['data']['clubs']
print(collections.Counter((x.get('distinguishedStatus') or '') for x in c))"
```

`scan.py` (worldwide scan used for §2.4/§2.5 — kept out of the repo; recreate
in a scratch dir): for each `districtId` in the date's
`all-districts-rankings.json`, fetch `district_{id}.json`, count
`distinguishedStatus` codes and clubs with `dcpGoals ≥ 5 AND (membershipCount ≥ 20
OR membershipCount − membershipBase ≥ 3) AND cspSubmitted !== false`, and sum
gzip wire bytes.

## Appendix B — Source anchors

- Ladder + CSP: `packages/analytics-core/src/analytics/ClubEligibilityUtils.ts` (`determineDistinguishedLevel`, `getCSPStatus`, `classifyDistinguishedTier`, `isClubSmedleyAvailable`)
- Provisional rule: `frontend/src/utils/provisionalDistinguished.ts`; rules-reference §3.4
- Existing global rollup precedent: `packages/analytics-core/src/rollup/globalTotals.ts`, `AnalyticsComputeService.writeGlobalTotals`, `scripts/build-global-totals.ts`, `packages/shared-contracts/src/schemas/global-totals.schema.ts`
- R9 store precedent: `packages/collector-cli/src/services/ClubTrendsStore.ts`
- Prune contract: `packages/collector-cli/src/services/PruneService.ts`
- Route conventions: `docs/architecture-decisions/005-district-subpage-ia-and-secondary-nav.md`; `frontend/src/App.tsx`; `frontend/src/components/DistrictSubnav.tsx`
- Pinned-date brand: `frontend/src/types/snapshotDate.ts`
- Tie ranks: `frontend/src/utils/tieRankingUtils.ts`
- Lessons: 057 (year-cumulative metrics), 060 (paid-club base denominator), 107 (reserve above-the-fold slots), 123 (`totals.distinguished*` unpopulated mid-year)
