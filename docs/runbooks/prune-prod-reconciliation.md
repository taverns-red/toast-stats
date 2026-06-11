# Runbook — Prune Prod Reconciliation (#1133, epic #1102)

**Surface:** GCS buckets `toast-stats-data-staging` (staging) and
`toast-stats-data-ca` (production) · `.github/workflows/data-pipeline.yml`
prune mode.

## Why prod freezes after a prune

Prune deletes only from **staging**. Promotion (`gsutil rsync` without
`-d`) never deletes from prod. After a staging prune:

1. Staging's regenerated `v1/dates.json` lists fewer dates than prod's.
2. The next daily run's **count gate** sees `staging dates < prod dates`,
   declares the change subtractive, and blocks promotion
   (`Diff staging vs production` step).
3. Every subsequent daily blocks the same way; prod serves increasingly
   stale content while runs report success — the #1073 `promotion-held`
   alert is what makes this loud.

Reconciliation = bringing prod's deletable layers (`raw-csv/`,
`snapshots/`) and manifests back in line with staging. Derived layers
(`time-series/`, `club-trends/`, `v1/rank-history`) are retained by design
on both buckets (#1132) and are never part of reconciliation.

## Safety interlocks (all fail closed)

| Interlock                | Where                                         | Refuses when                                                                                                        |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Closing-period guard     | `collector-cli prune` (`PruneService`, #1133) | today is inside — or cannot be proven outside — a TI closing window (registry: `docs/month-end-closing-dates.json`) |
| Metadata-less protection | `PruneService` (#1131)                        | a raw-csv date has no `metadata.json` — never classified deletable                                                  |
| Deletion-scope guard     | `scripts/lib/pruneGcsDeletions.ts` (#1132)    | any deletion path is outside `raw-csv/<date>` / `snapshots/<date>`                                                  |
| Reconcile plan guards    | `scripts/lib/pruneProdReconcile.ts` (#1133)   | staging listing empty · staging/prod snapshot listings disjoint · any non-ISO date                                  |
| Dry-run                  | `dry_run=true` dispatch input                 | nothing is deleted anywhere; classification + reconcile plan are reported only                                      |

The closing-period guard has **no override flag**. If it refuses with
`unknown`, the registry is missing the previous month's entry — add it via
`scripts/update-closing-date-registry.ts` once TI's dashboard month
dropdown shows the close (ADR-011, Lesson 158), then re-dispatch.

## Path A — same-run reconcile (preferred)

Dispatch the pipeline with `mode=prune`, `reconcile_prod=true`,
`dry_run=false`. The run:

1. Classifies and deletes non-keepers from staging (cache + GCS),
   regenerates staging manifests.
2. Plans prod deletions as the **prod-minus-staging diff** of dated dirs
   (`scripts/prune-prod-reconcile.ts`) — this also sweeps stragglers from
   any earlier staging-only prune.
3. Deletes the planned prod-only prefixes and rsyncs `v1/` + `config/`
   staging→prod, so the next daily's count gate compares like with like.

Always dry-run first: `mode=prune`, `dry_run=true`, `reconcile_prod=true`
prints the classification AND the prod-reconcile plan (pending staging
deletions are previewed as already gone) without touching either bucket.

## Path B — recovery after a staging-only prune (promotion frozen)

Symptoms: a `promotion-held` issue citing the count gate;
`SUBTRACTIVE: staging has fewer dates than production` warnings; prod
`v1/latest.json` date stops advancing.

1. Capture listings (read-only):

   ```bash
   gsutil ls gs://toast-stats-data-staging/snapshots/ > /tmp/ls-staging-snapshots.txt
   gsutil ls gs://toast-stats-data-staging/raw-csv/   > /tmp/ls-staging-rawcsv.txt
   gsutil ls gs://toast-stats-data-ca/snapshots/      > /tmp/ls-prod-snapshots.txt
   gsutil ls gs://toast-stats-data-ca/raw-csv/        > /tmp/ls-prod-rawcsv.txt
   ```

2. Plan (pure, no deletions — review the output):

   ```bash
   npx tsx scripts/prune-prod-reconcile.ts \
     --staging-snapshots /tmp/ls-staging-snapshots.txt \
     --staging-rawcsv /tmp/ls-staging-rawcsv.txt \
     --prod-snapshots /tmp/ls-prod-snapshots.txt \
     --prod-rawcsv /tmp/ls-prod-rawcsv.txt > /tmp/prod-reconcile-paths.txt
   cat /tmp/prod-reconcile-paths.txt
   ```

3. Execute after review (deletes from PROD — irreversible):

   ```bash
   while IFS= read -r PREFIX; do
     gsutil -m rm -r "gs://toast-stats-data-ca/${PREFIX}/"
   done < /tmp/prod-reconcile-paths.txt
   gsutil -m rsync -r gs://toast-stats-data-staging/v1/ gs://toast-stats-data-ca/v1/
   gsutil -m rsync -r gs://toast-stats-data-staging/config/ gs://toast-stats-data-ca/config/
   ```

4. Verify: the next daily run promotes (count gate passes) and the
   `promotion-held` issue self-closes.

Alternatively, dispatch Path A — the same-run plan is a prod-minus-staging
diff, so it reproduces the missed reconciliation even though the original
prune's classification is gone.

## What this runbook does NOT cover

- **Flipping the prune cron** — there is no scheduled prune. The flip is
  operator-gated in #1148 with its own evidence checklist; prune remains
  `workflow_dispatch`-only until that decision.
- **Derived-layer thinning** — decided against in #1132 (trend surfaces
  keep full daily resolution).

## Evidence trail

- #1131 — metadata-less protection + rawCsvDate-keyed deletions.
- #1132 — layer scope decision + structural guard.
- #1133 — closing-period guard, prod-reconcile mechanism, the inert
  boolean-input dry-run gate fix, and the staging dry-run evidence.
- #1036 / #1037 — the original NO-GO audit and parked cron issue.
