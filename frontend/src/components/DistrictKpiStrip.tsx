import React from 'react'
import type { MetricRankings, RecognitionTargets } from '../types/districts'

/* #572 — sticky KPI strip. Stub: implementation lands in the green
   commit. The shape below is the contract the strip exposes to
   DistrictDetailPage (and to its tests). */

export interface DistrictKpiCardData {
  current: number
  targets: RecognitionTargets | null
  rankings: MetricRankings
}

export interface DistrictKpiStripData {
  paidClubs: DistrictKpiCardData
  membershipPayments: DistrictKpiCardData
  distinguishedClubs: DistrictKpiCardData
}

export interface DistrictKpiStripProps {
  kpis: DistrictKpiStripData | null
}

export const DistrictKpiStrip: React.FC<DistrictKpiStripProps> = () => {
  return null
}
