// RED stub (#2592): replaced in the next commit.
import type {
  EducationTimelineAggregatePoint,
  EducationTimelineEntity,
  EducationTimelinePoint,
} from '@taverns-red/shared-contracts'

export type TimelineMode = 'level' | 'path'
export type TimelineSourcePoint =
  EducationTimelinePoint | EducationTimelineAggregatePoint
export type TimelinePrior = EducationTimelineEntity['prior']

export interface TimelineBand {
  /** The chart's dataKey. */
  key: string
  label: string
  /** Colour hook (`edu-tl--<colour>` in the stylesheet): follows the entity. */
  colour: string
}

export interface TimelineRow {
  date: string
  total: number
  ghost: number | null
  values: Record<string, number>
}

export interface DerivedTimeline {
  bands: TimelineBand[]
  rows: TimelineRow[]
}

export function deriveTimeline(_args: {
  points: readonly TimelineSourcePoint[]
  mode: TimelineMode
  prior: TimelinePrior
  through?: string | undefined
}): DerivedTimeline {
  return { bands: [], rows: [] }
}

export function alignToPriorYear(
  _date: string,
  _priorProgramYear: string
): string {
  return ''
}

export function priorGhostAt(
  _prior: NonNullable<TimelinePrior>,
  _date: string
): number | null {
  return null
}
