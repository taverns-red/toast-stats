import React from 'react'
import type { WorldEducation } from '../utils/worldEducation'
import type { EducationTrendYear } from '../utils/educationTrend'

/* World Education page body (#1811) — stub: the failing tests come first. */
export interface WorldEducationViewProps {
  education: Extract<WorldEducation, { status: 'available' }>
  programYear: string
  trend: EducationTrendYear[]
}

export const WorldEducationView: React.FC<WorldEducationViewProps> = () => null

export default WorldEducationView
