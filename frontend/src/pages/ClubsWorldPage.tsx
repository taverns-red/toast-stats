import React from 'react'
import { Link } from 'react-router-dom'
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
import { exclusiveTierCounts, totalRecognised } from '../utils/clubRaceCounts'

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

/* The total line is part of the reserved slot: it lands with the tiles, and
   an unreserved one-line paragraph is exactly the late expansion that cost
   ~0.2 CLS on the landing page (Lesson 107). */
const KpiSkeleton: React.FC = () => (
  <>
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
          <span className="clubs-kpi__note">&nbsp;</span>
        </div>
      ))}
    </div>
    <p className="clubs-kpis__total" aria-hidden="true">
      &nbsp;
    </p>
  </>
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

  /* #1570 — each club counted ONCE, at the level it holds now. The
     artifact's timeline is CUMULATIVE (a President's club also sits in the
     Select and Distinguished points), which is right for "at or past this
     line" and wrong for a tile: it triple-counted Ang Mo Kio C.C. Mandarin.
     The lists below are unchanged — a club still appears under every tier it
     reached, with its crossing date and rank (R-A2) — so the tile reads 31
     above a 35-row Distinguished list, and the sub-label plus the total line
     say why in place. */
  const counts = exclusiveTierCounts(race?.reached ?? [])
  const recognised = totalRecognised(counts)

  return (
    <div className="clubs-page">
      <header className="districts-page-header clubs-page__header">
        <div className="districts-page-header__intro">
          <p className="clubs-page__eyebrow">
            Program year {race?.programYear ?? selectedProgramYear.label}
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
            {RACE_TIER_ROUTES.map(({ tier }) => (
              <Link
                key={tier}
                to={raceTierUrl(tier)}
                className="clubs-kpi"
                data-testid="clubs-kpi"
              >
                <span className="clubs-kpi__label">{raceTierTitle(tier)}</span>
                <span className="clubs-kpi__value">{counts[tier]}</span>
                <span className="clubs-kpi__note">at this level now</span>
              </Link>
            ))}
          </div>
          <p className="clubs-kpis__total" data-testid="clubs-kpis-total">
            {recognised} clubs recognised worldwide — each counted once, at its
            top level.
          </p>

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
              currentCounts={counts}
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
