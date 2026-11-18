---
date: 2026-10-13
tier: lesson
summary: A real GA collect beacon fires `response` then `requestfailed`, never `requestfinished` — key a Playwright leak guard on `response`
tags: [testing, playwright, analytics, e2e]
---

# A GA beacon reports `requestfailed`, so guard real hits on `response`

**Date:** 2026-10-13
**Issue:** #1979

## What happened

The first cut of the shared smoke fixture's "no hit reached Google" guard
listened for `requestfinished`. Run red against prod, it stayed silent while a
real page_view went out. A canary that logged every context event showed the
real `www.google-analytics.com/g/collect` request emits `request`, then
`response`, then `requestfailed` (a beacon / no-cors request), and never
`requestfinished`.

## Takeaway

A network guard must be proven red before it is trusted: run it once against
the real leak and see it fire. For analytics beacons in Playwright, key the
guard on `response` (a fulfilled route also emits `response`, so compare
against the set of requests the stub handled).
