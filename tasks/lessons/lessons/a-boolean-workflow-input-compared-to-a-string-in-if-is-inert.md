---
date: 2026-06-11
tier: lesson
summary: A `workflow_dispatch` boolean input compared to a string in `if:` is inert; normalize booleans to step-output strings once
tags: [ci, automation, verification, tests]
legacy_id: "161"
---

# Lesson 161 — A `workflow_dispatch` boolean input compared to a string in `if:` is inert; normalize booleans to step-output strings once

**Date:** 2026-06-11
**Issue:** #1133 (epic #1102 Sprint 3)
**PR:** _(record on merge)_

## What happened

`data-pipeline.yml`'s prune mode guarded its GCS deletion step with
`if: steps.mode.outputs.mode == 'prune' && inputs.dry_run != 'true'`. The
`dry_run` input is declared `type: boolean` — and in the `inputs`
expression context boolean inputs are real booleans. GitHub's loose
equality coerces mismatched types to numbers: `true` → `1`, `'true'` →
`NaN`, and NaN never equals anything. So `inputs.dry_run != 'true'` was
**always true**: a prune dispatched with `dry_run=true` would still have
deleted from GCS. The classification output lists non-keepers with
`keep: false` even in a dry run, so the deletion loop had real input. Five
conditions in the file carried the same inert pattern. (Bash
interpolations like `[ "${{ inputs.dry_run }}" = "true" ]` are unaffected
— interpolation stringifies; only `if:` expressions compare typed values.)

## The transferable principle

**In GitHub Actions expressions, never compare a boolean-typed input to a
quoted string — the comparison silently always goes one way, and the step
it guards runs (or skips) regardless of what the operator selected. The
failure is invisible: no error, no warning, a green run.** Normalize every
boolean input to a step-output string once (step outputs are always
strings), and compare strings to strings in every `if:`. Pair the fix with
a drift guard that greps workflows for `inputs.<boolean> ==/!= '…'` —
sourced from the input declarations themselves, with a known-bad sentinel
(Lesson 082) so the rule is proven to fire.

## How to apply

- Declaring a `type: boolean` dispatch input? Route it through the
  normalize step (`steps.mode.outputs.<name>`) before any `if:` uses it.
  Enforced by `scripts/lib/workflowBooleanInputGuard.ts` + its repo-sweep
  test.
- Reviewing a workflow gate, check the input's declared type against every
  comparison site — the bash-interpolation sites working correctly is
  exactly what hides the broken `if:` sites.
- A guard on a destructive step deserves a falsification check at review
  time: "what evaluates this condition, with what types, when the operator
  picks the safe option?"

## Related

- [[082-a-lint-rule-can-be-declared-at-error-yet-inert-a-sentinel-must-lint-a-known-bad-snippet]]
  — the sentinel discipline this guard reuses.
- `.github/workflows/data-pipeline.yml` (mode step normalization),
  `scripts/lib/workflowBooleanInputGuard.ts` (the drift guard).
