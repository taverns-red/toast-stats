// RED stub (#2592): replaced in the next commit.
import type {
  EducationTimelineEntity,
  EducationTimelineEntityKind,
} from '@taverns-red/shared-contracts'

export interface UseEducationTimelineResult {
  timeline: EducationTimelineEntity | null
  isLoading: boolean
}

export function useEducationTimeline(
  _programYear: string,
  _kind: EducationTimelineEntityKind,
  _id: string | null
): UseEducationTimelineResult {
  return { timeline: null, isLoading: false }
}
