import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type {
  GlobalHistory,
  GlobalTotalsClubsByCountry,
} from '@taverns-red/shared-contracts'
import {
  ABSENCE_LEGEND,
  buildCountryRows,
  buildScoreboardModel,
} from '../utils/globalHistoryView'

/**
 * The worldwide scoreboard on `/history` (#1500, epic #1496 Sprint 4).
 *
 * Ruled on #1426 (2026-08-19 #1): the worldwide series EXTENDS `/history`
 * rather than opening a `/global` route, because this page already answers
 * "how did each completed program year finish" — the CEO Report's own frame.
 *
 * Presentational and prop-driven (R3): the owning page resolves the data and
 * the snapshot date and passes them in. Nothing here re-derives a program
 * year or a date from response data.
 *
 * Two structural commitments:
 *
 * 1. **The slot is always reserved.** Loading, artifact-404 and error all
 *    render a fixed-height block, never `null` — a section that appears late
 *    pushes everything below it down (the `AwardsRaceSection` CLS tripwire,
 *    Lesson 79/107).
 * 2. **Absent is never zero.** Every null renders as a named marker with a
 *    full sentence for the tooltip and screen readers, and the markers are
 *    explained in a legend. See `utils/globalHistoryView.ts` for the three
 *    kinds and why they must stay distinguishable.
 *
 * Colour comes from the redesign tokens (`--ink`, `--surface`, `--line`),
 * which remap for dark mode by design. Tailwind gray utilities are avoided
 * on purpose: `dark-mode.css` intercepts several of them with `!important`
 * and would half-apply the dark palette here.
 */

export interface WorldwideScoreboardProps {
  /** The published `v1/global-history.json`, or null when it 404s. */
  history: GlobalHistory | null
  historyLoading: boolean
  historyError: boolean
  /** Clubs-by-country from the LATEST snapshot only — never a per-year series. */
  clubsByCountry: GlobalTotalsClubsByCountry | null
  /** Clubs the latest rollup counted — the whole every country share is of. */
  clubsCounted: number | null
  /** The snapshot date the country table is pinned to. */
  countrySnapshotDate: string | null
  countryLoading: boolean
  countryError: boolean
}

const NUM = new Intl.NumberFormat('en-US')

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section
    className="wws"
    aria-labelledby="wws-heading"
    data-testid="worldwide-scoreboard-shell"
  >
    <h2 className="wws__heading" id="wws-heading">
      Worldwide scoreboard
    </h2>
    <p className="wws__lede">
      How the whole of Toastmasters finished each completed program year —
      rolled up from the same year-end snapshots the per-year cards above are
      built from, with our own definitions stated on every row.
    </p>
    {children}
  </section>
)

const MethodologyLink: React.FC = () => (
  <p className="wws__methodology">
    Every basis on this table is defined in{' '}
    <Link
      to="/methodology#worldwide-rollup"
      className="wws__link"
      data-testid="wws-methodology-link"
    >
      Methodology · Worldwide rollup
    </Link>
    . We publish our numbers with our definitions stated; where they line up
    with Toastmasters International's published figures, that is a validation
    signal rather than a target.
  </p>
)

