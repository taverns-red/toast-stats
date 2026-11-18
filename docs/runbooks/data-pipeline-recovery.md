# Runbook — Daily Data Pipeline Recovery (#753)

When the daily snapshot doesn't land, the CDN keeps serving the last
`v1/latest.json` and nothing fails on its own. This runbook covers detecting
that, recovering, and the guardrails that now catch it automatically.

## How a missed run is detected

- **Freshness monitor** (`.github/workflows/pipeline-freshness-monitor.yml`)
  runs daily at **14:00 UTC** — after the daily run, which a launchd job on
  the operator Mac dispatches at 05:00 America/Toronto (#1242; see
  `local-daily-pipeline-trigger.md`). It fetches the production manifest
  `https://storage.googleapis.com/toast-stats-data-ca/v1/latest.json`,
  compares its `generatedAt` against a **26h** threshold, and on staleness:
  1. opens (or comments on) a `pipeline-stale` GitHub issue with the age,
     last snapshot date, and the recovery command, and
  2. **fails the monitor run** so GitHub's own notifications fire too.

  The decision logic is pure and unit-tested in
  `scripts/lib/pipelineFreshness.ts` (run via `scripts/check-pipeline-freshness.ts`).

- **Manual check** any time:

  ```bash
  curl -s https://storage.googleapis.com/toast-stats-data-ca/v1/latest.json | jq .
  # or run the exact monitor logic locally:
  MANIFEST_URL=https://storage.googleapis.com/toast-stats-data-ca/v1/latest.json \
    npx tsx scripts/check-pipeline-freshness.ts
  ```

  `generatedAt` is refreshed on every successful daily run. If it is more than
  ~26h old, a run was missed.

## Manual recovery

Re-run the daily pipeline from the CLI (writes to staging, then promotes to
production):

```bash
gh workflow run data-pipeline.yml -f mode=daily
```

Watch it:

```bash
gh run list --workflow=data-pipeline.yml --limit 3
gh run watch <run-id>
```

When it finishes, confirm the manifest advanced:

```bash
curl -s https://storage.googleapis.com/toast-stats-data-ca/v1/latest.json | jq .generatedAt
```

Then close the `pipeline-stale` issue.

### The status.taverns.red heartbeat (#2863)

status.taverns.red (Better Stack, ops#343) expects a heartbeat from the data
pipeline every **24 h**, with a **12 h grace**. The `status-heartbeat` job
pings after a healthy prod promotion by a `mode=daily` run, whatever
triggered it: the pipeline succeeded, it was not a `skip_promotion` run,
something was promoted, and the data smoke passed (verdict not unhealthy).
It uses the `STATUS_HEARTBEAT_TS_DATA` secret and never fails the run.

**What the component means: "our daily pipeline ran and is healthy".** It is
deliberately **not data freshness**: TI's month-end dashboard freezes are not
our outage, so a stale `latestSnapshotDate` must not turn it red. A missed
launchd run (Mac asleep or off) correctly shows it down. Do not "fix" it into
a freshness check; the freshness monitor above covers that. A manual
`mode=daily` dispatch that promotes also pings, which is how a recovery run
reports in. Rebuild, rescrape, prune and backfill modes never ping.

### Data auto-restore and the `data-rollback` issue (#2537, #2858)

When the post-promotion data smoke fails, the `data-auto-restore-decide` job
files a `data-rollback` issue. By default (dry-run) nothing is restored; the
issue lists the enumerated restore plan, planned read-only as the data reader
service account (main only), or says `enumeration failed: <class>` and gives
the command to plan by hand. Restoring needs `DATA_AUTO_RESTORE=execute`. Full
procedure: [data-restore.md](data-restore.md#automatic-restore-2537-built-dry-run-by-default).

## Confirming a dispatch queues (without writing prod data)

A `daily` dispatch writes to production. To verify only that
`workflow_dispatch` queues — e.g. when debugging a "Failed to queue workflow
run" error from GitHub's queuing layer — use the safe no-op: `prune` mode with
`dry_run=true` skips all delete/promote steps.

```bash
gh workflow run data-pipeline.yml -f mode=prune -f dry_run=true
gh run list --workflow=data-pipeline.yml --limit 1   # confirm it queued
```

## Why runs go missing

`schedule` events are **best-effort** — GitHub can drop them under load with
no failure record (observed 2026-05-26). That is why the daily's cron was
removed and replaced by the launchd dispatch (#1242), which has its own
failure mode: a Mac that is asleep or off dispatches nothing. Causes seen / ruled out during the
#753 investigation:

- **GitHub queuing-layer degradation** — the dropped run plus a concurrent
  `Failed to queue workflow run. Please try again.` on manual dispatch, while
  other workflows ran fine. GitHub's own remedy is "try again."
- **Not** the >10-input `workflow_dispatch` cap (the pipeline has 7 inputs).
- **Not** a recent workflow-file change (file unchanged since 2026-05-12).
- **Not** billing / a repo-wide Actions outage (other workflows ran).

## Guardrails now in place

| Guardrail                      | Where                               | Purpose                                                                                       |
| ------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Launchd dispatch + retries     | `scripts/trigger-daily-pipeline.sh` | Dispatches the daily at 05:00 America/Toronto, retrying and confirming a run started (#2496). |
| Freshness monitor `0 14 * * *` | `pipeline-freshness-monitor.yml`    | Alerts loudly (issue + red run) when the manifest is still stale after the daily run.         |
