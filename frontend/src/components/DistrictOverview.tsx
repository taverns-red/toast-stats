import React from 'react'
import { Link } from 'react-router-dom'
import { isCspRequired } from '@taverns-red/analytics-core'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useDistrictRanking } from '../hooks/useDistrictRanking'
import type { DistrictPerformanceTargets } from '../hooks/useDistrictAnalytics'
import { summarizeCspCompletion } from '../utils/cspCompletion'
import {
  CSP_LOST_ELIGIBILITY,
  cspAutoCreditNote,
  describeCspDueDates,
  formatCspDueDate,
  groupByCspDueDate,
} from '../utils/cspDeadlines'
import { ErrorDisplay, EmptyState } from './ErrorDisplay'
import DistinguishedCompositionBar from './DistinguishedCompositionBar'
import PaymentComposition from './PaymentComposition'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * The one-line Club Success Plan summary under the overview header (#1555,
 * spec §6.3; #1565). Counts ACTIVE clubs only — numerator and denominator —
 * so the number a user clicks equals the badge on the action-list section it
 * lands on (#1561 review). Suspended/ineligible clubs without a plan, and
 * clubs chartered after 1 April (automatic credit), are named in the action
 * list's own footnote voice (`footnote`); an ineligible or auto-credit club
 * that has filed leaves the denominator too. Clubs with no CSP value on a
 * tracked year are excluded from both numbers and named in a suffix (E2).
 *
 * Deadline-aware: before a due date the line names it and what missing it
 * costs; from the day after, it states the clubs did not file and cannot be
 * Distinguished this program year. The state comes from the pinned snapshot
 * date in `asOf` (R3), never the clock. Returns null when nothing can be said.
 */
function cspLine(
  clubs: Parameters<typeof summarizeCspCompletion>[0],
  asOf: Parameters<typeof summarizeCspCompletion>[1]
): {
  text: string
  showLink: boolean
  footnote: string | null
} | null {
  const csp = summarizeCspCompletion(clubs, asOf)
  const notSubmitted = csp.notSubmitted.length
  const known = csp.submittedCount - csp.submittedIneligibleCount + notSubmitted
  if (known === 0) return null
  const unknownSuffix =
    csp.unknownCount > 0
      ? ` (${csp.unknownCount} club${csp.unknownCount === 1 ? '' : 's'} with no CSP data)`
      : ''
  const footnotes: string[] = []
  const inel = csp.notSubmittedIneligible.length
  if (inel > 0) {
    footnotes.push(
      inel === 1
        ? '1 suspended/ineligible club without a plan is not counted.'
        : `${inel} suspended/ineligible clubs without a plan are not counted.`
    )
  }
  const autoCredit = csp.notSubmittedAutoCredit.length
  if (autoCredit > 0) {
    footnotes.push(`${cspAutoCreditNote(autoCredit)}.`)
  }
  const footnote = footnotes.length > 0 ? footnotes.join(' ') : null
  if (notSubmitted === 0) {
    return {
      text: `Every club has submitted its Club Success Plan.${unknownSuffix}`,
      showLink: false,
      footnote,
    }
  }
  const pct = Math.round((notSubmitted / known) * 100)
  const lead = `${notSubmitted} of ${known} active clubs (${pct}%)`

  const groups = groupByCspDueDate(csp.notSubmitted)
  const overdue = groups.filter(g => g.overdue)
  const pending = groups.filter(g => !g.overdue)
  const overdueCount = overdue.reduce((sum, g) => sum + g.clubs.length, 0)
  const pendingCount = pending.reduce((sum, g) => sum + g.clubs.length, 0)

  let text: string
  if (overdueCount === 0) {
    const verb = notSubmitted === 1 ? 'has' : 'have'
    text =
      pending.length === 1
        ? `${lead} ${verb} not submitted a Club Success Plan — due ${formatCspDueDate(pending[0]!.dueDate)}; a club that misses that date ${CSP_LOST_ELIGIBILITY}.`
        : `${lead} ${verb} not submitted a Club Success Plan — due ${describeCspDueDates(pending)}; a club that misses its date ${CSP_LOST_ELIGIBILITY}.`
  } else if (pendingCount === 0) {
    const missedBy =
      overdue.length === 1
        ? formatCspDueDate(overdue[0]!.dueDate)
        : 'their due dates'
    text = `${lead} did not submit a Club Success Plan by ${missedBy} and ${CSP_LOST_ELIGIBILITY}.`
  } else {
    const missedBy =
      overdue.length === 1
        ? formatCspDueDate(overdue[0]!.dueDate)
        : 'their due dates'
    text =
      `${lead} have not submitted a Club Success Plan — ` +
      `${overdueCount} did not file by ${missedBy} and ${CSP_LOST_ELIGIBILITY}; ` +
      `${pendingCount} ${pendingCount === 1 ? 'is' : 'are'} still due by ${describeCspDueDates(pending)}.`
  }
  return { text: `${text}${unknownSuffix}`, showLink: true, footnote }
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
  // #1565: the per-club deadline is judged against the PINNED date the page
  // fetched under (R3). Without one nothing correct can be said about
  // deadlines, so the line is omitted rather than guessed from the clock —
  // the page always passes it (`hasValidDates` ⇒ `effectiveEndDate`).
  const csp =
    analytics && clubCount > 0 && isCspRequired(programYear) && selectedDate
      ? cspLine(analytics.allClubs, { programYear, snapshotDate: selectedDate })
      : null

  if (isLoading) return <DistrictOverviewSkeleton programYear={programYear} />

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

      {error && (
        <ErrorDisplay
          error={error}
          title="Failed to Load District Analytics"
          onRetry={() => window.location.reload()}
          showDetails={true}
        />
      )}

      {!error && !analytics && (
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
      {!error && analytics && analytics.allClubs.length > 0 && (
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

/** A text-shaped placeholder: laid out like the loaded copy, painted as a
 *  pulsing bar. */
const GhostText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    aria-hidden="true"
    className="animate-pulse rounded bg-gray-200 theme-dark:bg-gray-700 text-transparent"
  >
    {children}
  </span>
)

/** An invisible, inert copy of a loaded panel under a shimmer: the slot is
 *  exactly as tall as the panel because the panel itself lays it out. */
const GhostPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative">
    <div className="invisible" inert>
      {children}
    </div>
    <span className="absolute inset-0 animate-pulse rounded-lg bg-gray-200 theme-dark:bg-gray-700" />
  </div>
)

/**
 * Structural loading skeleton for the Overview panel (#1647, Lessons 107/158).
 *
 * The old loading state was three one-row stat bars in a 3-up grid; the loaded
 * panel is a subtitle, a Club Success Plan line (for years that require one)
 * and the two-up composition grid, so the swap grew the panel 208→360px on
 * desktop and 468→717px on a phone. This lays out the loaded panel's own
 * rows: the same header chrome, representative subtitle and CSP copy painted
 * as text-shaped bars, and the real composition bar + payment card rendered
 * invisibly with representative values under a shimmer. The page also renders
 * it while the snapshot dates are still resolving, so the slot exists from the
 * first paint rather than inserting above everything once the dates land.
 */
export const DistrictOverviewSkeleton: React.FC<{ programYear: string }> = ({
  programYear,
}) => (
  <div
    className="redesign-panel"
    aria-busy="true"
    data-testid="district-overview-skeleton"
  >
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
      <p
        className="mt-1 text-sm"
        data-testid="district-overview-skeleton-subtitle"
      >
        <GhostText>120 clubs · avg 20.0 members/club</GhostText>
      </p>
      {isCspRequired(programYear) && (
        <p
          className="mt-1 text-sm"
          data-testid="district-overview-skeleton-csp"
        >
          <GhostText>
            34 of 120 active clubs (28%) have not submitted a Club Success Plan
            — due September 30; a club that misses that date{' '}
            {CSP_LOST_ELIGIBILITY}. See which clubs →
          </GhostText>
        </p>
      )}
    </div>
    <div
      aria-hidden="true"
      data-testid="district-overview-skeleton-composition"
      className="mt-4 grid grid-cols-1 min-[980px]:grid-cols-2 gap-4"
    >
      <GhostPanel>
        <DistinguishedCompositionBar
          smedley={4}
          presidents={8}
          select={12}
          distinguished={16}
          totalClubs={120}
        />
      </GhostPanel>
      <GhostPanel>
        <PaymentComposition
          totalMembership={2400}
          newPayments={400}
          aprilPayments={800}
          octoberPayments={1000}
          latePayments={100}
          charterPayments={100}
        />
      </GhostPanel>
    </div>
  </div>
)
