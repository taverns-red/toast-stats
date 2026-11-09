// RED stub (#2592): replaced in the next commit.
import React from 'react'
import type { EducationTimelineEntityKind } from '@taverns-red/shared-contracts'
import type { EducationSummary } from '../../utils/districtEducation'

export interface EducationTimelineSectionProps {
  /** The page's selected PY label (R3), e.g. `2026-2027`. */
  programYear: string
  kind: EducationTimelineEntityKind
  id: string | null
  /** The page's selected date, when it has one (the district page). */
  through?: string | null | undefined
  /** The KPI tiles' awards figure and the date they are as of. */
  tilesTotal: number
  tilesAsOf: string | null
  /** The program breakdown: the bar's legend, kept when there is no chart. */
  summary: EducationSummary
}

export const EducationTimelineSection: React.FC<
  EducationTimelineSectionProps
> = () => null

export default EducationTimelineSection
