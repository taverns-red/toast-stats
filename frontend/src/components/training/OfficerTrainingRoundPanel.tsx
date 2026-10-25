import React from 'react'
import type { OfficerTrainingRoundWindow } from '@taverns-red/analytics-core'
import {
  ALL_OFFICERS,
  DEFAULT_TRAINING_THRESHOLD,
  figuresFromDistribution,
  formatPct,
  thresholdPhrase,
  type CurvePoint,
} from '../../utils/officerTraining'
import { formatDisplayDate, formatShortDate } from '../../utils/dateFormatting'
import { TrainingCurveChart } from './TrainingCurveChart'

/* One officer-training round (#2296): its status on the page's date, the
   headline percentages, the distribution of clubs by officers trained
   (0–7, the 1–3-short bars highlighted), the same figures on this date last
   program year, and the progress curve. Every bar value and curve figure is
   printed as text; the bars and the chart are decoration (aria-hidden). */

export interface RoundPanelLastYear {
  /** The snapshot date the comparison was read from. */
  date: string
  /** How that date relates to this year's point in the round (review S2). */
  kind: 'same' | 'earlier' | 'final'
  distribution: readonly number[]
}

interface OfficerTrainingRoundPanelProps {
  window: OfficerTrainingRoundWindow
  status: 'open' | 'closed' | 'upcoming'
  daysLeft: number | null
  threshold: number
  /** Clubs by officers trained, index 0–7; null = not measured. */
  distribution: readonly number[] | null
  lastYear: RoundPanelLastYear | null
  curve: {
    thisYear: readonly CurvePoint[]
    lastYear: readonly CurvePoint[]
    thisYearLabel: string
    lastYearLabel: string
  }
}

function lastYearLabel(lastYear: RoundPanelLastYear): string {
  const date = formatDisplayDate(lastYear.date)
  if (lastYear.kind === 'final') return `Last year's final (${date})`
  if (lastYear.kind === 'same') return `Last year on ${date}`
  return `Last year, nearest earlier snapshot (${date})`
}

const roundName = (round: 1 | 2) =>
  round === 1 ? 'Round 1 (Jun–Aug)' : 'Round 2 (Nov–Feb)'

function statusText(
  window: OfficerTrainingRoundWindow,
  status: OfficerTrainingRoundPanelProps['status'],
  daysLeft: number | null
): string {
  if (status === 'open') {
    const left = daysLeft ?? 0
    return `Open · ${left} day${left === 1 ? '' : 's'} left (to ${formatShortDate(window.end)})`
  }
  if (status === 'closed') {
    return `Closed ${formatDisplayDate(window.end)} · final results`
  }
  return `Opens ${formatDisplayDate(window.start)}`
}

function curveNote(
  window: OfficerTrainingRoundWindow,
  thisYear: readonly CurvePoint[],
  lastYear: readonly CurvePoint[]
): string {
  const parts: string[] = []
  const first = thisYear[0]
  if (!first) {
    parts.push(
      'No daily record for this round yet: the daily pipeline records it going forward.'
    )
  } else if (first.date > window.start) {
    parts.push(`This year's record starts ${formatShortDate(first.date)}.`)
  }
  if (lastYear.length === 0) {
    parts.push('Last year has no recorded points for this round.')
  } else if (lastYear.length < 10) {
    parts.push(
      `Last year has ${lastYear.length} recorded point${lastYear.length === 1 ? '' : 's'} (older dates were kept at month-end only).`
    )
  }
  return parts.join(' ')
}

export const OfficerTrainingRoundPanel: React.FC<
  OfficerTrainingRoundPanelProps
