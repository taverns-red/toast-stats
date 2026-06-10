---
id: '158'
category: lesson
tags: [ci, automation, monitoring, data-pipeline, verification]
auto_load: true
date: 2026-06-10
issues: [1125, 1096]
---

# Lesson 158 — A parameterized monitor's self-clear must be scoped to the signal it alarms on

**Date:** 2026-06-10
**Issue:** #1125 (epic #1096 Sprint 3 — publish-time Zod gate + live-CDN schema canary)
**PR:** _(record on merge)_

## What happened

The CDN schema canary followed Lesson 155's self-clearing pattern: a healthy
run closes any open `cdn-schema-canary` alert, safe because the concurrency
group serializes runs. Fresh-context review caught the hole: the workflow is
**parameterizable** (`workflow_dispatch` accepts `base_url` and
`max_districts`). A healthy dispatch run pointed at the _staging_ bucket — or
capped to a district subset that happens to exclude the failing district —
would close a live **prod** alert. The serialization guard from Lesson 155
holds, but serialization only prevents _racing_ signals; it does nothing
about _different_ signals flowing through the same clear step.

The fix is one `if:` condition: self-clear only when the run checked the
default surface with no cap — i.e. only when this run's signal is the same
signal the alert is about.

A sibling finding from the same review: the canary's default URL was the
GCS **origin bucket**, but consumers (mcp-server) read the **CDN edge**
(`cdn.taverns.red`). A monitor that certifies "what users read" must read
through the same layers users do, or an edge/LB failure passes silently.

## The transferable principle

**When a monitor is parameterizable (alternate target, sampling cap, dry-run
mode), its self-clearing path inherits a false-clear hazard: a healthy run of
a DIFFERENT signal — different surface, partial coverage — must not close an
alert about the canonical signal. Gate the clear step on "this run checked
the exact signal the alert is about" (default target AND full coverage), not
merely on "this run was healthy". Serialization (Lesson 155's guard) prevents
concurrent races, not signal mismatch — they are independent hazards.**

## How to apply

- For every auto-close/auto-resolve step in a workflow, list the input
  parameters that change _what was measured_; the close condition must pin
  each one to the alerting configuration's value.
- Default a read-path monitor's target to the surface consumers actually
  read (edge, not origin) — verify against the real consumer's config
  (here: mcp-server's `DEFAULT_CDN_BASE_URL`), not the pipeline's write
  target.
- Same shape elsewhere: a flake detector run on a filtered subset must not
  reset a whole-suite health flag; a partial backfill must not clear a
  completeness alert.

## Related

- [[155-a-recency-freshness-monitor-is-blind-to-a-held-promotion-content-stale-state]] —
  the self-clearing pattern this lesson scopes; serialization vs signal
  mismatch are different hazards.
- `.github/workflows/cdn-schema-canary.yml` (the gated close step),
  `scripts/check-cdn-schema.ts` (edge-URL default).
