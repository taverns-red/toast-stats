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
