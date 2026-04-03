import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordCdnResponse,
  getCdnCacheStats,
  resetCdnCacheStats,
  parseCacheStatus,
} from '../cdnCacheTracker'

function makeResponse(headers: Record<string, string>): Response {
  return { headers: new Headers(headers) } as unknown as Response
}

describe('CDN Cache Tracker (#255)', () => {
  beforeEach(() => {
    resetCdnCacheStats()
  })

  describe('parseCacheStatus', () => {
    it('should detect HIT from x-cache header', () => {
      expect(parseCacheStatus(new Headers({ 'x-cache': 'HIT' }))).toBe('hit')
    })

    it('should detect MISS from x-cache header', () => {
      expect(parseCacheStatus(new Headers({ 'x-cache': 'MISS' }))).toBe('miss')
    })

    it('should detect HIT from cf-cache-status (including REVALIDATED)', () => {
      expect(parseCacheStatus(new Headers({ 'cf-cache-status': 'HIT' }))).toBe(
        'hit'
      )
      expect(
        parseCacheStatus(new Headers({ 'cf-cache-status': 'REVALIDATED' }))
      ).toBe('hit')
    })

    it('should return null when no cache headers present', () => {
      expect(parseCacheStatus(new Headers({}))).toBeNull()
    })
  })

  describe('singleton state', () => {
    it('should start with zero stats', () => {
      const stats = getCdnCacheStats()
      expect(stats).toEqual({ hits: 0, misses: 0, total: 0, hitRatio: 0 })
    })

    it('should track hits and misses', () => {
      recordCdnResponse(makeResponse({ 'x-cache': 'HIT' }))
      recordCdnResponse(makeResponse({ 'x-cache': 'HIT' }))
      recordCdnResponse(makeResponse({ 'x-cache': 'MISS' }))

      const stats = getCdnCacheStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.total).toBe(3)
      expect(stats.hitRatio).toBeCloseTo(0.667, 2)
    })

    it('should ignore responses without cache headers', () => {
      recordCdnResponse(makeResponse({}))
      expect(getCdnCacheStats().total).toBe(0)
    })

    it('should reset stats', () => {
      recordCdnResponse(makeResponse({ 'x-cache': 'HIT' }))
      resetCdnCacheStats()
      expect(getCdnCacheStats().total).toBe(0)
    })

    it('should persist across multiple calls (singleton)', () => {
      recordCdnResponse(makeResponse({ 'x-cache': 'HIT' }))
      // Simulate a "different module" calling the same singleton
      recordCdnResponse(makeResponse({ 'x-cache': 'MISS' }))
      expect(getCdnCacheStats().total).toBe(2)
    })
  })
})
