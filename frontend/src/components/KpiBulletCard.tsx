import React from 'react'
import type { MetricRankings, RecognitionTargets } from '../types/districts'

export interface KpiBulletCardProps {
  title: string
  current: number
  rankings: MetricRankings
  targets: RecognitionTargets | null
  tooltipContent?: string
  barAriaLabel?: string
}

/**
 * KpiBulletCard — #550 District Overview redesign
 *
 * STUB (TDD red): tests in __tests__/KpiBulletCard.test.tsx assert this
 * component's contract. Green commit follows.
 */
export const KpiBulletCard: React.FC<KpiBulletCardProps> = () => {
  return null
}

export default KpiBulletCard
