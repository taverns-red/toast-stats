---
name: diagnose-stuck-runner
description: Triage why the Red Barkeep runner isn't picking up work. Use when the runner is "ticking happily" but no sprint launches, or a session looks stuck. Walks the exact checks — META_EPIC env, epic-line validity, lock, liveness probes, runner-stuck label — using the runner's own subcommands.
---

# diagnose-stuck-runner

The runner can tick every 5 minutes and still launch nothing. Work through these
in order; each uses the runner's own tooling so you read the same truth it does.

## 1. Is an epic resolvable?

- `scripts/sprint-runner.sh --status` — read-only report: resolved EPIC + source,
  per-session liveness verdict + probe breakdown, attempts N/3. If it says
  "neither EPIC nor META_EPIC env set", the launchd plist is missing the env.
- Confirm the plist env: `launchctl print gui/$(id -u)/red.taverns.<name>.sprint-runner`.

## 2. Is the active epic-line actually pickable?

The classic silent failure: an epic sits unpicked because its line doesn't match
the runner's matcher (e.g. a `*` in the title).

```sh
# Pull the META_EPIC body and check each epic line:
gh issue view <META_EPIC#> --json body --jq .body
scripts/sprint-runner.sh --validate-epic-line "<the epic line>"
```

A non-zero exit + reason means the runner will skip that line. Fix the META_EPIC
line (or re-queue via the `queue-work` skill, which can't write an unpickable
line).

## 3. Is the slot free?

- Lock: `SPRINT_RUNNER_LOCK_DIR` (default `/tmp/red-barkeep-<name>.lock`). A live
  holder is normal; a stale lock is auto-reaped, but check the pid is real.
- A foreign/husk session can squat the single slot — `--status` shows it; `--reap`
  clears stuck sessions.

## 4. Is liveness mis-firing or escalated?

- `--status` shows HEALTHY/SUSPECT/STUCK/HUSK and attempts. At the cap the runner
  adds the **`runner-stuck`** label and stops relaunching.
- If you see `runner-stuck` on an issue, the runner is deliberately holding off.
  Use the `rearm-review-session` skill to review and clear it.

## 5. Is the predecessor gate blocking?

The next sprint only launches when the previous sprint's sub-issue is **CLOSED**
(and, under `STRICT_GATE=1`, carries `sprint-verified`). Check the predecessor's
state — an accidentally-reopened issue stalls the chain.

## Output

Report the single blocking cause and the exact fix (which line/label/lock), not a
list of everything you checked.
