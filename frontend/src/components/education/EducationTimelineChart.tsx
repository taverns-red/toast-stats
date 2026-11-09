// RED stub (#2592): replaced in the next commit.
import React from 'react'
import type { EducationTimelineEntity } from '@taverns-red/shared-contracts'
import type { TimelineMode } from '../../utils/educationTimelineBands'

export interface EducationTimelineChartProps {
  timeline: EducationTimelineEntity
  mode: TimelineMode
  /** The page's selected date: later points are left out (R3). */
  through?: string | undefined
  /** The KPI tiles' awards figure and the date they are as of. */
  tilesTotal: number
  tilesAsOf: string | null
  /** Notes printed under the legend (legacy / other award codes). */
  notes?: React.ReactNode
}

export const EducationTimelineChart: React.FC<
  EducationTimelineChartProps
> = () => null

export default EducationTimelineChart
