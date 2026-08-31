---
date: 2026-08-31
tier: principle
summary: A detect-only monitor for a machine-derivable condition re-fires forever; classify staleness by who can remediate it, not just by whether it is stale
tags: [monitoring, alerting, automation, pipeline, ci]
---

# Classify alerts by who can remediate them, not just by severity

**Date:** 2026-08-31
**Issue:** #1419 (closing-date registry stale — 2026-07)
**Tags:** monitoring, alerting, automation, fail-closed, pipeline

## What happened

`🟥 closing-date registry stale — 2026-07` re-fired daily for 19 days. The
obvious hypothesis was a recurrence of #1266 — the cry-wolf bug where a benign
empty feed (no closing months mid-cycle) emitted `stale=true`.

It was not. Reading `raw-csv/2026-08-*/metadata.json` straight out of staging
GCS showed July's closing window ran 2026-08-01..08-10 with 08-11 the first
non-closing day, and `docs/month-end-closing-dates.json` genuinely had no
2026-07 entry. **The alert was a true positive.** Running the prescribed
remediation confirmed exactly one planned write: `add 2026-07 → 2026-08-10`.

So why did it nag for 19 days? Because the check was **detect-only**. Every
daily run read GCS, derived the correct entry, threw it away, and filed an
issue asking a human to run the same derivation locally and commit it. The
identical loop had already run for 2026-06 (#1348) and 2026-05 — each closed
by a hand commit. It was structural and monthly, and nothing about it was
going to stop.

## The takeaway

A monitor that repeatedly asks a human to perform a deterministic,
machine-derivable action is not a monitor — it is an unimplemented feature
with a notification attached. Two failure modes get conflated under one
"stale" bit:

- **The machine already knows the answer.** The pipeline derived it this run.
  Filing a red issue here is pure noise; it trains everyone to ignore the
  label, so the day a *real* one fires nobody looks.
- **The machine cannot see.** Empty feed, degraded reads, crash. Nobody can
  fix this but a human, and "cannot tell" must alert, never pass (L107).

So the axis to split on is **remediation owner**, not severity:
`'none' | 'auto' | 'manual'`. `auto` opens a PR the pipeline authored (a human
still reviews and merges — automation proposes, it does not push to main).
`manual` stays exactly as loud as it was. Blindness dominates: a result that is
both blind and shows gaps is `manual`, because an unreadable feed can "prove"
anything.

Note what this is *not*: widening a threshold, muting the label, or
deduplicating the daily comment. The alert still fires on every condition it
fired on before — the auto-remediable ones now arrive as a reviewable diff
instead of a chore.

## Generalization

Before adding any recurring alert, ask: *when this fires, what will the
responder do?* If the answer is a deterministic procedure the alerting system
could have run itself, build that path instead and reserve the alert for the
cases where a human's judgement is actually the input. If the responder's first
move would be to re-run a command the monitor just ran, the monitor is
incomplete.

Corollary for triage: a monitor with a known cry-wolf history invites
pattern-matching the next report onto it. Verify the *current* firing against
the source data — here, ten `gsutil cat` calls — before inheriting the old
diagnosis. #1419 looked exactly like #1266 and was its opposite: not a false
positive to suppress, but a true positive nobody could act on at the rate it
arrived.
