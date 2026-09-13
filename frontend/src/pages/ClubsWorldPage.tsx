import React from 'react'
import { Link } from 'react-router-dom'
import type { ClubRaceTier } from '@taverns-red/shared-contracts'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useLatestAsOfDate } from '../hooks/useLatestAsOfDate'
import { useGlobalClubRace } from '../hooks/useGlobalClubRace'
import { DataControlsBar } from '../components/DataControlsBar'
import { ClubsSubnav } from '../components/clubs/ClubsSubnav'
import { RacePodium } from '../components/clubs/RacePodium'
import { RaceChart } from '../components/clubs/RaceChart'
import { ChartSkeleton } from '../components/ChartSkeleton'
import {
  RACE_TIER_ROUTES,
  raceTierTitle,
  raceTierUrl,
} from '../utils/raceTierRoute'

/* /clubs (#1556, phase 3) — the worldwide "race to Distinguished" hub:
   KPI strip (one tile per tier), podium per tier, cumulative race chart, and
   the always-visible basis block. ONE query (`useGlobalClubRace`) feeds the
   whole area; the per-tier race pages are real routes off the subnav.

   The page owns program year/date (R3) via the shared PY controls and pins
   the race query to the resolved date (Lesson 59). Above-the-fold slots are
   reserved while the query resolves (Lesson 107) so the hub never shifts. */

export const RaceBasisBlock: React.FC<{
  membershipBasis: 'confirmed-renewals' | 'active-members'
  officialRecognitionFrom: string
}> = ({ membershipBasis, officialRecognitionFrom }) => (
  <aside className="race-basis" data-testid="race-basis" aria-label="Basis">
    <p>
      <strong>How this is computed.</strong> A club is Distinguished here when
      it meets the tier's requirements under the program year's rules — DCP
      goals plus membership, with a Club Success Plan where required. Before
      April 1 the membership figure is <strong>confirmed April renewals</strong>
      ; from April 1 it is active members.
      {membershipBasis === 'confirmed-renewals'
        ? ' This date reads confirmed renewals.'
        : ' This date reads active members.'}
    </p>
    <p>
      Toastmasters International confers official recognition from{' '}
      {officialRecognitionFrom}; a club shown here may precede that stamp. The
      rosette marks clubs TI has already recognised. Dates are snapshot dates —
      "between A and B" means no snapshot was collected in between.{' '}
      <Link to="/methodology#club-race">Methodology</Link>
    </p>
  </aside>
)

const KpiSkeleton: React.FC = () => (
  <div
    className="clubs-kpis"
    data-testid="clubs-kpis-skeleton"
    aria-busy="true"
    aria-label="Loading race"
  >
    {RACE_TIER_ROUTES.map(({ tier }) => (
      <div key={tier} className="clubs-kpi" aria-hidden="true">
        <span className="clubs-kpi__label">{raceTierTitle(tier)}</span>
        <span className="clubs-kpi__value">&nbsp;</span>
      </div>
    ))}
  </div>
)

const ClubsWorldPage: React.FC = () => {
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    availableProgramYears,
    cachedDates,
    effectiveDate,
    isLatestSnapshot,
    isDatesPending,
  } = useProgramYearControls()
  const { asOfDate: globalAsOfDate } = useLatestAsOfDate()
  const { race, snapshotDate, isLoading } = useGlobalClubRace(effectiveDate)

  const latest = race?.timeline[race.timeline.length - 1]
  const previous =
    race && race.timeline.length > 1
      ? race.timeline[race.timeline.length - 2]
      : undefined
  // The timeline's last point is the artifact's own cumulative count (and
  // what the delta is read against); rows are the fallback for a store with
  // no observed dates yet.
  const countFor = (tier: ClubRaceTier): number =>
    latest
      ? latest[tier]
      : race
        ? race.reached.filter(r => r.tiers[tier]).length
        : 0

  return (
    <div className="clubs-page">
      <header className="districts-page-header clubs-page__header">
        <div className="districts-page-header__intro">
          <p className="clubs-page__eyebrow">
            Program year {race?.programYear ?? selectedProgramYear.year}
            {snapshotDate ? ` · as of ${snapshotDate}` : ''}
          </p>
          <h1 className="placeholder-page__title">Clubs worldwide</h1>
          <p className="placeholder-page__body">
            The race to Distinguished: which clubs in the world reached each
            tier first, and when. Only clubs that have reached a line appear
            here.
          </p>
        </div>
        <div className="districts-page-header__actions">
          <DataControlsBar
            latestSnapshotDate={effectiveDate}
            asOfDate={isLatestSnapshot ? globalAsOfDate : undefined}
            isLatest={isLatestSnapshot}
            availableProgramYears={availableProgramYears}
            selectedProgramYear={selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={cachedDates}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            freshnessPending={isDatesPending}
          />
        </div>
      </header>

      <ClubsSubnav />

      {isLoading && (
        <>
          <KpiSkeleton />
          <ChartSkeleton height={260} />
        </>
      )}

      {!isLoading && !race && (
        <p className="clubs-page__empty" data-testid="clubs-race-unavailable">
          The worldwide race is not available for this date. It is published
          daily from the collector's crossing store; earlier dates predate it.
        </p>
      )}

      {race && (
        <>
          <div className="clubs-kpis">
            {RACE_TIER_ROUTES.map(({ tier }) => {
              const count = countFor(tier)
              const delta =
                latest && previous ? latest[tier] - previous[tier] : null
              return (
                <Link
                  key={tier}
                  to={raceTierUrl(tier)}
                  className="clubs-kpi"
                  data-testid="clubs-kpi"
                >
                  <span className="clubs-kpi__label">
                    {raceTierTitle(tier)}
                  </span>
                  <span className="clubs-kpi__value">{count}</span>
                  <span className="clubs-kpi__delta">
                    {delta === null
                      ? 'clubs reached'
                      : delta > 0
                        ? `+${delta} since previous snapshot`
                        : 'no change since previous snapshot'}
                  </span>
                </Link>
              )
            })}
          </div>

          <section className="clubs-section" aria-labelledby="clubs-podiums">
            <h2 id="clubs-podiums" className="clubs-section__title">
              First to reach
            </h2>
            <div className="clubs-podiums">
              {RACE_TIER_ROUTES.filter(
                r => race.ruleset.smedleyAvailable || r.tier !== 'Smedley'
              ).map(({ tier }) => (
                <section key={tier} aria-label={raceTierTitle(tier)}>
                  <h3 className="clubs-section__title">
                    <Link to={raceTierUrl(tier)}>{raceTierTitle(tier)} →</Link>
                  </h3>
                  <RacePodium tier={tier} rows={race.reached} />
                </section>
              ))}
            </div>
          </section>

          <section className="clubs-section" aria-labelledby="clubs-chart">
            <h2 id="clubs-chart" className="clubs-section__title">
              The pack
            </h2>
            <RaceChart
              timeline={race.timeline}
              smedleyAvailable={race.ruleset.smedleyAvailable}
            />
          </section>

          <RaceBasisBlock
            membershipBasis={race.ruleset.membershipBasis}
            officialRecognitionFrom={race.ruleset.officialRecognitionFrom}
          />
        </>
      )}
    </div>
  )
}

export default ClubsWorldPage
