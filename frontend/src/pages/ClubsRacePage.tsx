import React, { useEffect } from 'react'
import { formatDateText } from '../utils/dateFormatting'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useLatestAsOfDate } from '../hooks/useLatestAsOfDate'
import { useGlobalClubRace } from '../hooks/useGlobalClubRace'
import { DataControlsBar } from '../components/DataControlsBar'
import { ClubsWorldContextBar } from '../components/clubs/ClubsWorldContextBar'
import { ClubsSubnav } from '../components/clubs/ClubsSubnav'
import { RaceTable } from '../components/clubs/RaceTable'
import { RaceBasisBlock } from './ClubsWorldPage'
import NotFoundPanel from '../components/NotFoundPanel'
import type { ClubRaceTier } from '@taverns-red/shared-contracts'
import { raceTierFromSlug, raceTierTitle } from '../utils/raceTierRoute'

/* /clubs/race/:tier (#1556, phase 3) — the full "first to reach" leaderboard
   for ONE tier, a real route per tier (ADR-005). An unknown `:tier` shows
   the not-found panel, never an empty race. `?highlight=<clubId>` marks and scrolls to one row, the deep link the
   club page will use. */

const ClubsRaceTierPage: React.FC<{ tier: ClubRaceTier }> = ({ tier }) => {
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
  useDocumentTitle(title)
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
      {/* Phone context bar (#1831): below 768 it replaces this header. */}
      <ClubsWorldContextBar
        title={`First to ${title}`}
        back={{ label: 'Clubs worldwide', to: '/clubs' }}
        about={`Every club in the world that has reached ${title} this program year, in the order they crossed the line. Ties share a rank.`}
        trail={[
          { label: 'Clubs worldwide', to: '/clubs' },
          { label: `First to ${title}` },
        ]}
        selectedProgramYear={selectedProgramYear}
        setSelectedProgramYear={setSelectedProgramYear}
        availableProgramYears={availableProgramYears}
        cachedDates={cachedDates}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        effectiveDate={effectiveDate}
        asOfDate={globalAsOfDate}
        isLatestSnapshot={isLatestSnapshot}
      />
      <header className="districts-page-header clubs-page__header">
        <div className="districts-page-header__intro">
          <p className="placeholder-page__eyebrow">
            Program year {race?.programYear ?? selectedProgramYear.label}
            {snapshotDate ? ` · as of ${formatDateText(snapshotDate)}` : ''}
          </p>
          <h1 className="placeholder-page__title">First to {title}</h1>
          <p className="placeholder-page__body">
            Every club in the world that has reached {title} this program year,
            in the order they crossed the line. Ties share a rank.{' '}
            <Link to="/clubs" className="methodology-link">
              Back to the overview
            </Link>
            .
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

/** Not-found panel for a race slug that names no tier. */
/** The `/clubs/race/:tier` route: the tier's race, or not-found for a bad tier. */
const ClubsRacePage: React.FC = () => {
  const { tier: slug } = useParams<{ tier: string }>()
  const tier = raceTierFromSlug(slug)
  if (tier === null) {
    return (
      <NotFoundPanel
        heading={`There is no club race called "${slug}"`}
        message="Pick one of the Distinguished club races from the clubs page."
        suggestionsLead="Go to:"
        suggestions={[{ label: 'Club races', to: '/clubs' }]}
      />
    )
  }
  return <ClubsRaceTierPage tier={tier} />
}

export default ClubsRacePage
