---
date: 2026-10-12
tier: lesson
category: lesson
summary: React 19 holds a Suspense reveal up to 300 ms after the fallback commits unless another update flushes it, so a lazy route's skeleton (and its LCP) can wait on an unrelated query; paint the LCP skeleton in the fallback, and read Lighthouse traces for frame starvation before trusting a slow run
tags: [performance, lcp, lighthouse, react, suspense, code-splitting, mobile, measurement]
---

# A lazy route's first paint can wait on an unrelated query, through the Suspense reveal throttle

**Issue:** #1901 (round 2). PRs #1924, #1926.

## What happened

The `/district/:id` LCP element is a static caption in the hub's loading
skeleton, so it should not depend on data. In Lighthouse's observed trace,
though, the route chunk was ready at 82 ms and the hub still mounted only at
~168 ms, right after `v1/dates.json` returned.

The cause is React 19's Suspense reveal throttle. After a fallback commits,
React holds the reveal of the resolved content for up to 300 ms, unless
another update flushes it first. Here the update that flushed it was the
date-index query landing in the app shell. Withholding `dates.json` proved
it: the page then mounted exactly ~300 ms after the fallback. Lantern builds
its graph from that observed order, so it chained the "static" LCP behind the
CDN connection setup and two data round trips.

Separately, the route's static graph pulled in Recharts (116 KB gzip). The
path was `GlobalRankingsTab` → `FullYearRankingChart`, and that tab renders
only for untracked districts. A lazy route renders only after its whole
static graph loads, so the skeleton also waited on that download.

The fixes:

- #1924: lazy-load the tab. A test walks each first-screen route's static
  import closure for `recharts`.
- #1926: paint the hub tiles inside the route's Suspense fallback, using the
  same component, with markup asserted byte-identical.

`/district/61`, Lighthouse: 3.54 → 2.29 s. Applied throttling: 2.84 → 1.56 s.

## Also: check a slow Lighthouse run for frame starvation

On this Mac, headless Chrome intermittently renders the prod origin at about
1 frame per second for the first ~2 s. In those runs:

- the observed FCP equals the LCP, at ~2.3 s;
- the trace has 3 `BeginMainThreadFrame`s instead of ~17;
- even the static HTML shell paints late;
- the main thread is idle the whole time.

Lantern then charges every request that finished before ~2.3 s, which adds
+1.1–1.4 s. CI on Linux never shows it, and locally served builds never
did either.

## How to apply

- **When a lazy route's LCP element is static** (a skeleton, a heading, a
  caption), render it in that route's Suspense fallback with the *same*
  component the page uses. Then the paint does not depend on the chunk, on
  React's reveal timing, or on whatever query happens to flush it. Pin the
  markup identity in a test, and check the geometry per layout: short
  landscape put a section row above the hub, so it kept the generic fallback.
- **Keep heavy libraries out of a route's static graph** when only a rare
  branch uses them. `React.lazy` that branch.
- **Before averaging Lighthouse runs, classify them.** Count
  `BeginMainThreadFrame` events per trace (`-GA` keeps it) and drop
  frame-starved runs, or report them separately. Compare builds like-for-like
  on a local server impersonating the prod host, because the starvation hit
  the real-network origin only.
