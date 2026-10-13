import { useMemo } from 'react'
import { useClubHistory } from '../../hooks/useClubHistory'
import { clubPriorYearTrends } from '../../utils/clubPriorYearTrends'
import type { TrendPoint } from '../membershipTrendChartData'
import { ClubMembershipTrendChart } from './ClubMembershipTrendChart'

/**
 * #1791 — the club page's membership trend with its earlier program years.
 *
 * The prior years come from the club's year-end history (`useClubHistory`,
 * the same query as the routed `/history` subpage, so either page warms the
 * other's cache). The read lives HERE, not on the page, so it starts only
 * where the chart mounts: inline from 768, and on phones only once the
 * expand sheet opens (`ChartSparklineExpand` mounts its children there). The
 * first screen never waits on it; until it lands the current year draws
 * alone.
 */
export function ClubMembershipTrend({
  districtId,
  clubId,
  current,
  programYearLabel,
}: {
  districtId: string
  clubId: string
  /** The page program year's points (R3). */
  current: TrendPoint[]
  /** The page's program year, e.g. "2026-2027" (R3). */
  programYearLabel: string
}) {
  const { rows } = useClubHistory(districtId, clubId)
  const priors = useMemo(
    () => clubPriorYearTrends(rows, programYearLabel),
    [rows, programYearLabel]
  )
  return (
    <ClubMembershipTrendChart
      current={current}
      priors={priors}
      programYearLabel={programYearLabel}
    />
  )
}
