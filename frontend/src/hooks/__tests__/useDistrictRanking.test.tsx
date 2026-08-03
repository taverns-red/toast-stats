/**
 * useDistrictRanking (#1396) — the rankings row must be scoped to the snapshot
 * the page is DISPLAYING, not to the pipeline's `latest`.
 *
 * The hook fetched `v1/rankings.json` under a fixed `['district-rankings',
 * 'latest']` key with no date argument, so a district Overview showing a PAST
 * program year rendered the CURRENT year's Payment Composition (and the
 * current year's trophy-case integers) while every neighbouring card was
 * correctly year-scoped. Textbook R3: the parent owned the date and the child
 * ignored it.
 *
 * The fixtures below are the real observed numbers from the report: D61's
 * current-year row (73 / 587 / 941 / 1 / 0 = 1602 events) is what the past-year
 * card was showing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDistrictRanking } from '../useDistrictRanking'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../../services/cdn'
import type { CdnRankingsData } from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'
import type { SnapshotDate } from '../../types/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
}))

const mockedLatest = vi.mocked(fetchCdnRankings)
const mockedForDate = vi.mocked(fetchCdnRankingsForDate)

/** A rankings row carrying the payment breakdown the card consumes. */
type Row = CdnRankingsData['rankings'][number] & {
  newPayments: number
  aprilPayments: number
  octoberPayments: number
  latePayments: number
  charterPayments: number
}

function row(payments: {
  newPayments: number
  aprilPayments: number
  octoberPayments: number
  latePayments: number
  charterPayments: number
  paidClubs?: number
  totalPayments?: number
}): Row {
  return {
    districtId: '61',
    districtName: 'District 61',
    region: '07',
    paidClubs: payments.paidClubs ?? 100,
    paidClubBase: 98,
    clubGrowthPercent: 2,
    totalPayments: payments.totalPayments ?? 3000,
    paymentBase: 2900,
    paymentGrowthPercent: 3,
    activeClubs: 100,
    distinguishedClubs: 30,
    selectDistinguished: 8,
    presidentsDistinguished: 4,
    distinguishedPercent: 30,
    clubsRank: 10,
    paymentsRank: 12,
    distinguishedRank: 14,
    aggregateScore: 400,
    overallRank: 11,
    ...payments,
  }
}

/** What `v1/rankings.json` serves today — the CURRENT program year. */
const CURRENT: CdnRankingsData = {
  rankings: [
    row({
      newPayments: 73,
      aprilPayments: 587,
      octoberPayments: 941,
      latePayments: 1,
      charterPayments: 0,
      paidClubs: 94,
      totalPayments: 1602,
    }),
  ],
  asOfDate: '2026-07-31',
  generatedAt: '2026-07-31T00:00:00Z',
}

/** The 2024-2025 year-end snapshot — a genuinely different year. */
const PY_2024: CdnRankingsData = {
  rankings: [
    row({
      newPayments: 40,
      aprilPayments: 300,
      octoberPayments: 500,
      latePayments: 2,
      charterPayments: 1,
      paidClubs: 128,
      totalPayments: 843,
    }),
  ],
  snapshotDate: snap('2025-06-30'),
  asOfDate: '2025-07-18',
  generatedAt: '2025-07-18T00:00:00Z',
}

/** The 2023-2024 year-end snapshot — the second year, for the cache probe. */
const PY_2023: CdnRankingsData = {
  rankings: [
    row({
      newPayments: 55,
      aprilPayments: 320,
      octoberPayments: 480,
      latePayments: 3,
      charterPayments: 2,
      paidClubs: 121,
      totalPayments: 860,
    }),
  ],
  snapshotDate: snap('2024-06-30'),
  asOfDate: '2024-07-17',
  generatedAt: '2024-07-17T00:00:00Z',
}

