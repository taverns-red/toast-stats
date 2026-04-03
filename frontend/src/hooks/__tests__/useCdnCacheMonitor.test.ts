import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCdnCacheMonitor, parseCacheStatus } from '../useCdnCacheMonitor'
import { resetCdnCacheStats } from '../../services/cdnCacheTracker'

function makeHeaders(headers: Record<string, string>): Headers {
  return new Headers(headers)
}

function makeResponse(headers: Record<string, string>): Response {
  return {
    headers: makeHeaders(headers),
  } as unknown as Response
}

describe('CDN Cache Monitor (#224)', () => {
  describe('parseCacheStatus', () => {
    it('should detect HIT from x-cache header', () => {
      expect(parseCacheStatus(makeHeaders({ 'x-cache': 'HIT' }))).toBe('hit')
      expect(
        parseCacheStatus(makeHeaders({ 'x-cache': 'Hit from cloudfront' }))
      ).toBe('hit')
    })

    it('should detect MISS from x-cache header', () => {
      expect(parseCacheStatus(makeHeaders({ 'x-cache': 'MISS' }))).toBe('miss')
    })

    it('should detect HIT from cf-cache-status header', () => {
      expect(parseCacheStatus(makeHeaders({ 'cf-cache-status': 'HIT' }))).toBe(
        'hit'
      )
      expect(
        parseCacheStatus(makeHeaders({ 'cf-cache-status': 'REVALIDATED' }))
      ).toBe('hit')
    })

    it('should detect MISS from cf-cache-status header', () => {
      expect(parseCacheStatus(makeHeaders({ 'cf-cache-status': 'MISS' }))).toBe(
        'miss'
      )
      expect(
        parseCacheStatus(makeHeaders({ 'cf-cache-status': 'DYNAMIC' }))
      ).toBe('miss')
    })

    it('should return null when no cache headers present', () => {
      expect(parseCacheStatus(makeHeaders({}))).toBeNull()
    })
  })

  describe('useCdnCacheMonitor', () => {
    beforeEach(() => {
      resetCdnCacheStats()
    })

    it('should start with zero stats', () => {
      const { result } = renderHook(() => useCdnCacheMonitor())
      const stats = result.current.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.total).toBe(0)
      expect(stats.hitRatio).toBe(0)
    })

    it('should track cache hits', () => {
      const { result } = renderHook(() => useCdnCacheMonitor())

      act(() => {
        result.current.recordResponse(makeResponse({ 'x-cache': 'HIT' }))
        result.current.recordResponse(makeResponse({ 'x-cache': 'HIT' }))
      })

      const stats = result.current.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(0)
      expect(stats.hitRatio).toBe(1)
    })

    it('should track cache misses', () => {
      const { result } = renderHook(() => useCdnCacheMonitor())

      act(() => {
        result.current.recordResponse(makeResponse({ 'x-cache': 'MISS' }))
      })

      expect(result.current.getStats().misses).toBe(1)
    })

    it('should calculate correct hit ratio', () => {
      const { result } = renderHook(() => useCdnCacheMonitor())

      act(() => {
        result.current.recordResponse(makeResponse({ 'x-cache': 'HIT' }))
        result.current.recordResponse(makeResponse({ 'x-cache': 'HIT' }))
        result.current.recordResponse(makeResponse({ 'x-cache': 'HIT' }))
        result.current.recordResponse(makeResponse({ 'x-cache': 'MISS' }))
      })

      const stats = result.current.getStats()
      expect(stats.hitRatio).toBe(0.75)
    })

    it('should ignore responses without cache headers', () => {
      const { result } = renderHook(() => useCdnCacheMonitor())

      act(() => {
        result.current.recordResponse(makeResponse({}))
      })

      expect(result.current.getStats().total).toBe(0)
    })

    it('should reset stats', () => {
      const { result } = renderHook(() => useCdnCacheMonitor())

      act(() => {
        result.current.recordResponse(makeResponse({ 'x-cache': 'HIT' }))
        result.current.reset()
      })

      expect(result.current.getStats().total).toBe(0)
    })

    it('should warn in dev when MISS ratio exceeds 50%', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { result } = renderHook(() => useCdnCacheMonitor())

      act(() => {
        // 1 hit, 5 misses = 83% miss rate
        result.current.recordResponse(makeResponse({ 'x-cache': 'HIT' }))
        for (let i = 0; i < 5; i++) {
          result.current.recordResponse(makeResponse({ 'x-cache': 'MISS' }))
        }
      })

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CDN Cache] High MISS ratio')
      )

      warnSpy.mockRestore()
    })
  })
})
