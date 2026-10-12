# Runbook — Prior-PY Education-Achievement backfill (operator-run)

**Epic:** #1145 · **Sprint:** #1146 (command + runbook) · **Bulk run:** #1070
**Approval:** operator ruling 2026-06-10 on #1070 (spike #1063 §1a decision #8)
**Posture:** one-shot, validate-first through staging (ADR-002). The command
writes the **local cache only**; every GCS step below is explicit and
operator-executed.

## What this does

The TI "Educational Achievement Archive" report returns a **prior program
year's** full achievement ledger via the `year` param. The
`backfill-education-archive` collector command fetches it per (district, PY),
aggregates to **de-identified per-(club, award) counts** (`achievementCount` —
RAW activity, NOT DCP credit, #1080/#1099), and writes/merges
`snapshots/<endYear>-06-30/district_<id>_reports.json`. Those PY-end month-end
snapshot dirs already exist in both buckets. The archive GUID is **not** in the
daily flow's `IN_SCOPE_REPORT_GUIDS` — nothing here changes the daily pipeline.

Privacy: the live archive emits **no Member column** (unlike the in-PY report);
the parser's KEEP-only projection drops one defensively if it ever appears, and
the per-row `Date` is dropped before aggregation (Lesson 153). The written
bytes are asserted member-free in the test suite.

## Per-PY retrieval — re-verified live 2026-06-12 (D61)

| `year` param        | HTTP | Body size | Verdict                           |
| ------------------- | ---- | --------- | --------------------------------- |
| 2025-2026 (current) | 200  | 0 bytes   | empty — expected, skip            |
| 2024-2025           | 200  | 2.53 MB   | 1,296 achievements / 1,024 groups |
| 2023-2024           | 200  | 2.66 MB   | populated, distinct content       |
| 2022-2023           | 200  | 2.78 MB   | populated, distinct content       |
| 2021-2022           | 200  | 2.75 MB   | populated, distinct content       |
| 2020-2021           | 200  | 3.40 MB   | populated, distinct content       |
| 2019-2020           | 200  | 4.03 MB   | populated, distinct content       |

Distinct SHA-1 per PY (not an echo of current data); identical 7-column header
set (`Club, Division, Area, Award, Date, Name, Location`) across all sampled
PYs. Deeper years were not probed — sizes still growing at 2019-2020, so more
likely exist. To probe another PY before adding it to the bulk list:

```bash
curl -s -A "Mozilla/5.0" -o /tmp/archive-probe.html -w "%{http_code} %{size_download}\n" \
  "https://www.toastmasters.org/api/sitecore/DistrictReports/GetDistrictReport?tableID=a30b93f3-081e-42c8-9a36-137acb24be69&district=61&year=<PY>&sortBy="
```

Non-zero size ⇒ populated. **Rate-sensitive endpoint:** keep ≥1.1 s between
requests (the command does this itself via `--rate-ms`, default 1100).

## Request budget

One request per (district × PY). All ~120 configured districts × 6 PYs ≈ 720
requests ≈ **14 min** at the default rate. Districts that didn't exist in an
older PY return an empty body and are reported `skipped-empty` (no write).

## Steps

### 0. Build (fresh checkout)

```bash
npm install
npm run build:shared-contracts
npm run build:collector-cli
```

### 1. Dry-run gate (one district, one PY)

```bash
cd packages/collector-cli
CACHE_DIR=/tmp/edu-archive-backfill/cache node bin/collector-cli.js \
  backfill-education-archive --program-years 2024-2025 --districts 61 --dry-run -v
```

Expect `"action": "dry-run"` with plausible `groups`/`achievements` (D61
2024-2025 ⇒ 1,024 / 1,296). Nothing is written.

### 2. Bulk dry-run

```bash
CACHE_DIR=/tmp/edu-archive-backfill/cache node bin/collector-cli.js \
  backfill-education-archive \
  --program-years 2019-2020,2020-2021,2021-2022,2022-2023,2023-2024,2024-2025 \
  -v | tee /tmp/edu-archive-backfill/dry-run.json
```

(Default district list comes from the synced config — R2: make sure the cache
dir carries `config/districts.json`, or pass `--districts` explicitly.)
Review: `failed` should be 0; `skipped-empty` entries should make sense
(young districts in old PYs).

### 3. Real run (local cache)

Re-run step 2 without `--dry-run`, tee to `run.json`. Sanity-check the output:

```bash
# every write landed at a PY-end date; no member/date keys in any written file
grep -RIl '"member"\|"date" *:' /tmp/edu-archive-backfill/cache/snapshots/ && echo LEAK || echo CLEAN
jq '{totalPairs, succeeded, failed}' /tmp/edu-archive-backfill/run.json
```

### 4. Upload to STAGING (additive, reports files only)

Capture the before-state, then copy **only** the reports files:

```bash
for d in 2020-06-30 2021-06-30 2022-06-30 2023-06-30 2024-06-30 2025-06-30; do
  gsutil ls "gs://toast-stats-data-staging/snapshots/$d/" > "/tmp/edu-archive-backfill/before-$d.txt"
  gsutil -m cp "/tmp/edu-archive-backfill/cache/snapshots/$d/district_"*"_reports.json" \
    "gs://toast-stats-data-staging/snapshots/$d/"
done
```

### 5. Staging diff / validation

```bash
for d in 2020-06-30 2021-06-30 2022-06-30 2023-06-30 2024-06-30 2025-06-30; do
  gsutil ls "gs://toast-stats-data-staging/snapshots/$d/" > "/tmp/edu-archive-backfill/after-$d.txt"
  diff "/tmp/edu-archive-backfill/before-$d.txt" "/tmp/edu-archive-backfill/after-$d.txt"
done
```

Every diff line must be an **added** `district_<id>_reports.json` — nothing
removed, nothing else changed. (The PY-end dirs carried no reports files before
this backfill; if a `before-*.txt` already lists one, STOP and investigate —
the command merges locally, but an unexpected pre-existing remote file means
the local cache wasn't synced from it first.) Spot-check one file:

```bash
gsutil cat gs://toast-stats-data-staging/snapshots/2025-06-30/district_61_reports.json \
  | jq '{py: .programYear, sources: .sections.educationAchievements.sources,
         records: (.sections.educationAchievements.records | length)}'
```

### 6. PROMOTE to production (operator decision)

Same copy, staging → prod, after the staging review:

```bash
for d in 2020-06-30 2021-06-30 2022-06-30 2023-06-30 2024-06-30 2025-06-30; do
  gsutil -m cp "gs://toast-stats-data-staging/snapshots/$d/district_"*"_reports.json" \
    "gs://toast-stats-data-ca/snapshots/$d/"
done
```

### 7. Rollback

The backfill is purely **additive** (new files in existing date dirs). To
revert, delete exactly the files the step-5 diffs listed as added:

```bash
gsutil -m rm "gs://toast-stats-data-ca/snapshots/<date>/district_"*"_reports.json"   # prod
gsutil -m rm "gs://toast-stats-data-staging/snapshots/<date>/district_"*"_reports.json"  # staging
```

(If a future daily flow ever writes reports files to these dates, switch to the
explicit added-file list from step 5 instead of the wildcard.)

## Failure modes

- **`failed` > 0 in the summary** — per-pair errors don't abort the run. Re-run
  just the failed pairs (`--districts <id> --program-years <py>`); the merge is
  idempotent.
- **`skipped-empty` for a PY that should have data** — re-probe with curl (see
  above). If TI changed the endpoint/shape, stop; the parser pins the contract.
- **Schema/`program year` mismatch error** — the existing local file at that
  date is malformed or from a different PY; the command fails closed per pair.
  Inspect the file before retrying.

---

# Dated ledger history, 2003-04 → 2018-19 (#1802)

**Issue:** #1802 (epic #1781) · **Consumers:** #1801 (rollup), #1807 (trend)
**Posture:** CI only (never a local run, never a local mirror), STAGING only,
operator-dispatched. Nothing promotes `raw-education-ledger/`; the rollup that
reads it is promoted after ADR-015 step 5 (#1763).

## What is different from the PY-level backfill above

The PY-level backfill counts per (club, award) for the whole year and drops
`Date` (Lesson 153). The ledger history keeps `Date` at month granularity:
one record per (club, award, yearMonth), so a month-end total within any past
year is `yearMonth <= asOf` (`ledgerRecordsThroughMonth` in shared-contracts).
It writes a dedicated raw store, not the reports dataset:

```
raw-education-ledger/<PY>/district_<id>.json   (EducationLedgerHistoryFileSchema)
```

- `status: "ok"`: TI returned the ledger. `status: "no-data"`: TI returned 0
  bytes, so the district did not exist that year. No file means the pair was
  not fetched. Read both of the last two as "not available", never as 0.
- Each record has `club, division, area, name (club name), location, award,
awardCode, program, yearMonth, achievementCount`. The schema is strict:
  there is no member and no day-level date. The archive has no Member column,
  and if one ever appears it is never projected.
- `program` is `Pathways` (level codes), `Legacy` (CC, ACB/ACS/ACG, CTM,
  ATM/ATMB/S/G, CL, AL, ALB/ALS, LDREXC), `DTM`, or `Other` (for example
  `PWMENTORPGM`, or the blank code TI shows for a pending award). The run
  summary lists every `Other` code so unmapped vocabulary is visible.
- Division and area are as of that year. Club 1009147 was B/13 in 2009-10
  and D/34 in 2018-19.

Note: the PY-level datasets already exist at `snapshots/2017-06-30`,
`2018-06-30` and `2019-06-30` (PYs 2016-17 → 2018-19, written 2026-09-01) as
well as 2020 → 2025, all without `Date`. The ledger history refetches
2016-17 → 2018-19 to get their months. The same command can later refetch
2019-20 → 2025-26 to give one uniform dated store: about 7 × 120 more
requests, not part of #1802.

## URL patterns per program year (probed 2026-10-12)

The probes were single anonymous GETs at least 3 s apart, with the collectors'
user agents.

| What          | URL                                                                                                                                                       | Years                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Ledger        | `https://www.toastmasters.org/api/sitecore/DistrictReports/GetDistrictReport?tableID=a30b93f3-081e-42c8-9a36-137acb24be69&district=<D>&year=<PY>&sortBy=` | 2003-04 onward. The year list comes from the response's own `#programYears`. |
| District list | `https://dashboards.toastmasters.org/<PY>/export.aspx?type=CSV&report=districtsummary~6/30/<endYear>~~<PY>`                                               | 2008-09 onward                                                               |

Observations:

- **One ledger URL for every year.** There is no older or legacy endpoint.
  Every year has the same 7 headers: `Club, Division, Area, Award, Date, Name,
Location`. The award cell is
  `<div class="awrd-tooltip">CODE<span class="tooltiptext">Title</span></div>`.
- **Date precision.** In 2003-04, every Date is the 1st of the month: month
  precision only, kept as month. 2009-10 and 2018-19 have day precision.
- **Sample sizes (D61).**

  | PY      | Size    | Rows  | Months    |
  | ------- | ------- | ----- | --------- |
  | 2003-04 | 1.42 MB | 733   | Aug → Jun |
  | 2005-06 | ≈1.4 MB | 806   | Jul → Jun |
  | 2009-10 | 1.62 MB | 834   |           |
  | 2018-19 | 3.08 MB | 1,581 |           |

  Other districts sampled:

  | District | PY      | Size    | Result                                               |
  | -------- | ------- | ------- | ---------------------------------------------------- |
  | D02      | 2010-11 | 1.64 MB | Same bytes as `district=2`, so zero-padded ids work. |
  | DF       | 2005-06 | 1.38 MB |                                                      |
  | DU       | 2005-06 | 0.49 MB |                                                      |
  | D228     | 2010-11 | 0 bytes | The district did not exist yet.                      |

- **District lists from 2008-09 on.** The year-end districtsummary for
  2008-09 has 82 districts, max 86; 2013-14 has 92, max 94; 2018-19 has 117,
  max 116. Use the form with the as-of slot **empty**: with `~6/30/2009~` as
  the as-of, 2008-09 returned a header with zero rows.
- **No district list before 2008-09.** For 2003-04 → 2007-08 the dashboard
  302s to `/error.aspx`. The candidates for those years are the 2008-09 list
  plus every number from 01 to its maximum (88 ids). A candidate that did not
  exist returns 0 bytes and is recorded `no-data`.

## Request budget (default 16 PYs)

- **Ledger requests:**
  - 2008-09 → 2018-19: 11 PYs, about 82 → 117 districts, ≈ 1,090 requests.
  - 2003-04 → 2007-08: 5 PYs × 88 candidates = 440 requests.
- **District-list requests:** 16, one per PY. The job runs the CLI once per
  PY, so each of the 5 years before 2008-09 re-reads the 2008-09 list.
- **Total:** ≈ **1,550 requests**, ≈ 2–2.5 GB transferred.
- **Time:** at least 1.1 s between requests plus 1–2.5 s per download, so
  ≈ **75–90 min** in one job. The job timeout is 240 min.
- **Output:** ≈ 140 KB per district-year (D61 2005-06: 662 records,
  142 KB), ≈ 150–200 MB in staging.

## Dispatch (operator: Ron)

The workflow holds the shared `data-pipeline` concurrency group for the whole
run. Dispatch after the day's daily run has finished; a daily dispatched
meanwhile queues behind it.

```bash
gh workflow run data-pipeline.yml --ref main -f mode=backfill-education-ledger
# optional: -f program_year=2003-2004,2004-2005   (subset; default is all 16)
# optional: -f districts=61                         (explicit list for every PY)
# optional: -f force=true                           (re-fetch existing files)
```

A pilot with `-f program_year=2003-2004,2018-2019 -f districts=61` makes 2
requests. Re-dispatching the same inputs only fetches the missing pairs:
existing valid files are skipped, and every PY is uploaded as soon as it
finishes.

## Review before anything reads it

- Read the step summary table. `Failed` should be 0. `No data` should be
  plausible (young districts in old years; most of the 88 candidates for
  2003-04 → 2007-08). `Other codes` lists the vocabulary to map. The run
  manifest is at `runs/<run_id>/written.jsonl`.
- Spot-check one file with a single-object read; do not mirror the prefix
  locally:

  ```bash
  gcloud storage cat gs://toast-stats-data-staging/raw-education-ledger/2009-2010/district_61.json \
    | jq '{status, records: (.records|length),
           achievements: ([.records[].achievementCount]|add),
           months: ([.records[].yearMonth]|unique)}'
  ```

- **Rollback:**
  `gcloud storage rm -r gs://toast-stats-data-staging/raw-education-ledger/`.
  Staging only; nothing else references the prefix yet.
