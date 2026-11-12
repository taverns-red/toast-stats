/**
 * TierCell (#2676, Clubs table spec §3.2).
 *
 * Distinguished tier as plain text in normal ink: no pill, fill, stripe or
 * tooltip-only meaning. A provisional tier (qualifies today, not yet confirmed
 * by April renewals) shows the tier name with the word "provisional" spelled
 * out on a second line. A club with no tier shows a dash with an sr-only
 * "Not distinguished".
 */

import React from 'react'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'

type Level = ClubTrend['distinguishedLevel']

const TIER_LABEL: Record<Exclude<Level, 'NotDistinguished'>, string> = {
  Distinguished: 'Distinguished',
  Select: 'Select',
  President: "President's",
  Smedley: 'Smedley',
}

interface TierCellProps {
  level: Level
  provisional: boolean
}

export const TierCell: React.FC<TierCellProps> = ({ level, provisional }) => {
  if (level === 'NotDistinguished') {
    return (
      <span className="dt-tier dt-tier--none">
        <span aria-hidden="true">{'—'}</span>
        <span className="sr-only">Not distinguished</span>
      </span>
    )
  }
  return (
    <span className="dt-tier">
      <span className="dt-tier__name">{TIER_LABEL[level]}</span>
      {provisional && (
        <span className="dt-tier__provisional">
          <span className="sr-only">, </span>
          provisional
        </span>
      )}
    </span>
  )
}

export default TierCell
