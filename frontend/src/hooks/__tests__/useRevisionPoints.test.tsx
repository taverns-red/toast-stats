import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import { useRevisionPoints } from '../useRevisionPoints'
import { fetchCdnRevisionIndex } from '../../services/cdn'
import { pointToken } from '../../utils/snapshotPoints'
import { snap } from '../../test-utils/snapshotDate'

vi.mock('../../services/cdn', () => ({ fetchCdnRevisionIndex: vi.fn() }))
const mockedIndex = vi.mocked(fetchCdnRevisionIndex)

/* #2475 — the hook reads ONE small index: the most recent month end in the
   district's dated list. Month ends before it are final and were reconciled
   before this feature existed (no index: a 404), so probing them is waste. */

const DATES = ['2026-09-30', '2026-10-30', '2026-10-31', '2026-11-12'].map(snap)

const INDEX: ReconciliationRevisionIndex = {
  schemaVersion: 1,
  monthEnd: '2026-10-31',
  dataMonth: '2026-10',
  revisions: [
    {
      asOf: '2026-11-02',
      collectedAt: '2026-11-03T10:00:00.000Z',
      closing: true,
      successfulDistricts: ['61'],
    },
    {
      asOf: '2026-11-03',
      collectedAt: '2026-11-04T10:00:00.000Z',
      closing: true,
      successfulDistricts: ['61'],
    },
  ],
  final: null,
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useRevisionPoints', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for the latest month end only and lists its earlier revisions', async () => {
    mockedIndex.mockResolvedValue(INDEX)
    const { result } = renderHook(() => useRevisionPoints('61', DATES), {
      wrapper,
    })
    await waitFor(() =>
      expect(result.current.points.map(pointToken)).toContain(
        '2026-10-31@2026-11-02'
      )
    )
    expect(mockedIndex).toHaveBeenCalledTimes(1)
    expect(mockedIndex).toHaveBeenCalledWith('2026-10-31')
  })

  it('is the dated list unchanged when there is no index', async () => {
    mockedIndex.mockResolvedValue(null)
    const { result } = renderHook(() => useRevisionPoints('61', DATES), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.points.map(pointToken)).toEqual(DATES)
  })

  it('is the dated list unchanged when the index fetch fails', async () => {
    mockedIndex.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useRevisionPoints('61', DATES), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.points.map(pointToken)).toEqual(DATES)
  })

  it('fetches nothing for a district with no month-end snapshot', () => {
    renderHook(() => useRevisionPoints('61', [snap('2026-11-12')]), {
      wrapper,
    })
    expect(mockedIndex).not.toHaveBeenCalled()
  })
})
