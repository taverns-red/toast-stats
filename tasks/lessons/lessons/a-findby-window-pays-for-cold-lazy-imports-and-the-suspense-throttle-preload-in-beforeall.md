---
date: 2026-10-24
tier: lesson
category: lesson
summary: A test's first findBy window pays for Vite's cold compile of every lazily imported module and for React 19's 300 ms Suspense reveal throttle, so on a ~4x slower runner it overruns 1 s; import the lazy graph in beforeAll, and calibrate a CPU-throttle repro to the slowdown per worker, not the slowdown of the whole suite
tags: [testing, flaky, vitest, react, suspense, code-splitting, ci]
---

# A findBy window pays for cold lazy imports and the Suspense throttle

**Issue:** #2248. Main run 39847333836 failed 10 page and journey tests with `findBy` "Unable to find". The re-run passed with no code change.

## What happened

The failing attempt was about 4x slower than its re-run in every workspace, including the pure-Node packages (shared-contracts 25.1 s vs 6.0 s, collector-cli 94.2 s vs 22.9 s, frontend 2277 s vs 562 s). So the runner itself was slow. Seven of the ten failures were the **first** test in a file that renders its page through a test-local `React.lazy(() => import(...))`, and the DOM was still the Suspense fallback `Loading…`.

- A page's cold import costs 180–370 ms with coverage on, even on an M-series Mac, because Vite compiles the module graph on first use. That cost lands inside the first test's 1 s window. At 4x it overruns the window by itself.
- `DistrictMapPage.test.tsx` already had the fix (preload in `beforeAll`) and a comment explaining it. Most page tests lacked it, and the map tests' lists covered 2 of the 10–11 chunks their page lazy-loads. A per-file fix without a guard drifts. `src/__tests__/guards/lazyPreload.test.ts` now enforces the test-local half.
- Preloading does **not** resolve a `React.lazy` object. The first render of each lazy boundary still suspends, and React 19 holds the reveal about 300 ms of wall-clock time (see the [Suspense reveal-throttle lesson](a-lazy-routes-first-paint-can-wait-on-an-unrelated-query-via-the-suspense-reveal-throttle.md)). That leaves about 700 ms for CPU work, which is only about 175 ms of base CPU at 4x. `WorldMapPage`'s online-chip test (the chip is a lazy child first rendered mid-file) still fails some of the time under a 4x throttle, on main as well.

## Reproducing it

Spin N busy-loop processes while running the files with `CI=1 npx vitest --run --coverage <files>`. Calibrate N so that each **worker** is about 4x slower: with 10 cores and 5 workers, (N + 5) / 10 ≈ 4, so N ≈ 35. Seventy spinners gave about 7.5x per worker even though the suite total looked like "4x", because the total includes idle parallelism. That over-throttle produced failures that CI never showed.

## Takeaway

When a findBy flakes only on slow runners, list what runs inside its window: a cold `import()`, a first-time Suspense reveal (fixed at 300 ms), and fixture work inside mocks. Move one-time costs into `beforeAll` rather than bumping the timeout.
