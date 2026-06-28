---
id: '175'
category: lesson
tags: [ci, automation, monitoring, data-pipeline, gcs, verification, tdd]
auto_load: true
date: 2026-06-27
issues: [1267, 1266, 1245, 1128]
---

# Lesson 175 — A fail-closed monitor whose single read can fail transiently cries wolf; pull the live log before trusting the issue's diagnosis

**Date:** 2026-06-27
**Issue:** #1267 (epic #1266 — closing-registry monitor false alerts)
**PR:** _(record on merge)_

## What happened

The issue diagnosed a daily `closing-registry-stale` false alert (#1245) as a
**verdict-logic conflation**: the freshness check supposedly flagged
`stale=true` whenever the raw-csv window had no closing-period months
mid-cycle (`emptyFeed=true`), and asked to relax that benign case to fresh.

Before writing any code I re-ran the check locally and pulled the live CI
step log. Both contradicted the diagnosis:

- **Locally the verdict was already `fresh=true`.** The window is 130 raw-csv
  date dirs (~4 closing windows), so it *always* spans a recent completed
  closing month (May's closing runs early June, derivable all month). The
  "benign no-closing-months mid-cycle" state the issue described **cannot
  occur** with a 130-dir window; `emptyFeed` only fires on `entries.length===0`.
- **The real cause** (identical on the 06-26 and 06-27 runs):
  `GCS metadata fetch failed: … https://sts.googleapis.com/v1/token: Premature
  close` → the read threw on a flaky Workload-Identity/STS token exchange →
  caught into `entries=[]` → `emptyFeed=true` → false stale.

Critically, the issue's *own* prescribed fix kept `emptyFeed` from "a genuine
read/exception failure" as stale — which is exactly what was firing — so it
would not have cleared #1245. Its acceptance criterion "#1245 auto-clears"
failed by construction. The current fail-closed logic was *correct* (L107);
the read was just *flakily* failing.

The fix was therefore not in the verdict but in the read: wrap the single GCS
read in a bounded `retryAsync` (3 attempts, exponential backoff). A transient
token fetch now recovers on attempt 2/3; a persistent failure still falls
through to `emptyFeed` stale (fail-closed preserved). I stopped and got
operator sign-off on the redirected approach before implementing.

## The transferable principle

**A fail-closed monitor is only as quiet as its read is reliable: if the
single I/O it depends on can fail transiently, "cannot tell → alert" turns
every network blip into a false alarm. Make the read survive a transient
(bounded retry + backoff) *before* relaxing any verdict — relaxing the
verdict to silence a flaky read would blind the monitor to the real outage it
exists to catch. And when an issue hands you a confident root-cause, re-run
the check and read the live failing log first: a plausible diagnosis
(`emptyFeed` = "no closing months") can be the wrong mechanism
(`emptyFeed` = "the auth token died"), and the prescribed fix can fail its own
acceptance criteria.**

## How to apply

- A monitor/guard that fails closed on a read error: ask "what's the transient
  failure rate of this read?" Wrap it in retry with backoff; keep the
  fail-closed fallback after attempts are spent. Don't widen the pass
  condition to mask flakiness.
- `sts.googleapis.com/v1/token: Premature close` (and kin) is a transient WIF
  token-exchange error on ephemeral runners — retry, don't treat as a verdict.
- Distrust a diagnosis you can falsify in two commands: re-run the tool, then
  `gh run view <id> --log | grep` the failing step. The verdict line + the
  error line together name the real mechanism. (Reinforces prove-before-claiming.)

## Related

- [[158-a-parameterized-monitors-self-clear-must-be-scoped-to-the-signal-it-alarms-on]]
  — sibling monitor-honesty lesson: scope the *clear*; this one hardens the *read*.
- [[158-a-fail-closed-chain-is-only-as-honest-as-its-writers-a-persisted-default-reads-as-a-decision]]
  — a swallowed default reads as a decision; a swallowed transient read reads as an outage.
- `scripts/closing-registry-check.ts`, `scripts/lib/retry.ts`, #1245 (the false alert this clears).
