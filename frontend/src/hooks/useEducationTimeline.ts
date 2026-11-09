/**
 * One entity's education timeline for one program year (#2592, data from
 * #2591): the cumulative levels / paths series behind the Education pages'
 * chart, plus its prior-year ghost.
 *
 * The page passes its own selected PY label (R3); this never reads a PY out
 * of a response. The rollup index lists a timeline row per PY (#2593): with
 * no row there is nothing to fetch (`listed: false`), so the page shows a
 * compact "not available" state without a request or a reserved block. An
 * absent file behind a listed row is `timeline: null` ("not available yet"),
 * not an error -- the reader resolves 404, drift and network errors to null.
 */
import { useQuery } from '@tanstack/react-query'
import type {
  EducationTimelineEntity,
  EducationTimelineEntityKind,
} from '@taverns-red/shared-contracts'
import { fetchCdnEducationTimeline } from '../services/cdn'
import { useEducationRollupIndex } from './useEducationRollup'

const STALE = 5 * 60 * 1000
const GC = 10 * 60 * 1000

export interface UseEducationTimelineResult {
  timeline: EducationTimelineEntity | null
  /** Waiting on the index, or on the file of a listed PY. */
  isLoading: boolean
  /** The index names a timeline for this PY. */
  listed: boolean
}

export function useEducationTimeline(
  programYear: string,
  kind: EducationTimelineEntityKind,
  id: string | null
): UseEducationTimelineResult {
  const { index, isLoading: indexLoading } = useEducationRollupIndex()
  const listed =
    index?.timelines?.some(t => t.programYear === programYear) ?? false
  const q = useQuery({
    queryKey: ['education-timeline', programYear, kind, id] as const,
    queryFn: () => fetchCdnEducationTimeline(programYear, kind, id),
    enabled: listed,
    staleTime: STALE,
    gcTime: GC,
  })
  return {
    timeline: q.data ?? null,
    isLoading: indexLoading || (listed && q.isLoading),
    listed,
  }
}
