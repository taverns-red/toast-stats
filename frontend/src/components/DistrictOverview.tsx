import React from 'react'
import { Link } from 'react-router-dom'
import { isCspRequired } from '@taverns-red/analytics-core'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useDistrictRanking } from '../hooks/useDistrictRanking'
import type { DistrictPerformanceTargets } from '../hooks/useDistrictAnalytics'
import { summarizeCspCompletion } from '../utils/cspCompletion'
import { LoadingSkeleton } from './LoadingSkeleton'
import { ErrorDisplay, EmptyState } from './ErrorDisplay'
import DistinguishedCompositionBar from './DistinguishedCompositionBar'
import PaymentComposition from './PaymentComposition'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * The one-line Club Success Plan summary under the overview header (#1555,
 * spec §6.3). Counts ACTIVE clubs only — numerator and denominator — so the
 * number a user clicks equals the badge on the action-list section it lands
 * on (#1561 review). Suspended/ineligible clubs without a plan are named in
 * the action list's own footnote voice (`footnote`); an ineligible club that
 * has filed leaves the denominator too. Clubs with no CSP value on a tracked
 * year are excluded from both numbers and named in a suffix (spec E2).
 * Returns null when nothing can be said.
 */
function cspLine(clubs: Parameters<typeof summarizeCspCompletion>[0]): {
  text: string
  showLink: boolean
  footnote: string | null
} | null {
  const csp = summarizeCspCompletion(clubs)
  const notSubmitted = csp.notSubmitted.length
  const known = csp.submittedCount - csp.submittedIneligibleCount + notSubmitted
  if (known === 0) return null
  const unknownSuffix =
    csp.unknownCount > 0
      ? ` (${csp.unknownCount} club${csp.unknownCount === 1 ? '' : 's'} with no CSP data)`
      : ''
  const inel = csp.notSubmittedIneligible.length
  const footnote =
    inel === 0
      ? null
      : inel === 1
        ? '1 suspended/ineligible club without a plan is not counted.'
        : `${inel} suspended/ineligible clubs without a plan are not counted.`
  if (notSubmitted === 0) {
    return {
      text: `Every club has submitted its Club Success Plan.${unknownSuffix}`,
      showLink: false,
      footnote,
    }
  }
  const pct = Math.round((notSubmitted / known) * 100)
  const verb = notSubmitted === 1 ? 'has' : 'have'
  return {
    text:
      `${notSubmitted} of ${known} active clubs (${pct}%) ${verb} not submitted a Club Success Plan` +
      ` — required for any Distinguished level this year.${unknownSuffix}`,
    showLink: true,
    footnote,
  }
}

interface DistrictOverviewProps {
  districtId: string
  /**
   * Program year label ("YYYY-YYYY") of the snapshot being displayed — the
   * same value the page passes to the trophy case and growth card. Gates the
   * Club Success Plan line (#1555): the rows cannot say whether a plan was
   * required that year (pre-2025-26 rows read as submitted), so the year
   * must come from the page (R3), never from `allClubs`.
   */
  programYear: string
  /**
   * The snapshot being displayed. Explicitly `| undefined` so the parent can
   * pass it unconditionally: a `{...(date && { selectedDate })}` spread would
   * advertise an undated render path, and undated is how the payment card came
   * to show the wrong program year (#1396).
   */
  selectedDate?: SnapshotDate | undefined
  programYearStartDate?: string
  /**
   * Pre-fetched performance targets from the usePerformanceTargets hook.
   * Currently consumed only for the future-proofed prop signature
   * (#572 moved the KPI cards out into DistrictKpiStrip, but the
   * targets are still authoritative for downstream consumers).
   */
  performanceTargets?: DistrictPerformanceTargets | undefined
}

export const DistrictOverview: React.FC<DistrictOverviewProps> = ({
  districtId,
  programYear,
  selectedDate,
  programYearStartDate,
}) => {
  const {
    data: analytics,
    isLoading,
    error,
  } = useDistrictAnalytics(districtId, programYearStartDate, selectedDate)

  // District-level fields not carried in per-club analytics (payment
  // breakdowns). Scoped to the SAME snapshot the analytics above use — an
  // unscoped read here showed the current year's Payment Composition under a
  // past program year (#1396 / R3).
  const { ranking: districtRanking } = useDistrictRanking(
    districtId,
    selectedDate
  )

  const clubCount = analytics?.allClubs.length ?? 0
  const avgMembersPerClub =
    clubCount > 0 && analytics
      ? (analytics.totalMembership / clubCount).toFixed(1)
      : null

  // #1555: rendered inside the same `analytics && clubCount > 0` block as the
  // subtitle, so it cannot add a late layout shift beyond the one that block
  // already reserves (Lesson 107 shape). Year gate first — never the rows.
  const csp =
    analytics && clubCount > 0 && isCspRequired(programYear)
      ? cspLine(analytics.allClubs)
      : null

  return (
    <div className="redesign-panel">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
        {analytics && clubCount > 0 && (
          <p className="mt-1 text-sm text-gray-600">
            {clubCount} club{clubCount === 1 ? '' : 's'}
            {avgMembersPerClub && (
              <>
                <span className="mx-1.5 text-gray-400" aria-hidden="true">
                  ·
                </span>
                avg {avgMembersPerClub} members/club
              </>
            )}
          </p>
        )}
        {csp && (
          <p
            className="mt-1 text-sm text-gray-600"
            data-testid="district-csp-line"
          >
            {csp.text}
            {csp.showLink && (
              <>
                {' '}
                <Link
                  className="font-medium underline"
                  to={`/district/${districtId}/action-list#action-csp`}
                >
                  See which clubs →
                </Link>
              </>
            )}
            {csp.footnote && <> {csp.footnote}</>}
          </p>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <LoadingSkeleton variant="stat" />
          <LoadingSkeleton variant="stat" />
          <LoadingSkeleton variant="stat" />
        </div>
      )}

      {!isLoading && error && (
        <ErrorDisplay
          error={error}
          title="Failed to Load District Analytics"
          onRetry={() => window.location.reload()}
          showDetails={true}
        />
      )}

      {!isLoading && !error && !analytics && (
        <EmptyState
          title="No Cached Data Available"
          message="This district doesn't have any cached historical data yet. Use the Admin Panel to start collecting performance data over time."
          icon="data"
          action={{
            label: 'Go to Admin Panel',
            onClick: () => {
              window.location.href = '/admin'
            },
          }}
        />
      )}

      {/* KPI cards moved to <DistrictKpiStrip> (#572). The sticky strip
          sits above the narrative so the four numbers stay visible as
          the user scrolls. The composition bar + payment donut below
          remain the Overview section's "long-form" content. */}

      {/* Distinguished Composition stack-bar + Payment Composition donut */}
      {!isLoading && !error && analytics && analytics.allClubs.length > 0 && (
        <div className="mt-4 grid grid-cols-1 min-[980px]:grid-cols-2 gap-4">
          <DistinguishedCompositionBar
            smedley={analytics.distinguishedClubs.smedley}
            presidents={analytics.distinguishedClubs.presidents}
            select={analytics.distinguishedClubs.select}
            distinguished={analytics.distinguishedClubs.distinguished}
            totalClubs={analytics.allClubs.length}
          />
          <PaymentComposition
            totalMembership={analytics.totalMembership}
            newPayments={districtRanking?.newPayments ?? 0}
            aprilPayments={districtRanking?.aprilPayments ?? 0}
            octoberPayments={districtRanking?.octoberPayments ?? 0}
            latePayments={districtRanking?.latePayments ?? 0}
            charterPayments={districtRanking?.charterPayments ?? 0}
          />
        </div>
      )}
    </div>
  )
}
