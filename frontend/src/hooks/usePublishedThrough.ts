import { queryOptions, useQuery } from '@tanstack/react-query'
import { fetchCdnManifest, type CdnManifest } from '../services/cdn'
import {
  snapshotDateFromManifest,
  type SnapshotDate,
} from '../types/snapshotDate'

/**
 * The `['cdn-manifest']` entry (`v1/latest.json`), shared by the date hooks,
 * the club-route prefetch and the club page so they all hit one cache entry.
 * `fetchCdnManifest` is module-cached, so reading it adds no request.
 */
export function manifestQueryOptions() {
  return queryOptions<CdnManifest, Error>({
    queryKey: ['cdn-manifest'],
    queryFn: () => fetchCdnManifest(),
    staleTime: 15 * 60 * 1000,
    retry: false,
  })
}

/**
 * The newest date whose reports are in prod (#3195). A manifest that cannot
 * be read leaves it undefined, and a page falls back to the index.
 */
export function usePublishedThrough(enabled = true): {
  publishedThrough: SnapshotDate | undefined
  /** The read finished, with a date or an error (or was not asked for). */
  isSettled: boolean
} {
  const { data, status } = useQuery({ ...manifestQueryOptions(), enabled })
  return {
    publishedThrough: snapshotDateFromManifest(data),
    isSettled: !enabled || status !== 'pending',
  }
}
