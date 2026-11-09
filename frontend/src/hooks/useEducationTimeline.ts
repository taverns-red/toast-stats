/**
 * One entity's education timeline for one program year (#2592, data from
 * #2591): the cumulative levels / paths series behind the Education pages'
 * chart, plus its prior-year ghost.
 *
 * The page passes its own selected PY label (R3); this never reads a PY out
 * of a response. An absent file is `timeline: null` ("not available yet"),
 * not an error -- the reader resolves 404, drift and network errors to null.
 */
import { useQuery } from '@tanstack/react-query'
import type {
  EducationTimelineEntity,
  EducationTimelineEntityKind,
} from '@taverns-red/shared-contracts'
import { fetchCdnEducationTimeline } from '../services/cdn'

const STALE = 5 * 60 * 1000
const GC = 10 * 60 * 1000

export interface UseEducationTimelineResult {
  timeline: EducationTimelineEntity | null
  isLoading: boolean
}

export function useEducationTimeline(
  programYear: string,
  kind: EducationTimelineEntityKind,
  id: string | null
): UseEducationTimelineResult {
  const q = useQuery({
    queryKey: ['education-timeline', programYear, kind, id] as const,
    queryFn: () => fetchCdnEducationTimeline(programYear, kind, id),
    staleTime: STALE,
    gcTime: GC,
  })
  return { timeline: q.data ?? null, isLoading: q.isLoading }
}
