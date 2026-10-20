/* Moved-region banner (#1821) — stub for the red commit. */
import React from 'react'
import type { DistrictRegionHistory } from '@taverns-red/shared-contracts'

export interface DistrictRegionMoveBannerProps {
  districtId: string
  programYear: string
  history: DistrictRegionHistory | null | undefined
}

export const DistrictRegionMoveBanner: React.FC<
  DistrictRegionMoveBannerProps
> = () => null
