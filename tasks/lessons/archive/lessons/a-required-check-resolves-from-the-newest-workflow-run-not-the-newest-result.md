---
date: 2026-11-16
tier: lesson
summary: GitHub resolves a required check from the newest workflow run that posted it, so a no-op run started mid-CI can pin a stale failure or a skipped pass over the real result
tags: [ci, github-actions, required-checks, merge-gate]
---

# A required check resolves from the newest workflow run, not the newest result

**Issue:** #2865 (PR Preview verdict on every PR), follow-up #2881

## What happened
On PR #2880, a PR edit (`edited`, most likely the body update) while CI was running started a
second ci.yml run. Its no-op `CI Gate` re-verified the head, found Test Suite still in flight,
and failed. The real run's `CI Gate` passed nine minutes later, but the PR stayed BLOCKED until
the newer run's failed job was re-run. The reverse also holds: a job skipped by its `if:` reports
success, so a no-op run that skips the gate job can clear an earlier real failure. Labels start
PR Preview runs, and the first cut of #2880 had exactly that bypass. Both fit one rule. GitHub
doesn't document it, but it matches every observation: the check resolves to the latest run of
that name in the most recently created check suite.

## Takeaway
A gate job that also runs on no-op events (`edited` for ci.yml, `labeled` for pr-preview.yml)
must never post a result while an older real run is in flight, and must never be skipped. Wait
for the head's older runs of the same workflow to complete, then mirror the newest one's result,
and never wait on newer runs (`scripts/lib/previewVerdictMirror.ts`, `scripts/lib/ciGateWait.ts`).
Prove it live by firing the no-op event on a PR mid-run (edit the body for ci.yml, add a label for
pr-preview.yml) and checking that `mergeStateStatus` ends CLEAN with no manual re-run.

Corrected 2026-11-16: ci.yml has no `labeled` trigger, so its no-op run came from an edit, not a label.
