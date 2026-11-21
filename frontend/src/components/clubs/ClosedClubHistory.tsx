import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  clubIdsMatch,
  type ClubDistrictHistoryClub,
  type ReinstatableClub,
} from '@taverns-red/shared-contracts'
import { districtAnalyticsFileQueryOptions } from '../../hooks/districtAnalyticsFileQuery'
import { useClubGoalTimeline } from '../../hooks/useClubGoalTimeline'
import type { SnapshotDate } from '../../types/snapshotDate'
import type { ProgramYear } from '../../utils/programYear'
import { formatShortDate } from '../../utils/dateFormatting'
import { closedClubNotice } from '../../utils/closedClubNotice'
import { formatPY, signedDelta } from '../../utils/displayFormat'
import {
  PROGRAM_YEAR_START_BASIS,
  sinceSnapshotBasis,
} from '../../utils/netChangeBasis'
import { buildClubLifecycle } from '../../utils/clubLifecycle'
import { ClubHero } from './ClubHero'
import { ClubHeroStatusChips } from './ClubHeroStatusChips'
import { ClubStatStrip } from './ClubStatStrip'
import { ClubMembershipTrendChart } from './ClubMembershipTrendChart'
import { ClubLifecyclePanel } from './ClubLifecyclePanel'
import { ClubDCPGoalsPanel } from '../ClubDCPGoalsPanel'
import { ChartSparklineExpand } from '../ChartSparklineExpand'
import { MembershipHeadline } from './MembershipHeadline'
import { LoadingSkeleton } from '../LoadingSkeleton'
import { ErrorDisplay } from '../ErrorDisplay'
import { MobileRowList } from '../MobileRowList'
import { ClubReinstateWindow } from '../ReinstateWindow'

export interface ClosedClubHistoryProps {
  clubId: string
  /** The club's district history (its last span has ended). */
  history: ClubDistrictHistoryClub
  /** The district the club was last in. */
  districtId: string
  /** The last snapshot that listed the club (R3: the page passes it). */
  lastSeenDate: SnapshotDate
  /** The program year holding `lastSeenDate` (R3). */
  programYear: ProgramYear
  /** #3117 — the `Susp` date when the club is on its district's current
   *  suspended list: it has not closed, so the hero shows the suspended
   *  status instead of the closed line. */
  suspendDate?: string | null | undefined
  /** #3111 — the club's row in the latest reinstatable-clubs.json, when
   *  it has one (the page reads it, R3). No period, no panel. */
  reinstatable?: ReinstatableClub | undefined
}

/**
 * #3104 — a closed club's page: the name, when Toastmasters last listed
 * it, and its last program year from the district analytics file at that
 * date (one read). Only history is shown. The PY and date pickers, the
 * projection, education, compliance, recent changes, risk factors, the
 * worldwide standing and the map all need current data, so they are not
 * rendered. Prior years' membership lines are left out too: they need one
 * snapshot read per year.
 */
