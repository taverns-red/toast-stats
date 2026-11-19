import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import { useDistrictRevisedAsOf } from '../useDistrictRevisedAsOf'
import { fetchCdnRevisionIndex } from '../../services/cdn'

vi.mock('../../services/cdn', () => ({
  fetchCdnRevisionIndex: vi.fn(),
}))
const mockedIndex = vi.mocked(fetchCdnRevisionIndex)

const INDEX: ReconciliationRevisionIndex = {
  schemaVersion: 1,
  monthEnd: '2026-10-31',
  dataMonth: '2026-10',
  revisions: [
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

describe('useDistrictRevisedAsOf (#2475)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIndex.mockResolvedValue(INDEX)
  })

  it('returns the revision date for a district on its month end', async () => {
    const { result } = renderHook(
      () => useDistrictRevisedAsOf('F', '2026-10-31'),
      { wrapper }
    )
    await waitFor(() => expect(result.current).toBe('2026-11-03'))
    expect(mockedIndex).toHaveBeenCalledWith('2026-10-31')
  })

  it('returns null for a district the revision does not hold', async () => {
    const { result } = renderHook(
      () => useDistrictRevisedAsOf('99', '2026-10-31'),
      { wrapper }
    )
    await waitFor(() => expect(mockedIndex).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('does not fetch when the viewed date is not a month end', () => {
    const { result } = renderHook(
      () => useDistrictRevisedAsOf('61', '2026-11-12'),
      { wrapper }
    )
    expect(result.current).toBeNull()
    expect(mockedIndex).not.toHaveBeenCalled()
  })

  it('does not fetch without a viewed date', () => {
    renderHook(() => useDistrictRevisedAsOf('61', undefined), { wrapper })
    expect(mockedIndex).not.toHaveBeenCalled()
  })
})
