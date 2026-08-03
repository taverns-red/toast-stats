/**
 * useDistricts (#1398) — the browsable district list must describe the snapshot
 * the page is DISPLAYING, not whatever the pipeline published last.
 *
 * The hook derived its list from the undated `fetchCdnRankings()`, i.e. the
 * CURRENT program year only. Districts are realigned between years, so a
 * district that existed in a past year and does not exist now was simply absent
 * from the list on a past-year URL — and `DistrictDetailPage` reads that list as
 * an existence gate, dropping the visitor onto the limited Global-Rankings page.
 *
 * The numbers below are the real CDN counts on 2026-08-02: the 2025-06-30
 * snapshot carries 132 districts and `v1/rankings.json` carries 94. D27 is in
 * the first set and not the second.
 *
 * Same defect as #1396, one hook over, so the same two traps apply: the date
 * must be part of the query key (or year B is served from year A's entry and
 * the fix looks applied while nothing changes), and the undated path must stay
 * byte-identical for the common case.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDistricts } from '../useDistricts'
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

type Row = CdnRankingsData['rankings'][number]

function row(districtId: string, districtName?: string): Row {
  return {
    districtId,
    districtName: districtName ?? districtId,
    region: '06',
    paidClubs: 90,
    paidClubBase: 88,
    clubGrowthPercent: 2,
    totalPayments: 2919,
    paymentBase: 2754,
    paymentGrowthPercent: 6,
    activeClubs: 92,
    distinguishedClubs: 38,
    selectDistinguished: 4,
    presidentsDistinguished: 14,
    distinguishedPercent: 43,
    clubsRank: 29,
    paymentsRank: 20,
    distinguishedRank: 71,
    aggregateScore: 279,
    overallRank: 33,
  }
}

/** What `v1/rankings.json` serves today — no D27, no D34. */
const CURRENT: CdnRankingsData = {
  rankings: [row('61'), row('46'), row('F', 'F')],
  asOfDate: '2026-08-02',
  generatedAt: '2026-08-02T00:00:00Z',
}

/** The 2024-2025 year-end snapshot — D27 existed then. */
const PY_2024: CdnRankingsData = {
  rankings: [row('61'), row('46'), row('27'), row('F', 'F')],
  snapshotDate: snap('2025-06-30'),
  asOfDate: '2025-07-18',
  generatedAt: '2025-07-18T00:00:00Z',
}

/** The 2023-2024 year-end snapshot — a different past year, for the cache probe. */
const PY_2023: CdnRankingsData = {
  rankings: [row('61'), row('46'), row('34'), row('F', 'F')],
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

function renderDistricts(
  date: SnapshotDate | undefined,
  client: QueryClient = makeClient()
) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    ({ d }: { d: SnapshotDate | undefined }) => useDistricts(d),
    { wrapper, initialProps: { d: date } }
  )
}

const idsOf = (data: { districts: { id: string }[] } | undefined) =>
  data?.districts.map(d => d.id) ?? []

describe('useDistricts — the list follows the displayed snapshot (#1398)', () => {
  it('includes a district that existed in the SELECTED year but not today', async () => {
    const { result } = renderDistricts(snap('2025-06-30'))

    await waitFor(() => expect(result.current.data).toBeDefined())
    // D27 is in the 2024-2025 snapshot and absent from `v1/rankings.json`.
    // Missing it here is exactly why /district/27?py=2024 falls back to the
    // limited Global-Rankings page.
    expect(idsOf(result.current.data)).toContain('27')
    expect(mockedForDate).toHaveBeenCalledWith(snap('2025-06-30'))
    expect(mockedLatest).not.toHaveBeenCalled()
  })

  it('carries the district name off the selected snapshot, not the latest one', async () => {
    const { result } = renderDistricts(snap('2025-06-30'))

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.districts).toContainEqual({
      id: '27',
      name: '27',
    })
  })

  it("does not serve one program year's list from another year's cache entry", async () => {
    // One QueryClient across both renders — a key that omits the date would
    // make the second year a cache HIT on the first, so the fix would look
    // applied while the list never changed.
    const client = makeClient()
    const { result, rerender } = renderDistricts(snap('2025-06-30'), client)
    await waitFor(() => expect(idsOf(result.current.data)).toContain('27'))

    rerender({ d: snap('2024-06-30') })
    await waitFor(() => expect(idsOf(result.current.data)).toContain('34'))
    expect(idsOf(result.current.data)).not.toContain('27')

    // And back again — the first year must still be its own list.
    rerender({ d: snap('2025-06-30') })
    await waitFor(() => expect(idsOf(result.current.data)).toContain('27'))
    expect(idsOf(result.current.data)).not.toContain('34')
  })

  it('keys each snapshot separately so cached years cannot collide', async () => {
    const client = makeClient()
    const { result, rerender } = renderDistricts(snap('2025-06-30'), client)
    await waitFor(() => expect(result.current.data).toBeDefined())
    rerender({ d: snap('2024-06-30') })
    await waitFor(() => expect(idsOf(result.current.data)).toContain('34'))

    expect(client.getQueryData(['districts', '2025-06-30'])).toBeDefined()
    expect(client.getQueryData(['districts', '2024-06-30'])).toBeDefined()
  })
})

describe('useDistricts — undated latest path is unchanged (#1398)', () => {
  it('reads v1/rankings.json and yields the current list when given no date', async () => {
    const client = makeClient()
    const { result } = renderDistricts(undefined, client)

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(idsOf(result.current.data)).toEqual(['61', '46', 'F'])
    expect(mockedLatest).toHaveBeenCalled()
    expect(mockedForDate).not.toHaveBeenCalled()
  })

  it('serves the undated list from its own cache entry', async () => {
    const client = makeClient()
    const { result } = renderDistricts(undefined, client)
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(client.getQueryData(['districts', 'latest'])).toBeDefined()
  })

  it('keeps the current list distinct from a dated one on the same client', async () => {
    const client = makeClient()
    const undated = renderDistricts(undefined, client)
    await waitFor(() => expect(undated.result.current.data).toBeDefined())
    expect(idsOf(undated.result.current.data)).not.toContain('27')

    const dated = renderDistricts(snap('2025-06-30'), client)
    await waitFor(() => expect(dated.result.current.data).toBeDefined())
    expect(idsOf(dated.result.current.data)).toContain('27')
    // The undated entry must not have been overwritten by the dated fetch.
    expect(idsOf(undated.result.current.data)).not.toContain('27')
  })
})
