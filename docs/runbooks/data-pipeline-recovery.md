# Runbook — Daily Data Pipeline Recovery (#753)

When the daily snapshot doesn't land, the CDN keeps serving the last
`v1/latest.json` and nothing fails on its own. This runbook covers detecting
that, recovering, and the guardrails that now catch it automatically.

## How a missed run is detected

- **Freshness monitor** (`.github/workflows/pipeline-freshness-monitor.yml`)
  runs daily at **14:00 UTC** — after the primary (08:00) and backup (11:00)
  pipeline crons. It fetches the production manifest
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

### Telling status.taverns.red the recovery landed (`recovery`, #2863)

status.taverns.red (Better Stack, ops#343) expects a heartbeat from the data
pipeline every **24 h**, with a **12 h grace**, so stale prod data alerts at
about 36 h. The `status-heartbeat` job pings after a healthy promotion
(the data smoke passed, no auto-restore verdict, not a `skip_promotion` run).
It pings on a `schedule` daily, and on a manual dispatch only when you opt in:

```bash
gh workflow run data-pipeline.yml -f mode=daily -f recovery=true
```

`recovery` defaults to **false**. Even with it on, the job pings only if the
run promoted a snapshot date **newer** than the `latestSnapshotDate` prod held
before the run (read from prod `v1/latest.json` just before the promote step;
a promoted date later than it counts). A recovery dispatch that promoted no
newer date, any dispatch without `recovery`, and every rebuild, rescrape or
prune never ping, so they cannot hide a missed daily. The ping uses the
`STATUS_HEARTBEAT_TS_DATA` secret and never fails the run.

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
no failure record (observed 2026-05-26). Causes seen / ruled out during the
#753 investigation:

- **GitHub queuing-layer degradation** — the dropped run plus a concurrent
  `Failed to queue workflow run. Please try again.` on manual dispatch, while
  other workflows ran fine. GitHub's own remedy is "try again."
- **Not** the >10-input `workflow_dispatch` cap (the pipeline has 7 inputs).
- **Not** a recent workflow-file change (file unchanged since 2026-05-12).
- **Not** billing / a repo-wide Actions outage (other workflows ran).

## Guardrails now in place

| Guardrail                      | Where                            | Purpose                                                                                                   |
| ------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Backup cron `0 11 * * *`       | `data-pipeline.yml`              | Absorbs a dropped 08:00 scheduled event. Idempotent; serialized by the `data-pipeline` concurrency group. |
| Freshness monitor `0 14 * * *` | `pipeline-freshness-monitor.yml` | Alerts loudly (issue + red run) when the manifest is still stale after both crons.                        |
