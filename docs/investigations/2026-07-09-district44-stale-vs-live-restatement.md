# District 44 stale-vs-live discrepancy — upstream restatement, no internal bug

**Date:** 2026-07-09 · **Type:** research-only investigation (no code changes)
**Symptom:** `ts.taverns.red/district/44?date=2026-06-30` shows 125 clubs / 5,151 payments;
the live TM dashboard shows 127 / 5,202. Delta = two late-June charters
("Finer Women Speak", chartered 06/25, +30; "City of Refuge", chartered 06/29, +21).

## Verdict

**Pure upstream restatement lag. No internal aggregation bug.** Our snapshot is a
faithful, internally consistent copy of the dashboard at crawl time
(2026-07-09T09:03Z). TM mutated the June close **later the same day, under the
same "As of 07/08/2026" stamp**. Self-heals on the next daily crawl; CPAA
auto-promotes it. No code change warranted.

---

## Q1 — TM dashboard update cadence

### "A day behind" — confirmed, with the precise mechanism

- Our daily pipeline is triggered by a launchd job at **05:00 America/Toronto
  (09:00 UTC)** (`.github/workflows/data-pipeline.yml:20-24`; GH cron was too
  unreliable, #1242).
- Today's run collected at **2026-07-09T09:03:04Z**
  (`raw-csv/2026-07-08/metadata.json` → `timestamp: 1783587784114` =
  2026-07-09T09:03:04Z) — yet the CSV footers read **"Month of Jun, As of
  07/08/2026"**, so the collector keyed the crawl to `raw-csv/2026-07-08/`.
- Mechanism: TM's overnight batch publishes data stamped with the **previous
  business day's** as-of date. A crawl on day N always retrieves "As of N−1"
  data. That is the exact sense in which "the dashboard is always a day behind."

### The as-of stamp is NOT a content version (new finding)

Fetched live at ~2026-07-09T15:30Z:

```
$ curl -s "https://dashboards.toastmasters.org/export.aspx?type=CSV&report=districtperformance~44~~~2025-2026" | tail -1
Month of Jun, As of 07/08/2026
```

Same "As of 07/08/2026" stamp as our 09:03Z crawl — but the live export now has
**127 club rows, Total-to-Date sum 5,202**, including both missing charters. Our
09:03Z crawl of the identical endpoint got 125 / 5,151. **TM mutates the
reporting data intraday during closing without advancing the as-of stamp.** Two
crawls with identical footers can carry different data; content is settled only
after the month formally closes.

### The restatement window (from `docs/month-end-closing-dates.json`)

Regular months close ~5–14 days into the next month. **June (program year end)
stays open far longer** — late dues and late-processed charters are folded
retroactively into the June close:

| PY-end June | Closed on | Window  |
| ----------- | --------- | ------- |
| 2017-06     | 07-24     | 24 days |
| 2018-06     | 07-23     | 23 days |
| 2019-06     | 07-16     | 16 days |
| 2020-06     | 07-12     | 12 days |
| 2021-06     | 07-18     | 18 days |
| 2022-06     | 07-25     | 25 days |
| 2023-06     | 07-19     | 19 days |
| 2024-06     | 07-19     | 19 days |
| 2025-06     | 07-20     | 20 days |

Expect **2026-06 to remain mutable until roughly July 16–25**. The dashboard's
own banner ("reports … are not yet final") says the same. Charter date ≠
processing date: our snapshot already contains **Dobbins Toastmasters (chartered
2026-06-25)** and **LMLA C3 (2026-06-22)** — same charter week as the two
missing clubs, but processed by TM before our crawl. "Finer Women Speak"
(also chartered 06-25) was processed ~2 weeks after its charter date.

## Q2 — No internal aggregation across crawl dates

The user's "aggregating from multiple sources" suspicion is true only
**within a single crawl**, never across dates:

- `DataTransformer.transformRawCSV()`
  (`packages/analytics-core/src/transformation/DataTransformer.ts:89-133`)
  receives one `RawCSVData` (the three CSVs of **one** crawl of one district).
  `extractClubs(clubPerformance, districtPerformance)` (line 105) merges payment
  fields from district-performance into the club-performance club list — same
  crawl, one club universe. Divisions, areas, **and totals are all derived from
  that single merged clubs array** (lines 114-119, comment at 107-113, #1124).
- `calculateTotals(clubs)` (lines 538-575): `totalClubs = clubs.length`,
  `totalPayments = Σ club.paymentsCount`, distinguished tiers classified
  per-club from the verbatim status column. **By construction, `clubs[]` and
  `totals` cannot diverge** — there is no code path where a club appears in the
  list but not in totals, or vice-versa.
- `TransformService.transform()` (`packages/collector-cli`) is the single
  district-loop (per the CLAUDE.md tripwire); `sourceCsvDate` is recorded at
  `TransformService.ts:1083`. The closing remap re-keys the whole crawl
  (raw-csv/2026-07-08 → snapshots/2026-06-30); it never splices two crawls.
- `FindAClubMerger.mergeFacIntoSnapshot()` enriches existing clubs with FAC
  metadata (address/coordinates) and stores FAC-only clubs **separately** as
  `prospectiveClubs` (#489/#490) — it adds nothing to `clubs[]` or totals.
- `ClubTrendsStore` / `TimeSeriesIndexWriter` are downstream accumulators
  (sync → upsert → save); they never feed back into snapshots.

## Q3 — Internal consistency of our 2026-06-30 snapshot: verified

From `https://cdn.taverns.red/snapshots/2026-06-30/district_44.json`
(prod CDN, `collectedAt: 2026-07-09T09:03:04.787Z` — today's run already
refreshed this pinned snapshot):

| Check                 | clubs[]                    | totals                   | Match              |
| --------------------- | -------------------------- | ------------------------ | ------------------ |
| Club count            | `len(clubs) = 125`         | `totalClubs = 125`       | ✓                  |
| Payments              | `Σ paymentsCount = 5151`   | `totalPayments = 5151`   | ✓                  |
| Membership            | `Σ membershipCount = 2350` | `totalMembership = 2350` | ✓                  |
| Distinguished D/S/P/M | —                          | 22/11/9/17 (Σ=59)        | ✓ = live dashboard |

Distinguished counts match live exactly because the two new charters carry no
DCP status yet. Neither "City of Refuge" nor "Finer Women Speak" appears in
`clubs[]` — absent from list **and** totals, consistently. Club status mix:
115 Active / 6 Suspended / 4 Ineligible.

## Q4 — Recommendation: no code change

1. **Self-heals automatically.** Tomorrow's 09:00 UTC crawl (as-of 07/09) picks
   up 127 clubs; the closing remap re-keys it onto `snapshots/2026-06-30`. The
   CPAA promote policy after amendments #1092/#1289/#1292
   (`docs/investigations/closing-period-promote-policy-2026-06-03.md`) treats
   counter and base moves on closing-pinned dates as pure provenance — a +2-club
   / +51-payment lump auto-promotes without operator action. This exact pattern
   has promoted daily through 07-01…07-08.
2. **The UX caveat already exists.** The normalized freshness pill (#1296,
   #1310) shows an amber dot with "_June 2026 month-end reconciliation — figures
   update daily until finalized. As of {date}_"
   (`frontend/src/components/DataControlsBar.tsx:58`,
   `frontend/src/utils/dataFreshness.ts`) whenever the viewed date is the
   pinned latest month-end — which `?date=2026-06-30` currently is. We do not
   present the June close as final.
3. **One durable insight for epic #1319 (snapshot-date-guard):** the as-of
   stamp is a _floor_, not a content version — identical `sourceCsvDate` on two
   crawls does not imply identical data (proven today). Any future logic that
   dedupes/short-circuits on "as-of unchanged" would be wrong during closing.
   Worth a note on the epic; no sprint needed now.
4. **Minor doc drift (optional chore):** `docs/data-pipeline-flow.md:25` still
   says the daily mode is "Scheduled (08:00 + 11:00 UTC)"; the actual trigger is
   the single external launchd dispatch at 05:00 Toronto (09:00 UTC), per the
   workflow header. A second afternoon crawl during the closing window would
   halve restatement staleness, but given the pill messaging and daily
   self-heal, it is not warranted.

## Evidence trail

- `gsutil ls gs://toast-stats-data-staging/raw-csv/` → …07-06, 07-07, 07-08 (no 07-09; today's crawl keyed to 07-08 by its as-of footer)
- `gsutil cat gs://toast-stats-data-staging/raw-csv/2026-07-08/metadata.json` → `date: 2026-07-08`, `timestamp: 2026-07-09T09:03:04Z`
- `curl --compressed https://cdn.taverns.red/snapshots/2026-06-30/district_44.json` → totals/clubs verification above
- Live export (2026-07-09 ~15:30Z): 127 rows, Σ 5,202, footer "Month of Jun, As of 07/08/2026", both charters present
- `docs/month-end-closing-dates.json` — closing registry (ADR-011)
- Lessons: `tasks/lessons/lessons/key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate.md` (recurrence #4 of the divergence class), `resolve-the-active-program-year-by-data-not-the-calendar.md`
