---
date: 2026-10-24
tier: lesson
category: lesson
summary: An "it was never written" assertion right after findBy* passes vacuously, because the post-data passive effect has not run yet
tags: [testing, react, frontend, url-state, cls]
---

# An absence assertion after `findBy*` passes before passive effects run

**Date:** 2026-10-24
**Issue:** #2255

## What happened

The red test for #2255 asserted that a bare `/` keeps `?regions=` out of the
URL. Against the unfixed code, which `replaceState`s the full region list from
a `useEffect` once data lands, it **passed**. `findByText('District 1')`
resolves on the commit that paints the rows. The passive effect that writes
the URL runs after that commit, so at the moment of the assertion the URL was
still bare. Flushing with `await act(async () => {})` before asserting made the
test fail for the right reason (`expected '1,2,3' to be null`).

## The transferable point

A test that asserts that something did **not** happen (no write, no call, no
redirect) has to flush pending effects first. Otherwise it is checking a
moment before the thing it is meant to forbid could have happened. Run it
against the buggy code and watch it fail before you trust it.

The same issue retired a Lesson 145 CLS stabilizer. An incidental fix for a
timing bug expires once its precondition is gone (here, the font-swap reflow
that #1373's metric-matched fallbacks removed). Re-measure an A/B of both
builds under the gate's conditions before you keep it or delete it.
