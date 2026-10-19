import React from 'react'
import type { ClubHealthStatus } from '../../hooks/useDistrictAnalytics'

export interface ClubHeroStatusChipsProps {
  status: ClubHealthStatus
  distinguishedLevel?: string | undefined
  provisionalTitle?: string | undefined
}

export const ClubHeroStatusChips: React.FC<ClubHeroStatusChipsProps> = () =>
  null
