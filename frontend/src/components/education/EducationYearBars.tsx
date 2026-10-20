import React from 'react'
import type { EducationTrendYear } from '../../utils/educationTrend'

export interface EducationYearBarsProps {
  years: EducationTrendYear[]
  programYear: string
  note: React.ReactNode
}

// Red stub (#1807): implemented in the next commit.
export const EducationYearBars: React.FC<EducationYearBarsProps> = () => null