export const WorldwideScoreboard: React.FC<WorldwideScoreboardProps> = ({
  history,
  historyLoading,
  historyError,
  clubsByCountry,
  clubsCounted,
  countrySnapshotDate,
  countryLoading,
  countryError,
}) => {
  const model = useMemo(
    () => (history ? buildScoreboardModel(history) : null),
    [history]
  )

  const countryRows = useMemo(
    () =>
      clubsByCountry && clubsCounted !== null
        ? buildCountryRows(
            clubsByCountry.countries,
            clubsByCountry.unknown,
            clubsCounted
          )
        : null,
    [clubsByCountry, clubsCounted]
  )

  if (historyLoading) {
    return (
      <Shell>
        <div
          className="wws__reserve wws__skeleton"
          data-testid="worldwide-scoreboard-skeleton"
          aria-hidden="true"
        />
      </Shell>
    )
  }

  if (historyError) {
    return (
      <Shell>
        <div
          className="wws__reserve wws__placeholder"
          data-testid="worldwide-scoreboard-error"
          role="status"
        >
          Couldn’t load the worldwide series right now. Please try again
          shortly.
        </div>
      </Shell>
    )
  }

  if (!model || model.years.length === 0) {
    return (
      <Shell>
        <div
          className="wws__reserve wws__placeholder"
          data-testid="worldwide-scoreboard-placeholder"
          role="status"
        >
          <strong>The worldwide series is not yet published.</strong>
          <span>
            It is assembled by the daily data pipeline; this slot fills in on
            the next successful run. Nothing below has shifted to fill the
            space.
          </span>
        </div>
      </Shell>
    )
  }

  const colCount = model.years.length + 1

  return (
    <Shell>
      <div data-testid="worldwide-scoreboard" className="wws__body">
        <MethodologyLink />

        {/* A wide numeric table scrolls inside its own container so the page
            body never scrolls horizontally at 375px. tabIndex makes the
            scroll region keyboard-reachable, which is why it needs a name. */}
        <div
          className="wws__scroll"
          role="region"
          aria-label="Worldwide scoreboard by program year"
          tabIndex={0}
        >
          <table className="wws__table">
            <caption className="sr-only">
              Worldwide totals for each completed program year, newest first.
              Membership is the June-30 basis unless a row says otherwise. Cells
              reading “n/a”, “not on file” or “from 2026-27” are absent values,
              not zeros.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="wws__metric-head">
                  Metric
                </th>
                {model.years.map(y => (
                  <th
                    key={y.programYear}
                    scope="col"
                    className="wws__year-head"
                    data-testid={`wws-year-head-${y.programYear}`}
                    title={`Program year ${y.programYear}, frozen at ${y.yearEndDate}`}
                  >
                    {y.label}
                  </th>
                ))}
              </tr>
            </thead>
            {model.groups.map(group => (
              <tbody key={group.key} data-testid={`wws-group-${group.key}`}>
                <tr className="wws__group-row">
                  <th scope="colgroup" colSpan={colCount}>
                    <span className="wws__group-title">{group.title}</span>
                    {group.note && (
                      <span className="wws__group-note">{group.note}</span>
                    )}
                  </th>
                </tr>
                {group.rows.map(row => (
                  <tr
                    key={row.key}
                    data-testid={`wws-row-${row.key}`}
                    className={
                      row.indented ? 'wws__row wws__row--sub' : 'wws__row'
                    }
                  >
                    <th scope="row" className="wws__metric">
                      <span className="wws__metric-label">{row.label}</span>
                      {row.basis && (
                        <span className="wws__basis">{row.basis}</span>
                      )}
                    </th>
                    {row.cells.map((cell, i) => {
                      const year = model.years[i]
                      if (!year) return null
                      return (
                        <td
                          key={year.programYear}
                          className={
                            cell.absence
                              ? 'wws__cell wws__cell--absent'
                              : 'wws__cell'
                          }
                          data-testid={`wws-cell-${row.key}-${year.programYear}`}
                          {...(cell.absence
                            ? { 'data-absence': cell.absence }
                            : {})}
                          {...(cell.note ? { title: cell.note } : {})}
                        >
                          <span className="wws__cell-text">{cell.text}</span>
                          {cell.note && (
                            <span className="sr-only">{cell.note}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>

        <ul className="wws__legend" data-testid="wws-legend">
          {ABSENCE_LEGEND.map(item => (
            <li key={item.kind} className="wws__legend-item">
              <span className="wws__legend-marker">{item.text}</span>
              <span>{item.meaning}</span>
            </li>
          ))}
        </ul>

        {model.educationAbsentEntirely && (
          <p className="wws__note" data-testid="wws-education-absent">
            Education awards are not on file for any year currently published
            here — the breakdown returns once the education report sets are
            backfilled. Read that as “no data”, not as “no awards”.
          </p>
        )}

        <div className="wws__country" data-testid="wws-clubs-by-country">
          <h3 className="wws__subheading">Clubs by country</h3>
          <p className="wws__note">
            From the <strong>latest snapshot</strong>
            {countrySnapshotDate ? ` (${countrySnapshotDate})` : ''} only, not a
            per-year series: country enrichment thins out sharply on historical
            year-end files, so a five-year country trend would be an artefact of
            our own coverage rather than a fact about Toastmasters. Clubs we
            could not match to a country are published as their own{' '}
            <strong>Unknown</strong> row so every share is a share of a stated
            whole.
          </p>

          {countryLoading && (
            <div
              className="wws__country-reserve wws__skeleton"
              data-testid="wws-country-skeleton"
              aria-hidden="true"
            />
          )}

          {!countryLoading && (countryError || !countryRows) && (
            <div
              className="wws__country-reserve wws__placeholder"
              data-testid="wws-country-placeholder"
              role="status"
            >
              Clubs by country isn’t available for the latest snapshot right
              now.
            </div>
          )}

          {!countryLoading && !countryError && countryRows && (
            <div
              className="wws__scroll wws__country-reserve"
              role="region"
              aria-label="Clubs by country for the latest snapshot"
              tabIndex={0}
            >
              <table className="wws__table wws__table--country">
                <caption className="sr-only">
                  Clubs by country at the latest snapshot, ranked, with an
                  explicit Unknown bucket. The rows sum to the clubs counted.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Country</th>
                    <th scope="col" className="wws__num">
                      Clubs
                    </th>
                    <th scope="col" className="wws__num">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {countryRows.map(row => (
                    <tr
                      key={row.key}
                      data-testid={`wws-country-row-${row.key}`}
                      className={
                        row.unknown ? 'wws__row wws__row--unknown' : 'wws__row'
                      }
                    >
                      <th scope="row" className="wws__metric">
                        <span className="wws__metric-label">{row.label}</span>
                      </th>
                      <td
                        className="wws__cell wws__num"
                        data-testid={`wws-country-clubs-${row.key}`}
                      >
                        {NUM.format(row.clubs)}
                      </td>
                      <td className="wws__cell wws__num">{row.sharePct}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="wws__row wws__row--total">
                    <th scope="row" className="wws__metric">
                      <span className="wws__metric-label">Clubs counted</span>
                    </th>
                    <td
                      className="wws__cell wws__num"
                      data-testid="wws-country-total"
                    >
                      {clubsCounted === null ? '—' : NUM.format(clubsCounted)}
                    </td>
                    <td className="wws__cell wws__num">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}

export default WorldwideScoreboard
