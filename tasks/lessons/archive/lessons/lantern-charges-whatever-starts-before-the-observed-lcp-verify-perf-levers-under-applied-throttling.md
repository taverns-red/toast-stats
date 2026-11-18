---
date: 2026-10-12
tier: lesson
summary: Lantern charges every request that starts before the observed LCP, so it rewards a font preload a real throttled browser punishes; decide perf levers with applied throttling too
tags: [performance, lighthouse, fonts, mobile, measurement]
---

# Lantern charges whatever starts before the observed LCP — verify perf levers under applied throttling

**Date:** 2026-10-12
**Issues:** #1905 (self-host fonts), #1906 (gtag + favicon). PRs #1918, #1916.

## What happened

Lighthouse's default mobile run uses *simulated* throttling (Lantern). It
loads the page unthrottled, then rebuilds LCP from a dependency graph that
includes every request that **started before the observed (unthrottled)
LCP**. Two consequences showed up:

1. **Bimodal LCP.** gtag (176 KB, injected at `load` + idle) and the web
   fonts (found at render) raced the observed paint. Whichever side of the
   line they landed on decided whether ~240 KB was charged. Runs split into
   fast and slow clusters. Moving gtag to after the first screen settled
   took it out of the graph in every run.
2. **A misleading preload.** Preloading the two first-screen woff2 files
   (64 KB) improved Lantern FCP. In a real browser with applied throttling
   (the review's perf.mjs profile: 150 ms RTT, 1.6 Mbps, 4× CPU), the same
   build's FCP got **~330 ms worse on every route**. The preloads compete
   with the app's JS for a thin link. Self-hosting without a preload was
   neutral there and still faster under Lantern, so it shipped without one.

## The takeaway

When a perf change moves request timing (preload, defer, lazy-load), measure
it under **both** Lantern and applied throttling before choosing:

- Lantern tells you what the CI gate will score.
- Applied throttling tells you what a phone will feel.

If they disagree, ship what the phone feels, and record the disagreement
where the choice is enforced (here: `webFonts.test.ts` asserts no font
preload, with the numbers).

## How to apply

- Like-for-like comparisons of a prod-only path (GA) can impersonate the
  prod host locally. Use Chrome `--host-resolver-rules="MAP ts.taverns.red:443
  127.0.0.1:<port>"` with `--ignore-certificate-errors` and a self-signed
  HTTPS static server. Data stays on the real prod CDN.
- Interleave A/B runs. Other sessions' test suites share the machine.
- Read `largest-contentful-paint` together with which requests started
  before `observedLargestContentfulPaint` (`network-requests` audit). That
  explains a run instead of averaging it away.
