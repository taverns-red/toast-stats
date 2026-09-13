import React, { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useLatestAsOfDate } from '../hooks/useLatestAsOfDate'
import { useGlobalClubRace } from '../hooks/useGlobalClubRace'
import { DataControlsBar } from '../components/DataControlsBar'
import { ClubsSubnav } from '../components/clubs/ClubsSubnav'
import { RaceTable } from '../components/clubs/RaceTable'
import { RaceBasisBlock } from './ClubsWorldPage'
import { raceTierFromSlug, raceTierTitle } from '../utils/raceTierRoute'

/* /clubs/race/:tier (#1556, phase 3) — the full "first to reach" leaderboard
   for ONE tier, a real route per tier (ADR-005). An unknown `:tier` throws
   the branded 404 through the root errorElement (#1011) — never an empty
   race. `?highlight=<clubId>` marks and scrolls to one row, the deep link the
   club page will use. */

const ClubsRacePage: React.FC = () => {
  const { tier: slug } = useParams<{ tier: string }>()
  const tier = raceTierFromSlug(slug)
  if (tier === null) {
    throw new Response(null, { status: 404, statusText: 'Tier not found' })
  }

  const [searchParams] = useSearchParams()
  const highlightClubId = searchParams.get('highlight') ?? undefined

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

  const title = raceTierTitle(tier)
  const rows = race ? race.reached.filter(r => r.tiers[tier]) : []
  const tierExists = race
    ? race.ruleset.smedleyAvailable || tier !== 'Smedley'
    : true

  useEffect(() => {
    if (!highlightClubId || rows.length === 0) return
    const el = document.getElementById(`race-row-${highlightClubId}`)
    el?.scrollIntoView?.({ block: 'center' })
  }, [highlightClubId, rows.length])

  return (
    <div className="clubs-page">
      <header className="districts-page-header clubs-page__header">
        <div className="districts-page-header__intro">
          <p className="clubs-page__eyebrow">
            Program year {race?.programYear ?? selectedProgramYear.year}
            {snapshotDate ? ` · as of ${snapshotDate}` : ''}
          </p>
          <h1 className="placeholder-page__title">First to {title}</h1>
          <p className="placeholder-page__body">
            Every club in the world that has reached {title} this program year,
            in the order they crossed the line. Ties share a rank.{' '}
            <Link to="/clubs">Back to the overview</Link>.
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
        <p className="clubs-page__empty" aria-busy="true">
          Loading the race…
        </p>
      )}

      {!isLoading && !race && (
        <p className="clubs-page__empty" data-testid="clubs-race-unavailable">
          The worldwide race is not available for this date. It is published
          daily from the collector's crossing store; earlier dates predate it.
        </p>
      )}

      {race && !tierExists && (
        <p className="clubs-page__empty">
          This tier did not exist in {race.programYear}.
        </p>
      )}

      {race && tierExists && rows.length === 0 && (
        <p className="race-podium__empty">
          No club has reached {title} yet this program year.
          {race.observation.firstObservedDate
            ? ` First snapshot: ${race.observation.firstObservedDate}.`
            : ''}
        </p>
      )}

      {race && tierExists && rows.length > 0 && (
        <RaceTable tier={tier} rows={rows} highlightClubId={highlightClubId} />
      )}

      {race && (
        <RaceBasisBlock
          membershipBasis={race.ruleset.membershipBasis}
          officialRecognitionFrom={race.ruleset.officialRecognitionFrom}
        />
      )}
    </div>
  )
}

export default ClubsRacePage
