import { useQuery } from '@tanstack/react-query'
import { fetchCdnManifest } from '../services/cdn'
import {
  snapshotDateFromManifest,
  type SnapshotDate,
} from '../types/snapshotDate'

/**
 * The newest date whose reports are in prod: `v1/latest.json` (#3195).
 *
 * Shares `useLatestAsOfDate`'s `['cdn-manifest']` entry, and `fetchCdnManifest`
 * is module-cached, so this adds no request. A manifest that cannot be read
 * leaves the result undefined, and a page falls back to the index.
 */
export function usePublishedThrough(enabled = true): {
  publishedThrough: SnapshotDate | undefined
} {
  const { data } = useQuery({
    queryKey: ['cdn-manifest'],
    queryFn: () => fetchCdnManifest(),
    staleTime: 15 * 60 * 1000,
    retry: false,
    enabled,
  })
  return { publishedThrough: snapshotDateFromManifest(data) }
}
