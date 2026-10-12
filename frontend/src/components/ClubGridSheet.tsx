import React from 'react'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'

export interface ClubGridSheetProps {
  club: ClubTrend | null
  districtId: string
  onClose: () => void
}

// #1845 red-phase stub: the sheet is implemented in the green commit.
export const ClubGridSheet: React.FC<ClubGridSheetProps> = () => null

export default ClubGridSheet
