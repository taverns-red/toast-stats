/**
 * Hub fetch budget (#2027, found during #1901 / PR #2025).
 *
 * On `/district/:id` the hub downloaded the same CDN objects several times:
 * `config/district-snapshot-index.json` (useDistrictCachedDates and
 * useClubGrowthMilestones, two keys), the district analytics file
 * (useAggregatedAnalytics and useDistrictAnalytics, two keys),
 * `competitive-awards.json` (an undated `latest` read before the page knew its
 * date, then the dated read), and the rankings file (`v1/rankings.json` before
 * the date was known, then `snapshots/{date}/all-districts-rankings.json`).
 *
 * Each resource must be requested once per hub load. Counted at the `fetch`
 * boundary, against the integration CDN harness, so the count is the real
 * request count rather than a hook-call count.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import App from '../../App'
import { setupCdnFetchMock, SNAPSHOT_DATE } from './utils/mockCdnData'

vi.setConfig({ testTimeout: 15000 })

// App builds its browser router when the module loads, reading the location
// then — so the hub URL has to be in place before `App` is imported.
vi.hoisted(() => {
  window.history.replaceState({}, 'Test', '/district/61')
})

const CDN = 'https://cdn.taverns.red'

// Let late queries (club growth, trophy case) start before counting.
const settle = () => new Promise(resolve => setTimeout(resolve, 300))

function countRequests(mockFetch: ReturnType<typeof vi.fn>) {
  const counts = new Map<string, number>()
  for (const [input] of mockFetch.mock.calls) {
    const url = String(input)
    if (!url.startsWith(CDN)) continue
    const path = url.slice(CDN.length)
    counts.set(path, (counts.get(path) ?? 0) + 1)
  }
  return (predicate: (path: string) => boolean) =>
    [...counts.entries()]
      .filter(([path]) => predicate(path))
      .reduce((sum, [, n]) => sum + n, 0)
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

  it('fetches the snapshot index, analytics, competitive awards and rankings once each', async () => {
    render(<App />)

    // Wait for the hub's late reads to have started, then let any follow-up
    // (re-keyed) read start too before counting.
    await waitFor(
      () => {
        const started = countRequests(mockFetch)
        expect(
          started(p => p.endsWith('/competitive-awards.json'))
        ).toBeGreaterThan(0)
        expect(
          started(p => p.includes('/analytics/district_61_'))
        ).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )
    await settle()

    const count = countRequests(mockFetch)

    // Soft, so one run reports every duplicated resource.

    expect
      .soft(
        count(p => p === '/config/district-snapshot-index.json'),
        'district-snapshot-index.json'
      )
      .toBe(1)
    expect
      .soft(
        count(p => p.endsWith('/analytics/district_61_analytics.json')),
        'district_61_analytics.json'
      )
      .toBe(1)
    expect
      .soft(
        count(p => p.endsWith('/competitive-awards.json')),
        'competitive-awards.json'
      )
      .toBe(1)
    // The hub's own rankings read: the undated `v1/rankings.json` or the
    // displayed snapshot's dated file. Club-growth checkpoint files are other
    // dates and are not counted here.
    expect
      .soft(
        count(
          p =>
            p === '/v1/rankings.json' ||
            p === `/snapshots/${SNAPSHOT_DATE}/all-districts-rankings.json`
        ),
        'rankings'
      )
      .toBe(1)
  })
})
