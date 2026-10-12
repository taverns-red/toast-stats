import React from 'react'
import type { DistrictKpiStripData } from './DistrictKpiStrip'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import type { RecognitionTargets } from '../types/districts'

export interface DistrictOverviewHubProps {
  districtId: string
  programYear: string
  snapshotDate: string | undefined
  kpis: DistrictKpiStripData | null
  clubs: ClubTrend[] | null
  interventionClubs: ClubTrend[] | null
}

export function nextTierText(
  _current: number,
  _targets: RecognitionTargets | null
): string | null {
  return null
}

export const DistrictOverviewHub: React.FC<DistrictOverviewHubProps> = () =>
  null
