/**
 * CDN Cache Monitor Hook (#224, #255)
 *
 * React-friendly wrapper around the cdnCacheTracker singleton.
 * The singleton is automatically fed by fetchFromCdn() in cdn.ts,
 * so this hook only needs to expose stats for UI consumption.
 *
 * For non-React contexts, import directly from cdnCacheTracker.
 */

import { useCallback } from 'react'
import {
  recordCdnResponse,
  getCdnCacheStats,
  resetCdnCacheStats,
  parseCacheStatus,
} from '../services/cdnCacheTracker'
import type { CacheStats } from '../services/cdnCacheTracker'

export type { CacheStats }
export { parseCacheStatus }

/**
 * Hook that exposes CDN cache stats from the global tracker.
 *
 * Since fetchFromCdn() already calls recordCdnResponse() on every fetch,
 * this hook primarily provides getStats() and reset() for UI components.
 * The recordResponse() method is kept for backward compatibility.
 */
export function useCdnCacheMonitor() {
  const recordResponse = useCallback((response: Response) => {
    recordCdnResponse(response)
  }, [])

  const getStats = useCallback((): CacheStats => {
    return getCdnCacheStats()
  }, [])

  const reset = useCallback(() => {
    resetCdnCacheStats()
  }, [])

  return { recordResponse, getStats, reset }
}
