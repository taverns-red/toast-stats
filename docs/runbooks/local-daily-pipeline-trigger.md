# Runbook — Local daily-pipeline trigger (launchd)

**Issue:** #1242 · **Added:** 2026-06-23

## Why

GitHub Actions `schedule:` triggers fire late or get dropped under load. The
daily data pipeline's entire value is on-time freshness, so its cron was removed
from `.github/workflows/data-pipeline.yml`. The daily run is now triggered
**deterministically by a launchd job on the operator Mac** at **05:00
America/Toronto**.

- The pipeline workflow is unchanged except for the removed `schedule:` block —
  it still runs on GitHub's runners. We only moved the _trigger_.
- `workflow_dispatch` (mode defaults to `daily`) is the entry point.
- The quarterly-prune cron stays operator-gated (#1148) and is unaffected.

## Components

| Piece          | Repo (canonical)                                               | Installed (live)                                                                    |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Trigger script | `scripts/trigger-daily-pipeline.sh`                            | `~/Library/Application Support/toast-stats/trigger-daily-pipeline.sh`               |
| launchd job    | `scripts/launchd/red.taverns.toast-stats.daily-pipeline.plist` | `~/Library/LaunchAgents/red.taverns.toast-stats.daily-pipeline.plist`               |
| Logs           | —                                                              | `~/Library/Logs/toast-stats/daily-pipeline-trigger.log` (+ `launchd.{out,err}.log`) |

The live script is a **stable copy** outside the repo working tree so it does not
depend on which branch is checked out. After changing the repo script, re-copy it
(see Update below).

## Install

```bash
# 1. Stable copy of the trigger script
mkdir -p "$HOME/Library/Application Support/toast-stats" "$HOME/Library/Logs/toast-stats"
cp scripts/trigger-daily-pipeline.sh "$HOME/Library/Application Support/toast-stats/trigger-daily-pipeline.sh"
chmod +x "$HOME/Library/Application Support/toast-stats/trigger-daily-pipeline.sh"

# 2. Install + load the launchd job
cp scripts/launchd/red.taverns.toast-stats.daily-pipeline.plist "$HOME/Library/LaunchAgents/"
launchctl bootout  "gui/$(id -u)/red.taverns.toast-stats.daily-pipeline" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/red.taverns.toast-stats.daily-pipeline.plist"

# 3. Verify it is loaded and scheduled
launchctl print "gui/$(id -u)/red.taverns.toast-stats.daily-pipeline" | grep -E "state|runs|next"
```

## Test (fires a real, idempotent run)

```bash
# Run the trigger now. The daily flow is idempotent (re-scrapes today's date),
# uploads to STAGING (promotion to prod is separately gated), so a test run is safe.
bash "$HOME/Library/Application Support/toast-stats/trigger-daily-pipeline.sh"
tail -n 20 "$HOME/Library/Logs/toast-stats/daily-pipeline-trigger.log"
gh run list --workflow data-pipeline.yml --limit 3
```

## Update (after editing the repo script)

```bash
cp scripts/trigger-daily-pipeline.sh "$HOME/Library/Application Support/toast-stats/trigger-daily-pipeline.sh"
# No launchctl reload needed unless the plist itself changed.
```

## Uninstall / revert

```bash
launchctl bootout "gui/$(id -u)/red.taverns.toast-stats.daily-pipeline"
rm "$HOME/Library/LaunchAgents/red.taverns.toast-stats.daily-pipeline.plist"
# To restore GitHub scheduling, re-add the `schedule: - cron: '0 8 * * *'`
# block to .github/workflows/data-pipeline.yml on main.
```

## Caveats & safety net

- **Mac must be awake (or wake) at 05:00.** launchd does not power on a sleeping
  Mac; it runs a _missed_ `StartCalendarInterval` job once on next wake. To
  guarantee on-time runs, schedule a wake:
  `sudo pmset repeat wakeorpoweron MTWRFSU 04:58:00`
- **Independent freshness alarm.** `pipeline-freshness-monitor.yml` still runs on
  GitHub and alerts if the published data goes stale — the backstop if the local
  trigger silently fails (Mac off, `gh` token expired, network down).
- **Token scope.** The trigger needs `gh` authenticated with the `workflow`
  scope. Check with `gh auth status`.
