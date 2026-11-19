import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import { useDistrictRevision } from '../useDistrictRevision'
import {
  fetchCdnRevisionIndex,
  fetchCdnSnapshotCollectionDate,
} from '../../services/cdn'

vi.mock('../../services/cdn', () => ({
  fetchCdnRevisionIndex: vi.fn(),
  fetchCdnSnapshotCollectionDate: vi.fn(),
}))
const mockedIndex = vi.mocked(fetchCdnRevisionIndex)
const mockedCollectionDate = vi.mocked(fetchCdnSnapshotCollectionDate)

const INDEX: ReconciliationRevisionIndex = {
  schemaVersion: 1,
  monthEnd: '2026-10-31',
  dataMonth: '2026-10',
  revisions: [
    {
      asOf: '2026-10-31',
      collectedAt: '2026-11-01T10:00:00.000Z',
      closing: false,
      successfulDistricts: ['61', 'F'],
    },
    {
      asOf: '2026-11-03',
      collectedAt: '2026-11-04T10:00:00.000Z',
      closing: true,
      successfulDistricts: ['61', 'F'],
    },
  ],
  final: null,
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useDistrictRevision (#2475)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIndex.mockResolvedValue(INDEX)
    mockedCollectionDate.mockResolvedValue('2026-11-03')
  })

  it("returns the district's revision link for the month end", async () => {
    const { result } = renderHook(
      () => useDistrictRevision('F', '2026-10-31'),
      { wrapper }
    )
    await waitFor(() =>
      expect(result.current).toEqual({
        revisedOn: '2026-11-03',
        from: '2026-10-31@2026-10-31',
        to: '2026-10-31',
      })
    )
    expect(mockedIndex).toHaveBeenCalledWith('2026-10-31')
    expect(mockedCollectionDate).toHaveBeenCalledWith('2026-10-31')
  })

  it('returns null for a district the revisions do not hold', async () => {
    const { result } = renderHook(
      () => useDistrictRevision('99', '2026-10-31'),
      { wrapper }
    )
    await waitFor(() => expect(mockedCollectionDate).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('fetches nothing without a month end', () => {
    const { result } = renderHook(() => useDistrictRevision('61', undefined), {
      wrapper,
    })
    expect(result.current).toBeNull()
    expect(mockedIndex).not.toHaveBeenCalled()
  })
})
