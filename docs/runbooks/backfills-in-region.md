# Runbook — Run large backfills in-region (#2546)

Large re-derives and backfills should run **next to the staging bucket**, not
on GitHub-hosted runners that pull the data over the internet. This runbook
says when a job counts as large, what the in-region path would be, what it
needs before it can exist, and the rule for runners until then.

Status: **the in-region path is a proposal.** It needs new GCP resources and
IAM, so it goes to the COO and Ron (§4). Nothing here creates infrastructure,
and every dispatch below follows the usual approval rules. Until the in-region
path exists, the interim rule in §5 applies to every backfill on a runner.

Moving the staging bucket to `northamerica-northeast1` is a **separate COO
proposal** (§7) and is not part of this runbook.

## 1. Why (October 2026)

The staging bucket cost **CA$56.7** in October 2026. In a normal month it costs
almost nothing. Nearly all of it came from the mid-October backfills and the
basemap work (#2546):

| Line                                | Volume             |  CA$ |
| ----------------------------------- | ------------------ | ---: |
| Internet download to GitHub runners | 238 GiB            | 24.5 |
| Multi-region writes (Class A)       | 1.44M ops          | 20.5 |
| Replication, storage, reads, other  | 105 GiB replicated | 11.7 |

From 2026-10-07 to 2026-10-27 there were **57 non-daily dispatches** of
`data-pipeline.yml`, about **24.6 runner-hours** in total (from
`gh run list --workflow data-pipeline.yml --event workflow_dispatch`). The
09:00 dailies are excluded. That averages about 4 GiB downloaded per dispatch.

Some of it is already fixed. #2102 (PR #2108, merged 2026-10-17) scoped the
rebuild's club-trends pull to the PYs of its `dates` input and seeded the
education ledger from the Actions cache. That cut a rebuild's fixed download
from 1.44 GiB to 0.34 GiB.

### Bucket facts (read-only, 2026-11-08)

| Bucket                     | Location                  | Type         |
| -------------------------- | ------------------------- | ------------ |
| `toast-stats-data-staging` | `US`                      | multi-region |
| `toast-stats-data-ca`      | `northamerica-northeast1` | region       |

`gcloud storage buckets describe gs://<bucket> --format="value(location,location_type)"`

## 2. What a runner downloads

Bytes from staging to the runner, per dispatch, after #2102. The fixed part and
the per-date sync come from PR #2108's measurement. The gate read-back is
measured from `snapshots/2026-09-30/` (1,156 objects, 25 MiB stored).

| Step                                                                        | Where                                                   | Size                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Store sync: club-trends (scoped by `dates`), club-race, time-series, awards | `scripts/pipeline/sync-stores.sh`                       | ~0.34 GiB per run (1.1 GiB more with no `dates`) |
| Education ledger and year-end reports                                       | `build-education-rollup.sh`                             | in the fixed part above                          |
| `raw-csv/<date>/` and the prior-year `district_*.json`                      | `process-dates.sh` (`process_one`, `pull_prior_year`)   | ~0.023 GiB per date                              |
| `raw-fac/<date>/` (dates that have one)                                     | `process-dates.sh` (`enrich_snapshot`)                  | up to ~28 MB per date                            |
| Content gate read-back of every written object                              | `scripts/promotion-content-gate.ts` (SDK, not `gcloud`) | ~25 MiB per date                                 |
| Value gate: `all-districts-rankings.json` per changed date                  | data-pipeline.yml, value-diff step                      | small (hash-equal dates skipped, #1730)          |

Promotion to prod is a server-side rewrite (`scripts/promote-run-manifest.ts`).
It never passes through the runner. It is billed as cross-location transfer,
not as internet download.

**Estimate for one dispatch of N dates:** about `0.35 + 0.05 × N` GiB, or
`1.45 + 0.05 × N` GiB when `dates` is empty. Writes are about **1,160 objects
per date** to the multi-region bucket.

This bottom-up estimate does not fully explain October's 238 GiB, even
allowing for pre-#2102 runs. Measure the next backfill (§6) before trusting it
for planning.

## 3. When a job counts as large

A backfill is **large** if any of these holds:

1. It is a full-range rebuild: `mode=rebuild` with an empty `dates` input (299
   raw dates on 2026-11-08, about 16 GiB by the estimate above).
2. One dispatch covers **more than 100 dates** (about 5 GiB).
3. A campaign (the dispatches for one issue within 14 days) adds up to **more
   than 25 GiB** of estimated download, or more than **500 date re-derives**.

Why 25 GiB: the first 100 GiB of egress each month is free (PR #2108), and the
dailies use about 12 GiB of it (0.40 GiB × 30). A 25 GiB campaign leaves room
for a second one in the same month. Past the free tier, egress costs about
CA$0.165 per GiB.

Recalibrate these numbers after the first measured backfill (§6).

A large job runs in-region once that path exists (§4). Until then it needs the
interim rule (§5) and an explicit go from Ron or the COO that names the
estimated GiB.

## 4. The in-region path (proposal)

Run the same scripts in a GCP region inside the staging bucket's location. For
today's `US` multi-region bucket that is a US region such as `us-east1`. If
staging moves to `northamerica-northeast1` (§7), the job moves with it. Reads
from a bucket by compute in the same location carry no network charge
(confirm against cloud.google.com/storage/pricing in the proposal).

### Option A — Cloud Build, regional, default pool (preferred)

- One `gcloud builds submit --region=<region>` with a build config whose steps
  are the rebuild loop: `sync-stores.sh`, `process-dates.sh ... rebuild <dates>`,
  `publish-stores.sh`, using public `node` and `google-cloud-cli` images with
  the repo checked out. Same scripts, no new container to maintain.
- Build time is billed per build-minute on the default `e2-standard-2` pool,
  with a monthly free allowance (2,500 minutes at the time of writing; confirm).
  October's 24.6 runner-hours is about 1,480 minutes.
- The default disk (100 GB) is larger than a runner's free disk (~14 GB).
  The 24-hour build timeout is longer than the workflow's 240-minute cap.

### Option B — Cloud Run job

- Needs a container image with Node, `gcloud` and the repo, stored in Artifact
  Registry, and rebuilt on each change to the pipeline scripts.
- Pay per vCPU-second and GiB-second. At list price, 2 vCPU and 4 GiB cost
  about US$0.16 an hour, so October's runner-hours come to about CA$5.
- Fits better if a job ever needs more than 24 hours or a schedule.

### What either option needs (new resources, not created here)

| Need                                                                                                                                                                                                                | Who approves                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| A dedicated identity that can write **staging only**, never `toast-stats-data-ca`                                                                                                                                   | Ron (IAM)                                  |
| Permission for the GitHub workflow (or Ron) to start the build or job                                                                                                                                               | Ron (IAM)                                  |
| For Option B: an Artifact Registry image and its cleanup policy                                                                                                                                                     | COO (spend)                                |
| A promote-only path: the in-region job writes a run manifest to `runs/<id>/`, and a dispatch of `data-pipeline.yml` runs the count, value, content and completeness gates and the scoped promotion on that manifest | Repo session (code), Ron (pipeline change) |

The gates, promotion, CDN purge and promotion-held issues stay in GitHub
Actions. Only the heavy loop moves. ADR-002 still holds: only the gated
promotion writes prod.

The content gate's read-back (~25 MiB per date) still runs on the runner in
this design. Moving it in-region too is a follow-up.

### Cost comparison (one October-sized month)

| Line              |   October actual (runners) | Runners after #2102 (est.) |        In-region, US staging (est.) | In-region + regional staging (est.) |
| ----------------- | -------------------------: | -------------------------: | ----------------------------------: | ----------------------------------: |
| Internet download |          CA$24.5 (238 GiB) |           ~CA$9 (~155 GiB) | ~CA$0 (dailies under the free tier) |                               ~CA$0 |
| Writes (Class A)  |            CA$20.5 (1.44M) |                    CA$20.5 |                             CA$20.5 |      ~CA$10 (regional rate is half) |
| Replication       |             in the CA$11.7 |                       same |                                same |              none (regional bucket) |
| Compute           | CA$0 (public-repo runners) |                       CA$0 |                              CA$0–5 |                              CA$0–5 |

The "after #2102" egress figure uses PR #2108's batch-month saving (~83 GiB).

In-region compute removes the **download** line only. Writes and replication
are priced by the bucket's location, not by where the caller runs. They drop
only with fewer writes (§5) or with a regional staging bucket (§7). After
#2102, in-region saves roughly CA$5–10 in a month like October and close to
nothing in a quiet month. Build it only if backfill campaigns keep recurring.

## 5. Interim rule for runners

Until the in-region path exists, every backfill on a GitHub runner follows
these rules:

1. **Always pass `dates`.** An empty `dates` pulls the whole club-trends store
   (1.1 GiB) and every raw date. Group dates by program year, since club-trends
   is pulled per PY of the `dates` input.
2. **Re-derive only the dates the change touches.** List them from the logic
   change (its PY window, its month-ends) and from `v1/dates.json`. Don't
   rebuild a whole year to fix three month-ends.
3. **Fewer, larger dispatches.** Each dispatch pays the ~0.34 GiB fixed part
   again. Fit dates into one dispatch up to the 240-minute cap (~1 min per
   date) instead of many small ones.
4. **Re-run only the failed dates.** The rebuild prints
   `{"succeeded","refused","failed"}` counts and a `::warning::` naming each
   date that failed. Dispatch those dates, not the whole batch.
5. **Pilot first.** A `skip_promotion=true` run of 5 dates or fewer, then read
   its step summary (store sync MB, dates processed) before the full batch.
6. **Use the run manifest, not a re-list.** `runs/<run_id>/written.jsonl` says
   which objects a run wrote. A follow-up run that only needs to re-gate or
   re-promote reads it instead of re-syncing snapshots.
7. **Estimate before dispatching.** Put the §2 estimate (GiB and writes) in the
   issue or approval request. Above a §3 threshold, the approval names the
   number.

## 6. Measure the next backfill against October

The issue's second acceptance criterion. All reads, no writes.

1. Note the run IDs and their start and end times.
2. In Cloud Monitoring (Metrics Explorer), resource `gcs_bucket`, bucket
   `toast-stats-data-staging`:
   - `storage.googleapis.com/network/sent_bytes_count`, summed per hour over
     the run windows: the bytes downloaded;
   - `storage.googleapis.com/api/request_count`, filtered to write methods
     (`WriteObject`, `RewriteObject`, `ComposeObject`), summed: the writes.
3. Subtract a daily's usual footprint (the same metrics over a 09:00 daily).
4. After the month closes, read the staging bucket's billing lines by SKU
   (download, Class A, replication) for the backfill days.
5. Report GiB per date and writes per date next to October's
   (238 GiB / 1.44M writes over 57 dispatches) on #2546, and recalibrate §2 and
   §3.

## 7. Moving staging to `northamerica-northeast1` (separate proposal)

Not part of this runbook or its PR. It is a new bucket (location can't change),
a one-time copy, a cutover of every place that names the bucket, and a pause
in the pipeline during the copy. That makes it shared, irreversible
infrastructure, so it goes to the COO as its own proposal. PR #2108 has the
pros and cons. In short, it halves Class A cost, removes replication charges
and makes promotion a same-region copy, but does **not** change runner egress.
Only in-region compute does that. The two changes are complementary, and the
in-region job's region follows the bucket.

## 8. Related

- [pipeline-rerun-2017-to-now.md](pipeline-rerun-2017-to-now.md): the full-range
  re-derive. It is large by §3.
- [storage-and-registry-cleanup.md](storage-and-registry-cleanup.md): bucket
  inventory and storage cost.
- [basemap.md](basemap.md): basemap uploads. The z0–14 upload (68.76 GB) was
  part of October's multi-region writes and replication.
- #2102 / PR #2108: runner download cuts and the single-region analysis.
