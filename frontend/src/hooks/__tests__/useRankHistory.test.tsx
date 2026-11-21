/**
 * useRankHistory: only a real 404 means "no history for this district".
 * Any other failure must surface as an error so the query retries and callers
 * can tell a missing district from a failed fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankHistory: vi.fn(),
}))

import { fetchCdnRankHistory } from '../../services/cdn'
import { useRankHistory } from '../useRankHistory'

const mockedFetch = vi.mocked(fetchCdnRankHistory)

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  })
  return React.createElement(QueryClientProvider, { client }, children)
}

const useDistrict999 = () => useRankHistory({ districtIds: ['999'] })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRankHistory failures', () => {
  it('resolves an empty history for a 404', async () => {
    mockedFetch.mockRejectedValue(
      new Error('CDN fetch failed: 404 for https://cdn.test/999.json')
    )
    const { result } = renderHook(useDistrict999, { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]?.history).toEqual([])
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('errors, after retrying, for a 503', async () => {
    mockedFetch.mockRejectedValue(
      new Error('CDN fetch failed: 503 for https://cdn.test/999.json')
    )
    const { result } = renderHook(useDistrict999, { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockedFetch).toHaveBeenCalledTimes(3)
  })

  it('errors for a network failure', async () => {
    mockedFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(useDistrict999, { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
