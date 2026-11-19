import { useQuery } from '@tanstack/react-query'
import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import {
  fetchCdnRevisionIndex,
  fetchCdnSnapshotCollectionDate,
} from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * A month end's reconciliation revision index and its `metadata.json`
 * collection date (#2475, #2814): the two reads `buildSnapshotPoints` takes.
 *
 * Shared by What Changed (`useRevisionPoints`) and the district header's
 * revised note, so both read the same cached queries and show the same date.
 *
 * `collectionDate` follows `buildSnapshotPoints`: undefined when the index has
 * no revisions (skip the alias check), null when the metadata is unreadable or
 * still loading (never alias on a guess).
 */
export function useMonthEndRevisions(monthEnd: SnapshotDate | undefined): {
  index: ReconciliationRevisionIndex | null | undefined
  collectionDate: string | null | undefined
  isLoading: boolean
} {
  const { data: index, isLoading } = useQuery({
    queryKey: ['reconciliation-revision-index', monthEnd],
    queryFn: () => fetchCdnRevisionIndex(monthEnd!),
    enabled: !!monthEnd,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const hasRevisions = !!index && index.revisions.length > 0
  const { data: collectionDate, isLoading: metaLoading } = useQuery({
    queryKey: ['reconciliation-month-end-collection-date', monthEnd],
    queryFn: () => fetchCdnSnapshotCollectionDate(monthEnd!),
    enabled: !!monthEnd && hasRevisions,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return {
    index,
    collectionDate: hasRevisions ? (collectionDate ?? null) : undefined,
    isLoading: isLoading || metaLoading,
  }
}
