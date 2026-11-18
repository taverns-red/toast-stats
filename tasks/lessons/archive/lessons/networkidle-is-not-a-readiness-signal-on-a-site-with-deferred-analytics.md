---
date: 2026-10-29
tier: lesson
category: lesson
summary: Playwright's networkidle counts third-party traffic, so on a site that defers analytics until after its data it is a timing race, not a readiness signal; wait for a data-backed element plus the app's own data requests
tags: [testing, flakiness, playwright, videos, ci]
---

# `networkidle` is not a readiness signal on a site with deferred analytics

**Date:** 2026-10-29
**Issue:** #2410 (flakiness epic #917)

## What happened

The Videos capture navigated the live site with `waitUntil: 'networkidle'`
and failed unrelated dependency PRs with a 30 s navigation timeout, while
the page itself served in under half a second. A request log of the same
URL showed every CDN data fetch done by ~2 s, then Google Analytics loading
at ~3.6 s (`index.html` defers gtag until the first screen settles, #1906)
and sending `collect` beacons. `networkidle` (no request of any kind for
500 ms) waits on that third-party tail, so it passes or times out on GA's
timing, not on the page.

## Takeaway

Define "ready" by what the test needs, scoped to first-party work: a
data-backed element on the page plus no in-flight fetch/xhr to the app's
own origin and data CDN. Third-party scripts, beacons and static assets do
not count. The site deliberately pushing analytics *later* is exactly what
makes `networkidle` worse, not better.
