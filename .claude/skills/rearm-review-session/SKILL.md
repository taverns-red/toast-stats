---
name: rearm-review-session
description: Review a runner-produced PR before merge and re-arm a halted runner. Use when an issue carries the runner-stuck label (the auto-relaunch cap was hit) or a runner PR is waiting on pre-merge review. Confirms ground truth, then clears runner-stuck to resume autonomy.
---

# rearm-review-session

When the runner hits its relaunch cap it adds **`runner-stuck`**, stops
relaunching, and frees the slot. Re-arming is a deliberate human/agent decision —
don't just remove the label; first establish what really happened.

## 1. Establish ground truth (fail closed)

Never trust a session's own ship narrative — confirm with fresh reads (the same
discipline the verify lib enforces):

```sh
gh pr view <PR#> --json mergedAt,state     # mergedAt (NOT merged) is the proof
gh run list --branch <branch> --limit 1    # CI fresh, not a buffer
git log origin/main --oneline -5           # what actually shipped
```

If the work **already shipped**, don't relaunch — just reconcile the issue/epic
state (tick + close if needed) and clear the label.

## 2. Review the PR (if not yet merged)

- Read the diff against the sprint's acceptance criteria — each must verify.
- Run the hermetic suite; check for assertion-pinning / commented-out tests /
  skipped CI (the kill-switch list).
- Verify on a pre-merge surface (preview/staging), not production.
- If it passes, merge and run the idempotent close-out ceremony
  (evidence → label → tick-epic → close). If it fails, leave it open with
  failure evidence; the operator decides revert vs hand-fix.

## 3. Re-arm autonomy

Only after the above:

```sh
gh issue edit <ISSUE#> --remove-label runner-stuck
```

The runner's next tick re-evaluates the freed slot. If you also need a capped
manual session, relaunch per the runner's launch path rather than spawning an
unbounded one.

## 4. Capture the lesson

If the stall had a root cause (flaky probe, bad sprint scoping, env drift), add a
lesson so the next session doesn't repeat it.
