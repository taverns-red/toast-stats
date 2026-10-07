/**
 * useClubGrowthRecipients (#1537) — the worldwide recipients view must take
 * every verdict from the CHECKPOINT'S OWN rankings file.
 *
 * The mutation this file exists to keep impossible is #1475's
 * `expected 12 to be 5`: today's cumulative count wearing a September 30
 * label. Every mock routes on the date the wire asks for, and the falling-back
 * fetchers are wired to return a divergent "today" so any read of them shows.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  recipientsAtCheckpoint,
  useClubGrowthRecipients,
} from '../useClubGrowthRecipients'
import {
  fetchCdnRankings,
  fetchCdnRankingsForDate,
  fetchCdnRankingsForDateExact,
  fetchCdnSnapshotIndex,
  type CdnRankingsData,
} from '../../services/cdn'
import { getProgramYear } from '../../utils/programYear'
import { snap } from '../../test-utils/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnSnapshotIndex: vi.fn(),
  fetchCdnRankingsForDateExact: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnRankings: vi.fn(),
}))

const mockedIndex = vi.mocked(fetchCdnSnapshotIndex)
const mockedExact = vi.mocked(fetchCdnRankingsForDateExact)
const mockedFalling = vi.mocked(fetchCdnRankingsForDate)
const mockedLatest = vi.mocked(fetchCdnRankings)

const PY_2026 = getProgramYear(2026)
const PY_2025 = getProgramYear(2025)

type Row = CdnRankingsData['rankings'][number]

function row(districtId: string, newCharteredClubs?: number): Row {
  const base: Row = {
    districtId,
    districtName: `District ${districtId}`,
    region: '07',
    paidClubs: 100,
    paidClubBase: 98,
    clubGrowthPercent: 2,
    totalPayments: 3000,
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
  }
  return newCharteredClubs === undefined ? base : { ...base, newCharteredClubs }
}

function file(date: string, rows: Row[], asOfDate = date): CdnRankingsData {
  return {
    rankings: rows,
    snapshotDate: snap(date),
    asOfDate,
    generatedAt: `${date}T12:00:00Z`,
  }
}

/** Today's numbers: district 61 has since climbed to 12. Never a verdict. */
const TODAY: CdnRankingsData = {
  rankings: [row('61', 12), row('42', 9)],
  asOfDate: '2026-10-05',
  generatedAt: '2026-10-05T00:00:00Z',
}

/** The Sep 30 checkpoint file, as it stood on the day. */
const SEP_FILE = file(
  '2026-09-30',
  [row('61', 5), row('42', 3), row('7', 2), row('9', 0), row('U', 3)],
  '2026-10-05'
)