> = ({
  window,
  status,
  daysLeft,
  threshold,
  distribution,
  lastYear,
  curve,
}) => {
  const headingId = `training-round-${window.round}`
  const figures = distribution
    ? figuresFromDistribution(distribution, threshold)
    : null
  const lastFigures = lastYear
    ? figuresFromDistribution(lastYear.distribution, threshold)
    : null
  const max = Math.max(1, ...(distribution ?? [0]))
  const isDefault = threshold === DEFAULT_TRAINING_THRESHOLD
  const isAllSeven = threshold === ALL_OFFICERS

  return (
    <section
      className="training-round"
      aria-labelledby={headingId}
      data-testid={`training-round-${window.round}`}
    >
      <header className="training-round__head">
        <h3 id={headingId} className="training-round__title">
          {roundName(window.round)}
        </h3>
        <p
          className={`training-round__status training-round__status--${status}`}
          data-testid={`training-round-${window.round}-status`}
        >
          {statusText(window, status, daysLeft)}
        </p>
      </header>

      {status === 'upcoming' ? (
        <p className="training-note">
          This round has not opened yet. Counts start when it opens on{' '}
          {formatDisplayDate(window.start)}.
        </p>
      ) : !figures ? (
        <p className="training-note">
          This snapshot does not carry officer-training counts.
        </p>
      ) : (
        <>
          <ul className="training-kpis">
            {!isDefault && !isAllSeven && (
              <li className="training-kpi">
                <span className="training-kpi__value tabular-nums">
                  {formatPct(figures.pctAtThreshold)}
                </span>
                <span className="training-kpi__label">
                  clubs with {thresholdPhrase(threshold)}
                </span>
              </li>
            )}
            <li
              className={`training-kpi${isDefault ? ' training-kpi--selected' : ''}`}
            >
              <span className="training-kpi__value tabular-nums">
                {formatPct(figures.pctDcp)}
              </span>
              <span className="training-kpi__label">
                clubs with 4+ officers trained (DCP goal 9)
              </span>
            </li>
            <li
              className={`training-kpi${isAllSeven ? ' training-kpi--selected' : ''}`}
            >
              <span className="training-kpi__value tabular-nums">
                {formatPct(figures.pctAllSeven)}
              </span>
              <span className="training-kpi__label">
                clubs with all seven officers trained
              </span>
            </li>
            <li className="training-kpi">
              <span className="training-kpi__value tabular-nums">
                {figures.atThreshold} of {figures.clubs}
              </span>
              <span className="training-kpi__label">
                clubs at {threshold}+ · {figures.shortOneToThree} are 1–3 short
                · {figures.atZero} at 0
              </span>
            </li>
          </ul>

          <table
            className="training-dist"
            aria-label={`${roundName(window.round)}: clubs by officers trained`}
          >
            <thead>
              <tr>
                <th scope="col">Trained</th>
                <th scope="col">Clubs</th>
              </tr>
            </thead>
            <tbody>
              {distribution!.map((count, officers) => {
                const short = threshold - officers
                const tone =
                  officers >= threshold ? 'met' : short <= 3 ? 'short' : 'far'
                return (
                  <tr
                    key={officers}
                    className={`training-dist__row training-dist__row--${tone}`}
                  >
                    <th scope="row" className="training-dist__n tabular-nums">
                      {officers}
                    </th>
                    <td className="training-dist__cell">
                      <span
                        className="training-dist__bar"
                        style={{ width: `${(count / max) * 100}%` }}
                        aria-hidden="true"
                      />
                      <span className="training-dist__count tabular-nums">
                        {count}
                        {tone === 'short' && (
                          <span className="training-dist__flag">
                            {' '}
                            · {short} short
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <p
            className="training-lastyear"
            data-testid={`training-round-${window.round}-lastyear`}
          >
            {lastFigures
              ? `${lastYearLabel(lastYear!)}: ${formatPct(lastFigures.pctAtThreshold)} at ${threshold}+ (${lastFigures.atThreshold} of ${lastFigures.clubs} clubs), ${formatPct(lastFigures.pctAllSeven)} with all seven.`
              : "No snapshot from this point in last year's round to compare with."}
          </p>
        </>
      )}

      <div className="training-curve-wrap">
        <p className="training-curve__title">
          Clubs at {threshold}+ through the round
          <span className="training-curve__legend">
            <span className="training-curve__key training-curve__key--this" />
            {curve.thisYearLabel}
            <span className="training-curve__key training-curve__key--last" />
            {curve.lastYearLabel}
          </span>
        </p>
        {curve.thisYear.length + curve.lastYear.length > 0 && (
          <TrainingCurveChart
            window={window}
            thisYear={curve.thisYear}
            lastYear={curve.lastYear}
            thisYearLabel={curve.thisYearLabel}
            lastYearLabel={curve.lastYearLabel}
          />
        )}
        <p
          className="training-note"
          data-testid={`training-round-${window.round}-curve-note`}
        >
          {curveNote(window, curve.thisYear, curve.lastYear)}
          {curve.thisYear.length > 0 &&
            ` Latest: ${formatPct(curve.thisYear[curve.thisYear.length - 1]!.pct)} on ${formatShortDate(curve.thisYear[curve.thisYear.length - 1]!.date)}.`}
        </p>
      </div>
    </section>
  )
}

export default OfficerTrainingRoundPanel
