/**
 * Hub fetch budget (#2027, found during #1901 / PR #2025).
 *
 * On `/district/:id` the hub downloaded the same CDN objects several times:
 * `config/district-snapshot-index.json` (useDistrictCachedDates and
 * useClubGrowthMilestones, two keys), the district analytics file
 * (useAggregatedAnalytics and useDistrictAnalytics, two keys),
 * `competitive-awards.json` (an undated `latest` read before the page knew its
 * date, then the dated read), and a dated rankings file (the hub's own read and
 * the club-growth checkpoint read, two keys, whenever the displayed date is the
 * one a checkpoint pins to).
 *
 * Each resource must be requested once per hub load. Counted at the `fetch`
 * boundary, against the integration CDN harness, so the count is the real
 * request count rather than a hook-call count.
 *
 * `v1/rankings.json` and `snapshots/{date}/all-districts-rankings.json` are
 * different objects: the header reads the former for the GLOBAL as-of date
 * (useLatestAsOfDate, #1321) while the hub reads the displayed date's file.
 * Retiring that read needs `sourceCsvDate` on `v1/latest.json`, a pipeline
 * change outside #2027. So rankings are budgeted per URL.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupCdnFetchMock } from './utils/mockCdnData'

vi.setConfig({ testTimeout: 15000 })

const CDN = 'https://cdn.taverns.red'

// Let late queries (club growth, trophy case) start before counting.
const settle = () => new Promise(resolve => setTimeout(resolve, 300))

function requestCounts(mockFetch: ReturnType<typeof vi.fn>) {
  const counts = new Map<string, number>()
  for (const [input] of mockFetch.mock.calls) {
    const url = String(input)
    if (!url.startsWith(CDN)) continue
    const path = url.slice(CDN.length)
    counts.set(path, (counts.get(path) ?? 0) + 1)
  }
  return counts
}

function total(counts: Map<string, number>, match: (path: string) => boolean) {
  return [...counts.entries()]
    .filter(([path]) => match(path))
    .reduce((sum, [, n]) => sum + n, 0)
}

/**
 * Load the hub at `url` and return the per-path request counts once it has
 * settled. App builds its browser router when its module loads, reading the
 * location then, so the URL is set first and App is imported fresh.
 */
async function loadHub(url: string, mockFetch: ReturnType<typeof vi.fn>) {
  window.history.replaceState({}, 'Test', url)
  vi.resetModules()
  const { default: App } = await import('../../App')
  render(<App />)

  // Wait for the hub's late reads to have started, then let any follow-up
  // (re-keyed) read start too before counting.
  await waitFor(
    () => {
      const started = requestCounts(mockFetch)
      expect(
        total(started, p => p.endsWith('/competitive-awards.json'))
      ).toBeGreaterThan(0)
      expect(
        total(started, p => p.includes('/analytics/district_61_'))
      ).toBeGreaterThan(0)
      expect(
        total(started, p => p.endsWith('/all-districts-rankings.json'))
      ).toBeGreaterThan(0)
    },
    { timeout: 5000 }
  )
  await settle()
  return requestCounts(mockFetch)
}

function expectOncePerResource(counts: Map<string, number>) {
  // Soft, so one run reports every duplicated resource.
  expect
    .soft(
      total(counts, p => p === '/config/district-snapshot-index.json'),
      'district-snapshot-index.json'
    )
    .toBe(1)
  expect
    .soft(
      total(counts, p => p.endsWith('/analytics/district_61_analytics.json')),
      'district_61_analytics.json'
    )
    .toBe(1)
  expect
    .soft(
      total(counts, p => p.endsWith('/competitive-awards.json')),
      'competitive-awards.json'
    )
    .toBe(1)
  const rankings = [...counts.entries()].filter(
    ([path]) =>
      path === '/v1/rankings.json' ||
      path.endsWith('/all-districts-rankings.json')
  )
  expect(rankings.length).toBeGreaterThan(0)
  for (const [path, n] of rankings) {
    expect.soft(n, path).toBe(1)
  }
}

describe('District hub — one request per resource (#2027)', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = setupCdnFetchMock()
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('on the default hub, fetches each resource once', async () => {
    expectOncePerResource(await loadHub('/district/61', mockFetch))
  })

  it('on a date a club-growth checkpoint pins to, fetches that rankings file once', async () => {
    // PY 2023-24's March checkpoint (2024-03-31) resolves to the nearest prior
    // snapshot, 2023-12-31 — the date this URL displays. Two keys, one file.
    const counts = await loadHub(
      '/district/61?py=2023&date=2023-12-31',
      mockFetch
    )
    expect(
      total(
        counts,
        p => p === '/snapshots/2023-12-31/all-districts-rankings.json'
      )
    ).toBeGreaterThan(0)
    expectOncePerResource(counts)
  })
})
