/**
 * useDistrictCachedDates when latest.json stalls (#3195): the hook waits for
 * the manifest, so a fetch that never answers must time out into an error and
 * the hook must fall back to the whole index instead of holding a skeleton.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDistrictCachedDates } from '../useDistrictData'
import { resetCdnManifestCache } from '../../services/cdn'

const INDEX = {
  generatedAt: '2026-11-23T00:00:00Z',
  districts: { '61': ['2026-11-20', '2026-11-21', '2026-11-22'] },
}

let manifestCalls = 0

beforeEach(() => {
  resetCdnManifestCache()
  manifestCalls = 0
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL, init?: { signal?: AbortSignal | null }) => {
      const url = String(input)
      if (url.endsWith('/config/district-snapshot-index.json')) {
        return Promise.resolve(
          new Response(JSON.stringify(INDEX), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      }
      manifestCalls += 1
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        )
      })
    })
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useDistrictCachedDates when latest.json stalls (#3195)', () => {
  it('falls back to the whole index once the manifest read times out', async () => {
    const { result } = renderHook(() => useDistrictCachedDates('61'), {
      wrapper,
    })
    await vi.waitFor(() => expect(manifestCalls).toBe(1))
    expect(result.current.data).toBeUndefined()

    await vi.advanceTimersByTimeAsync(5000)
    await vi.waitFor(() =>
      expect(result.current.data?.dateRange?.endDate).toBe('2026-11-22')
    )
  })
})
