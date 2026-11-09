/** Stub (red): the real contract lands in the next commit (#2591). */
import { z } from 'zod'

export const EDUCATION_TIMELINE_VERSION = '1.0.0'
export const EDUCATION_TIMELINE_PREFIX = 'derived/education-timeline'

export interface EducationTimelinePoint {
  date: string
  levels: [number, number, number, number, number]
  dtm: number
  legacy: number
  other: number
  byPath: Record<string, number>
}
export type EducationTimelineAggregatePoint = EducationTimelinePoint & {
  districts: number
}
export interface EducationTimelineGhostPoint {
  at: string
  total: number
}
export interface EducationTimeline {
  _format: { version: '1.0.0'; type: 'education-timeline' }
  programYear: string
  asOf: string
  dates: string[]
  world: EducationTimelineAggregatePoint[]
  regions: Record<string, EducationTimelineAggregatePoint[]> | null
  districts: Record<string, EducationTimelinePoint[]>
  prior: {
    programYear: string
    source: 'reports' | 'ledger-history' | 'timeline'
    grain: 'day' | 'month'
    world: EducationTimelineGhostPoint[]
    regions: Record<string, EducationTimelineGhostPoint[]> | null
    districts: Record<string, EducationTimelineGhostPoint[]>
  } | null
}

export const EducationTimelineSchema = z.never()

export function educationTimelineObjectPath(_programYear: string): string {
  throw new Error('not implemented')
}
