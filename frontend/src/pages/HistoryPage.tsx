import React from 'react'
import { Link } from 'react-router-dom'
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
import { EARLIEST_ARCHIVED_PROGRAM_YEAR } from '../utils/programYearSummary'

/* History page (#367, #892). Per-year summary cards — top-5 districts +
   headline metrics for each COMPLETED program year — assembled from existing
   CDN endpoints (dates index → year-end all-districts rankings), newest first.
   Each card links into the landing page filtered to that program year.

   The year strip and card list are data-driven, so years with no snapshot data
   are correctly absent rather than hardcoded — nothing here enumerates which
   years exist. (This comment used to cite 2021-22 as a missing "COVID gap"; the
   CEO Report oracle showed that year IS archived — see #1456.) */

const HistoryPage: React.FC = () => {
  useDocumentTitle('Program Year History')
  const { summaries, isLoading, isError } = useProgramYearSummaries()
  const currentPY = getCurrentProgramYear()
  // The callout names the archive start (#2657). It used to say "before
  // 2019" above cards that start in 2016-17. It reads the same constant as
  // /methodology, not the oldest card: the hook drops a year whose rankings
  // fail to load, and the callout must not drift with it.
  const earliestOnFile = EARLIEST_ARCHIVED_PROGRAM_YEAR

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
        {/* #2657 REF-24: the chips are links. The live year opens the
            landing page; each archived year jumps to its card below.
            The live chip is the current date in the strip, not this page,
            so it carries aria-current="date". */}
        <span role="listitem">
          <Link
            to="/"
            aria-current="date"
            className="history-page-year-chip history-page-year-chip--current"
          >
            {formatProgramYearShort(currentPY.year)}
            <span className="history-page-year-chip__live">· LIVE</span>
          </Link>
        </span>
        {isLoading
          ? // The strip's boxes before the years arrive (#2634): one hidden
            // chip per expected year, so it does not grow 2 -> 12 chips.
            Array.from({
              length: Math.max(
                0,
                currentPY.year - EARLIEST_ARCHIVED_PROGRAM_YEAR
              ),
            }).map((_, i) => (
              <span
                key={i}
                role="listitem"
                aria-hidden="true"
                className="history-page-year-chip shell-ghost"
              >
                {formatProgramYearShort(currentPY.year - 1 - i)}
              </span>
            ))
          : summaries.map(s => (
              <span key={s.startYear} role="listitem">
                <a
                  href={`#py-${s.startYear}`}
                  className="history-page-year-chip"
                >
                  {s.label}
                </a>
              </span>
            ))}
        <span role="listitem">
          <a
            href="#history-archive-callout"
            className="history-page-year-chip history-page-year-chip--gap"
          >
            earlier · TI archive only
          </a>
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

      <div
        id="history-archive-callout"
        tabIndex={-1}
        className="districts-methodology-callout"
        style={{ marginTop: 32 }}
        data-testid="history-archive-callout"
      >
        <strong>Pre-{earliestOnFile} data.</strong> Years before{' '}
        {earliestOnFile} aren’t on file here. For those, see the official{' '}
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
