---
date: 2026-10-22
tier: lesson
summary: GitHub's workflow-run listing intermittently returns 200 with zero results; an empty listing is not evidence that nothing is running, so check that it contains a run you know exists
tags: [ci, github-actions, ci-gate, github-api, flakiness]
---

# An empty API listing is not evidence of absence: check it contains a known member

**Date:** 2026-10-22
**Issue:** #2219

## What happened

#2220 taught CI Gate to wait on a skipped-only check while another workflow
run on the head SHA was in flight, read from
`GET /actions/runs?head_sha=<sha>`. On PR #2240 the gate still failed on
`Build Applications: skipped` while the real CI run was in progress. The log
proved `runsInFlight` was true for three polls and false on the fourth, with
nothing on the head having completed in between.

Replaying the exact request against the live head showed the cause: the
endpoint answered `200` with `total_count: 0` on 7 of 16 reads, and with all
5 runs on the rest. There was no error to catch. An empty list looked the
same as "every run has completed".

## The takeaway

When a decision rests on a listing being empty, check that the listing holds
a member you know must be there. The gate's own run is always on its head, so
a listing without it is incomplete and counts as in flight. Where a second,
independent source exists (here, a running check run on the same head),
accept either one as proof of activity.

Also log the raw listing on every poll. #2220's logs showed only the derived
verdict, so the cause could only be found by replaying the API while the run
was still live.
