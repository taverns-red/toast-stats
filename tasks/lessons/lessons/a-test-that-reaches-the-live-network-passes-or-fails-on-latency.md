---
date: 2026-10-29
tier: lesson
summary: A page test with an un-stubbed CDN read depends on network latency; stub fetch to reject at once to reproduce the CI timing, then stub the read
tags: [testing, flaky-tests, integration, react-query, vitest, mocks, cdn]
---

# Lesson — A test that reaches the live network passes or fails on latency

**Date:** 2026-10-29
**Issue:** #2403 (ClubDetailPage integration tests red on main)

## What happened

Six `ClubDetailPage.test.tsx` tests failed on main twice in a row, and the
same tree had passed 40 minutes earlier. Locally all 45 passed, including with
`TZ=UTC`, `CI=true` and `--coverage`, so this was not a time bomb and not
caused by the release commit.

The file made two real requests to the live CDN (`v1/dates.json` from
`ProgramYearProvider`, and the district snapshot from `useDistrictStatistics`)
through a QueryClient shared across the file. On a dev machine those
requests were still pending when the file finished. On CI the snapshot 404
came back mid-file. Later mounts then subscribed to a settled, stale query,
started a refetch and re-rendered synchronously inside `render()`'s act. The
first render used up each test's `mockReturnValueOnce`, and the second
render showed the base fixture.

## Takeaway

Before chasing time or version, check whether the test reaches the network.
Stub `fetch` to resolve or reject at once and see if that reproduces the
CI failure. Then stub the read itself, and keep the instant-rejecting `fetch`
stub with an `afterEach` "never called" assertion as the guard.
`mockReturnValueOnce` on a hook breaks on any extra render, so a stray
settled query can spend it.

A census of the integration project (logging `fetch` per file) found 26 more
files that reach the live CDN. They pass at both extremes (instant 404, never
settles) except `ClubDetailPage.programYear.test.tsx`, which needs the
request to settle.