export const ClosedClubHistory: React.FC<ClosedClubHistoryProps> = ({
  clubId,
  history,
  districtId,
  lastSeenDate,
  programYear,
  suspendDate,
  reinstatable,
}) => {
  const {
    data: analytics,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery(districtAnalyticsFileQueryOptions(districtId, lastSeenDate))
  const club = useMemo(
    () => analytics?.allClubs?.find(c => clubIdsMatch(c.clubId, clubId)),
    [analytics, clubId]
  )

  const membershipTrend = useMemo(
    () =>
      (club?.membershipTrend ?? []).filter(
        p => p.date >= programYear.startDate && p.date <= lastSeenDate
      ),
    [club, programYear, lastSeenDate]
  )
  const dcpGoalsTrend = useMemo(
    () =>
      (club?.dcpGoalsTrend ?? []).filter(
        p => p.date >= programYear.startDate && p.date <= lastSeenDate
      ),
    [club, programYear, lastSeenDate]
  )
  const timelineRows = useClubGoalTimeline(
    dcpGoalsTrend,
    programYear,
    lastSeenDate
  )
  const lifecycle = useMemo(
    () =>
      buildClubLifecycle({
        charterDate: club?.charterDate,
        history,
        suspendDate: suspendDate ?? null,
      }),
    [club, history, suspendDate]
  )

  const base = club?.membershipBase ?? membershipTrend[0]?.count ?? 0
  const last = membershipTrend[membershipTrend.length - 1]?.count ?? 0
  const change = last - base
  const firstDate = membershipTrend[0]?.date
  const basis =
    club?.membershipBase == null && firstDate
      ? sinceSnapshotBasis(formatShortDate(firstDate))
      : PROGRAM_YEAR_START_BASIS
  const goals = dcpGoalsTrend[dcpGoalsTrend.length - 1]?.goalsAchieved ?? 0
  const pyLabel = formatPY(programYear.label)

  // Area and division as plain text: today's pages for them may name
  // other clubs or not exist.
  const heroClub = {
    clubId,
    clubName: club?.clubName ?? history.name,
    areaName: club?.areaName,
    divisionName: club?.divisionName,
    charterDate: club?.charterDate,
  }

  // One commit for the hero and the panels: the area and division come
  // from the same read, so painting the hero first would shift it.
  if (isPending) {
    return (
      <div aria-busy="true">
        <LoadingSkeleton variant="card" />
        <div className="mt-6">
          <LoadingSkeleton variant="chart" height="400px" />
        </div>
      </div>
    )
  }

  return (
    <>
      <ClubHero
        clubId={clubId}
        districtId={districtId}
        club={heroClub}
        controls={null}
        statusPills={
          suspendDate ? (
            <ClubHeroStatusChips
              clubStatus="Suspended"
              statusSince={
                lifecycle.events.find(e => e.kind === 'suspended')?.when
              }
            />
          ) : (
            <></>
          )
        }
        closedNotice={suspendDate ? undefined : closedClubNotice(lastSeenDate)}
      />

      {/* #3111 (draft) — what's next: how long the club has to reinstate. */}
      <ClubReinstateWindow club={reinstatable} />

      {club ? (
        <>
          <ClubStatStrip
            stats={[
              { label: 'Base', value: base },
              { label: 'Last count', value: last },
              {
                label: `Change ${basis}`,
                value: signedDelta(change),
                valClass: change > 0 ? 'pos' : change < 0 ? 'neg' : '',
              },
              { label: 'DCP Goals', value: `${goals}/10` },
            ]}
          />

          <div className="club-closed-stack">
            <section className="club-panel">
              <div className="club-panel__head">
                <h2>
                  <svg
                    className="club-panel__ico"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  >
                    <path d="M2 13l3-4 3 2 6-7" />
                    <path d="M10 4h3v3" />
                  </svg>
                  Membership Trend
                </h2>
                <span className="club-panel__meta">
                  {pyLabel} · {membershipTrend.length} data point
                  {membershipTrend.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="club-panel__body">
                <ChartSparklineExpand
                  urlId="membership"
                  title="Membership Trend"
                  sparklineData={membershipTrend.map(p => p.count)}
                  headline={
                    <MembershipHeadline
                      latest={last}
                      change={change}
                      basis={basis}
                    />
                  }
                >
                  <ClubMembershipTrendChart
                    current={membershipTrend}
                    priors={[]}
                    programYearLabel={programYear.label}
                  />
                </ChartSparklineExpand>
              </div>
            </section>

            <ClubDCPGoalsPanel
              goalsAchieved={goals}
              clubRecord={null}
              isLoading={false}
              timelineRows={timelineRows}
            />
          </div>
        </>
      ) : isError ? (
        // The page's own failed-read state (#1104), with its retry.
        <ErrorDisplay
          error={error ?? 'Failed to load club data'}
          title="Failed to Load Club"
          onRetry={() => {
            refetch()
          }}
          showDetails={true}
        />
      ) : null}

      <div className="club-panels-grid">
        <ClubLifecyclePanel lifecycle={lifecycle} isLoading={false} />
      </div>

      {/* Phones: the hero's history link becomes a row (as on the open
          club page); from 768 the hero link shows and CSS hides this. */}
      <div className="club-more">
        <MobileRowList
          label="More about this club"
          rows={[
            {
              id: 'history',
              to: `/district/${districtId}/club/${clubId}/history`,
              title: 'Multi-year history',
              meta: 'Every program year for this club',
            },
          ]}
        />
      </div>
    </>
  )
}
