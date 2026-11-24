/**
 * useDistrictCachedDates when the index lands before latest.json (#3195): the
 * hook holds its data until the manifest settles, so no page reads the held
 * date and then flips.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDistrictCachedDates } from '../useDistrictData'
import { fetchCdnManifest } from '../../services/cdn'

vi.mock('../../services/cdn', () => ({
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({
    '61': ['2026-11-20', '2026-11-21', '2026-11-22'],
  }),
  fetchCdnManifest: vi.fn(),
}))

afterEach(() => cleanup())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useDistrictCachedDates before the manifest loads (#3195)', () => {
  it('holds the index until the manifest settles, then returns the capped list', async () => {
    let release: (v: {
      latestSnapshotDate: string
      generatedAt: string
    }) => void = () => {}
    vi.mocked(fetchCdnManifest).mockReturnValue(
      new Promise(resolve => {
        release = resolve
      })
    )
    const { result } = renderHook(() => useDistrictCachedDates('61'), {
      wrapper,
    })
    await new Promise(r => setTimeout(r, 50))
    expect(result.current.data).toBeUndefined()

    release({ latestSnapshotDate: '2026-11-21', generatedAt: 'x' })
    await waitFor(() =>
      expect(result.current.data?.dateRange?.endDate).toBe('2026-11-21')
    )
  })

  it('falls back to the whole index when the manifest cannot be read', async () => {
    vi.mocked(fetchCdnManifest).mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useDistrictCachedDates('61'), {
      wrapper,
    })
    await waitFor(() =>
      expect(result.current.data?.dateRange?.endDate).toBe('2026-11-22')
    )
  })
})
