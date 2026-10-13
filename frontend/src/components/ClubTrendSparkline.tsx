import React, { useMemo } from 'react'
import { Sparkline } from './Sparkline'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'

/** Intrinsic size of the per-row trend (#1792): 60×16, the cheapest trend a
 *  375 px row can carry (mobile review §6.5). */
export const CLUB_TREND_WIDTH = 60
export const CLUB_TREND_HEIGHT = 16

/** A signed count with a true minus sign; ±0 for no change. */
export function formatSignedNet(net: number): string {
  if (net > 0) return `+${net}`
  if (net < 0) return `−${Math.abs(net)}`
  return '±0'
}

type TrendInput = Pick<ClubTrend, 'membershipTrend' | 'membershipBase'>

/**
 * The accessible name for a club's membership trend: base → current and the
 * signed net change (Lesson 102 — a signed delta, never a clamped gap). With
 * no recorded base there is no delta to report, so none is invented.
 */
export function describeMembershipTrend(club: TrendInput): string {
  const trend = club.membershipTrend
  const current = trend[trend.length - 1]?.count ?? 0
  if (club.membershipBase == null) {
    return `Membership now ${current}, no base recorded`
  }
  return `Membership ${club.membershipBase} → ${current} this program year, net ${formatSignedNet(
    current - club.membershipBase
  )}`
}

/**
 * Per-club membership sparkline for the Clubs table and its phone rows
 * (#1792). Reads the PYTD series the page already holds
 * (`analytics.allClubs[].membershipTrend`), anchored at `membershipBase` —
 * no fetch of its own. The plot is
 * the dependency-free `Sparkline` (flat series → midline, never inverted).
 */
export const ClubTrendSparkline: React.FC<{ club: TrendInput }> = ({
  club,
}) => {
  // The line starts at the program-year base when there is one: TI's July
  // counts restart below it, so the series alone can rise while the club is
  // down on its base — the shape would contradict the net beside it.
  const data = useMemo(() => {
    const counts = club.membershipTrend.map(p => p.count)
    return club.membershipBase == null
      ? counts
      : [club.membershipBase, ...counts]
  }, [club.membershipTrend, club.membershipBase])
  return (
    <Sparkline
      data={data}
      width={CLUB_TREND_WIDTH}
      height={CLUB_TREND_HEIGHT}
      ariaLabel={describeMembershipTrend(club)}
      className="club-trend-sparkline"
    />
  )
}

export default ClubTrendSparkline
