import React from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useProgramYearSummaries } from '../hooks/useProgramYearSummaries'
import {
  useGlobalHistory,
  useGlobalClubsByCountry,
} from '../hooks/useGlobalHistory'
import { ProgramYearSummaryCards } from '../components/ProgramYearSummaryCards'
import { WorldwideScoreboard } from '../components/WorldwideScoreboard'
import {
  getCurrentProgramYear,
  formatProgramYearShort,
} from '../utils/programYear'

/* History page (#367, #892). Per-year summary cards — top-5 districts +
   headline metrics for each COMPLETED program year — assembled from existing
   CDN endpoints (dates index → year-end all-districts rankings), newest first.
   Each card links into the landing page filtered to that program year.

   The year strip and card list are data-driven, so years with no snapshot data
   are correctly absent rather than hardcoded — nothing here enumerates which
   years exist. (This comment used to cite 2021-22 as a missing "COVID gap"; the
   CEO Report oracle showed that year IS archived — see #1456.) */

/**
 * Earliest program year (start year) with a year-end snapshot on file —
 * `v1/dates.json` begins at 2017-01-31, so PY 2016-2017 is the first year that
 * can be carded. Used ONLY to size the card grid's loading skeleton so it
 * reserves the height the loaded grid will occupy (#1500). The card list
 * itself stays entirely data-driven: a stale constant here costs a little
 * reserved whitespace, never a wrong or missing card.
 */
const EARLIEST_ARCHIVED_PROGRAM_YEAR = 2016

const HistoryPage: React.FC = () => {
  useDocumentTitle('Program Year History')
  const { summaries, isLoading, isError } = useProgramYearSummaries()
  const currentPY = getCurrentProgramYear()

  // The worldwide scoreboard (#1500, epic #1496 Sprint 4) — a separately
  // resolving query, so its slot is reserved by the component itself rather
  // than rendered null-until-data (the AwardsRaceSection CLS tripwire).
  const {
    history: globalHistory,
    isLoading: globalLoading,
    isError: globalError,
  } = useGlobalHistory()
  const {
    clubsByCountry,
    clubsCounted,
    snapshotDate: countrySnapshotDate,
    isLoading: countryLoading,
    isError: countryError,
  } = useGlobalClubsByCountry()

  return (
    <div className="placeholder-page">
      <p className="placeholder-page__eyebrow">Program year archive</p>
      <h1 className="placeholder-page__title">Program Year History</h1>
      {/* "What does this page answer?" lede (#879, epic #880 Sprint 3). The
          other doc-style route; one scannable sentence above the year strip. */}
      <p className="long-text-lede" data-testid="history-lede">
        How each completed Toastmasters program year finished — final standings
        frozen at June 30, no retroactive corrections — and which years are on
        file here versus the TI archive.
      </p>

      <div
        className="history-page-year-strip"
        role="list"
        data-testid="history-year-strip"
      >
        <span
          role="listitem"
          className="history-page-year-chip history-page-year-chip--current"
          aria-current="page"
        >
          {formatProgramYearShort(currentPY.year)}
          <span className="history-page-year-chip__live">· LIVE</span>
        </span>
        {summaries.map(s => (
          <span
            key={s.startYear}
            role="listitem"
            className="history-page-year-chip"
          >
            {s.label}
          </span>
        ))}
        <span
          className="history-page-year-chip history-page-year-chip--gap"
          role="listitem"
        >
          earlier · TI archive only
        </span>
      </div>

      <ProgramYearSummaryCards
        summaries={summaries}
        isLoading={isLoading}
        isError={isError}
        expectedCount={currentPY.year - EARLIEST_ARCHIVED_PROGRAM_YEAR}
      />

      <WorldwideScoreboard
        history={globalHistory}
        historyLoading={globalLoading}
        historyError={globalError}
        clubsByCountry={clubsByCountry}
        clubsCounted={clubsCounted}
        countrySnapshotDate={countrySnapshotDate}
        countryLoading={countryLoading}
        countryError={countryError}
      />

      <div className="districts-methodology-callout" style={{ marginTop: 32 }}>
        <strong>Pre-2019 data.</strong> Years before 2019 aren’t on file here.
        For those, see the official{' '}
        <a
          href="https://dashboards.toastmasters.org"
          target="_blank"
          rel="noopener noreferrer"
          className="districts-methodology-callout__link"
        >
          Toastmasters International archive
        </a>
        .
      </div>
    </div>
  )
}

export default HistoryPage
