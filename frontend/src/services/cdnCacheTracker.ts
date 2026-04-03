/**
 * CDN Cache Tracker — Module-level singleton (#255)
 *
 * Tracks CDN cache HIT/MISS ratios from fetch response headers.
 * Called by fetchFromCdn() to record every CDN response.
 *
 * Monitors headers: x-cache, cf-cache-status, x-goog-cache-control
 */

export interface CacheStats {
  hits: number
  misses: number
  total: number
  hitRatio: number
}

// Module-level singleton state
let hits = 0
let misses = 0

/**
 * Parse cache status from common CDN response headers.
 * Returns 'hit', 'miss', or null if no cache header found.
 */
export function parseCacheStatus(headers: Headers): 'hit' | 'miss' | null {
  const xCache = headers.get('x-cache')
  if (xCache) {
    return xCache.toLowerCase().includes('hit') ? 'hit' : 'miss'
  }

  const cfCache = headers.get('cf-cache-status')
  if (cfCache) {
    const status = cfCache.toLowerCase()
    return status === 'hit' || status === 'revalidated' ? 'hit' : 'miss'
  }

  const googCache = headers.get('x-goog-cache-control')
  if (googCache) {
    return googCache.toLowerCase().includes('hit') ? 'hit' : 'miss'
  }

  return null
}

/**
 * Record a CDN fetch response for cache tracking.
 * Call after every successful CDN fetch.
 */
export function recordCdnResponse(response: Response): void {
  const status = parseCacheStatus(response.headers)
  if (status === null) return

  if (status === 'hit') {
    hits++
  } else {
    misses++
  }

  // Dev-only: warn when MISS ratio exceeds 50% after enough requests
  if (import.meta.env.DEV) {
    const total = hits + misses
    if (total >= 5) {
      const missRatio = misses / total
      if (missRatio > 0.5) {
        console.warn(
          `[CDN Cache] High MISS ratio: ${(missRatio * 100).toFixed(0)}% (${misses}/${total})`
        )
      }
    }
  }
}

/** Get current cache stats. */
export function getCdnCacheStats(): CacheStats {
  const total = hits + misses
  return {
    hits,
    misses,
    total,
    hitRatio: total > 0 ? hits / total : 0,
  }
}

/** Reset all cache stats. */
export function resetCdnCacheStats(): void {
  hits = 0
  misses = 0
}
