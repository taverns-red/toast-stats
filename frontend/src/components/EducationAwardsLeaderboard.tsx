import React from 'react'
import type { EducationAwardRanking } from '../utils/educationAwardRankings'

export interface EducationAwardsLeaderboardProps {
  rankings: {
    awardsPerBase: EducationAwardRanking
    membersWithAward: EducationAwardRanking
  }
  districtId: string
}

export const EducationAwardsLeaderboard: React.FC<
  EducationAwardsLeaderboardProps
> = () => null

export default EducationAwardsLeaderboard