let client: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mockedFalling.mockResolvedValue(TODAY)
  mockedLatest.mockResolvedValue(TODAY)
  mockedIndex.mockResolvedValue({ '61': ['2026-09-29', '2026-09-30'] })
  mockedExact.mockImplementation(async date =>
    date === '2026-09-30' ? SEP_FILE : null
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('recipientsAtCheckpoint', () => {
  it('lists exactly the districts whose checkpoint count meets a tier, highest tier first', () => {
    const recipients = recipientsAtCheckpoint(SEP_FILE, '2026-2027', {
      id: 'september',
      date: '2026-09-30',
    })
    expect(recipients.map(r => [r.districtId, r.count, r.milestone])).toEqual([
      ['61', 5, 5],
      ['42', 3, 3],
      ['U', 3, 3],
    ])
  })

  it('judges March on the March tiers (10 exists there, not in September)', () => {
    const mar = file('2027-03-31', [row('61', 10), row('42', 12)])
    const sep = recipientsAtCheckpoint(mar, '2026-2027', {
      id: 'september',
      date: '2026-09-30',
    })
    const march = recipientsAtCheckpoint(mar, '2026-2027', {
      id: 'march',
      date: '2027-03-31',
    })
    expect(sep.map(r => r.milestone)).toEqual([5, 5])
    expect(march.map(r => [r.districtId, r.milestone])).toEqual([
      ['42', 10],
      ['61', 10],
    ])
  })
})

describe('useClubGrowthRecipients', () => {
  it('is not applicable before PY 2026-27 and fetches nothing (forward-only)', () => {
    const { result } = renderHook(
      () => useClubGrowthRecipients(PY_2025, '2026-03-31'),
      { wrapper }
    )
    expect(result.current).toEqual({ applicable: false })
    expect(mockedIndex).not.toHaveBeenCalled()
    expect(mockedExact).not.toHaveBeenCalled()
  })

  it("reads the settled checkpoint from that date's own file — today's count never leaks", async () => {
    const { result } = renderHook(
      () => useClubGrowthRecipients(PY_2026, '2026-09-30'),
      { wrapper }
    )
    await waitFor(() => {
      expect(result.current.applicable && !result.current.isLoading).toBe(true)
    })
    if (!result.current.applicable) throw new Error('unreachable')
    const [sep, mar] = result.current.checkpoints
    expect(sep!.status).toBe('resolved')
    if (sep!.status !== 'resolved') throw new Error('unreachable')
    const d61 = sep!.recipients.find(r => r.districtId === '61')
    // TODAY says 12; the checkpoint said 5.
    expect(d61?.count).toBe(5)
    expect(sep!.asOfDate).toBe('2026-10-05')
    expect(mockedExact).toHaveBeenCalledWith('2026-09-30')
    expect(mockedFalling).not.toHaveBeenCalled()
    expect(mockedLatest).not.toHaveBeenCalled()
    // March has not happened: pending, with no recipients fabricated.
    expect(mar!.status).toBe('pending')
  })

  it('stays pending when the page is pinned before the checkpoint, even if the archive is past it (R3)', async () => {
    const { result } = renderHook(
      () => useClubGrowthRecipients(PY_2026, '2026-09-15'),
      { wrapper }
    )
    await waitFor(() => {
      expect(result.current.applicable && !result.current.isLoading).toBe(true)
    })
    if (!result.current.applicable) throw new Error('unreachable')
    expect(result.current.checkpoints.map(c => c.status)).toEqual([
      'pending',
      'pending',
    ])
    expect(mockedExact).not.toHaveBeenCalled()
  })

  it('reports a 404 checkpoint file as snapshot-missing, never as substituted numbers', async () => {
    mockedExact.mockResolvedValue(null)
    const { result } = renderHook(
      () => useClubGrowthRecipients(PY_2026, '2026-09-30'),
      { wrapper }
    )
    await waitFor(() => {
      expect(result.current.applicable && !result.current.isLoading).toBe(true)
    })
    if (!result.current.applicable) throw new Error('unreachable')
    const sep = result.current.checkpoints[0]!
    expect(sep.status).toBe('unavailable')
    expect(sep.status === 'unavailable' && sep.reason).toBe('snapshot-missing')
  })

  it('distinguishes count-absent (pre-#336 file) from count-not-collected (#1501)', async () => {
    mockedExact.mockResolvedValue(file('2026-09-30', [row('61'), row('42')]))
    const absent = renderHook(
      () => useClubGrowthRecipients(PY_2026, '2026-09-30'),
      { wrapper }
    )
    await waitFor(() => {
      const r = absent.result.current
      expect(r.applicable && r.checkpoints[0]!.status).toBe('unavailable')
    })
    const a = absent.result.current
    if (!a.applicable) throw new Error('unreachable')
    expect(
      a.checkpoints[0]!.status === 'unavailable' && a.checkpoints[0]!.reason
    ).toBe('count-absent')
    absent.unmount()

    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockedExact.mockResolvedValue(
      file(
        '2026-09-30',
        Array.from({ length: 60 }, (_, i) => row(String(i + 1), 0))
      )
    )
    const uncollected = renderHook(
      () => useClubGrowthRecipients(PY_2026, '2026-09-30'),
      { wrapper }
    )
    await waitFor(() => {
      const r = uncollected.result.current
      expect(r.applicable && r.checkpoints[0]!.status).toBe('unavailable')
    })
    const u = uncollected.result.current
    if (!u.applicable) throw new Error('unreachable')
    expect(
      u.checkpoints[0]!.status === 'unavailable' && u.checkpoints[0]!.reason
    ).toBe('count-not-collected')
  })
})