const BY_DATE: Record<string, CdnRankingsData> = {
  '2025-06-30': PY_2024,
  '2024-06-30': PY_2023,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedLatest.mockResolvedValue(CURRENT)
  mockedForDate.mockImplementation((date: SnapshotDate) =>
    Promise.resolve(BY_DATE[date] ?? CURRENT)
  )
})
afterEach(() => cleanup())

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderRanking(date: SnapshotDate | undefined, client: QueryClient) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    ({ d }: { d: SnapshotDate | undefined }) => useDistrictRanking('61', d),
    { wrapper, initialProps: { d: date } }
  )
}

describe('useDistrictRanking — snapshot scoping (#1396)', () => {
  it("returns the SELECTED snapshot's row, not the pipeline's latest", async () => {
    const { result } = renderRanking(snap('2025-06-30'), makeClient())

    await waitFor(() => expect(result.current.ranking).not.toBeNull())
    // 40/300/500 is the 2024-2025 year-end row. 73/587/941 is what
    // `v1/rankings.json` serves today — seeing it here IS the bug.
    expect(result.current.ranking?.newPayments).toBe(40)
    expect(result.current.ranking?.aprilPayments).toBe(300)
    expect(result.current.ranking?.octoberPayments).toBe(500)
    // The trophy-case integer inputs come off the same row (#840).
    expect(result.current.ranking?.paidClubs).toBe(128)
    expect(mockedForDate).toHaveBeenCalledWith(snap('2025-06-30'))
    expect(mockedLatest).not.toHaveBeenCalled()
  })

  it("does not serve one program year from another year's cache entry", async () => {
    // One QueryClient across both renders — a key that omits the date would
    // make the second year a cache HIT on the first, so the fix would look
    // applied while the numbers never changed.
    const client = makeClient()
    const { result, rerender } = renderRanking(snap('2025-06-30'), client)
    await waitFor(() => expect(result.current.ranking?.newPayments).toBe(40))

    rerender({ d: snap('2024-06-30') })
    await waitFor(() => expect(result.current.ranking?.newPayments).toBe(55))
    expect(result.current.ranking?.paidClubs).toBe(121)

    // And back again — the first year must still be its own row.
    rerender({ d: snap('2025-06-30') })
    await waitFor(() => expect(result.current.ranking?.newPayments).toBe(40))
  })

  it('keys each snapshot separately so cached years cannot collide', async () => {
    const client = makeClient()
    const { result, rerender } = renderRanking(snap('2025-06-30'), client)
    await waitFor(() => expect(result.current.ranking).not.toBeNull())
    rerender({ d: snap('2024-06-30') })
    await waitFor(() => expect(result.current.ranking?.newPayments).toBe(55))

    expect(
      client.getQueryData(['district-rankings', '2025-06-30'])
    ).toBeDefined()
    expect(
      client.getQueryData(['district-rankings', '2024-06-30'])
    ).toBeDefined()
  })

  it('suppresses the cdn.ts silent latest-fallback instead of showing another snapshot', async () => {
    // `fetchCdnRankingsForDate` falls back to `v1/rankings.json` when a per-date
    // file 404s, and marks that by leaving `snapshotDate` unset. Rendering the
    // current year's numbers under a past date is the exact #1396 symptom, so
    // the hook must report "no row" rather than the wrong row.
    mockedForDate.mockResolvedValue(CURRENT)

    const { result } = renderRanking(snap('2025-06-30'), makeClient())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.ranking).toBeNull()
  })
})

describe('useDistrictRanking — latest path (#1321 key sharing)', () => {
  it("reads v1/rankings.json under useLatestAsOfDate's shared key when no date is given", async () => {
    const client = makeClient()
    const { result } = renderRanking(undefined, client)

    await waitFor(() => expect(result.current.ranking).not.toBeNull())
    expect(result.current.ranking?.newPayments).toBe(73)
    expect(mockedLatest).toHaveBeenCalled()
    expect(mockedForDate).not.toHaveBeenCalled()
    // `useLatestAsOfDate` shares this exact key + queryFn so the two don't both
    // pull the ~126KB file. Changing it here would silently double the fetch.
    expect(client.getQueryData(['district-rankings', 'latest'])).toBeDefined()
  })
})
