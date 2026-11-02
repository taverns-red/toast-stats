/**
 * "Climbed / slipped since last year" preset UI for the Clubs table (#2432):
 * the toolbar select and the feedback line that names the comparison date.
 * The column is in `clubsSinceLastYearColumn`, the comparison in
 * `utils/sinceLastYear`; ClubsTable owns the pipeline step (R11).
 */
import React from 'react'
import { formatLongDate } from '../utils/dateFormatting'
import type {
  PriorYearClubGoals,
  SinceLastYearMode,
  SinceLastYearSummary,
} from '../utils/sinceLastYear'

const MODE_LABELS: Record<SinceLastYearMode, string> = {
  climbed: '▲ Climbed since last year',
  slipped: '▼ Slipped since last year',
  'no-prior': 'No prior-year data',
}

interface SinceLastYearSelectProps {
  mode: SinceLastYearMode | null
  onModeChange: (mode: SinceLastYearMode | null) => void
}

/** Toolbar select — one control for the three modes, compact at 768. */
export const SinceLastYearSelect: React.FC<SinceLastYearSelectProps> = ({
  mode,
  onModeChange,
}) => (
  <select
    className="clubs-filters-trigger clubs-since-select"
    aria-label="DCP goals since last year"
    data-active={mode ? 'true' : undefined}
    value={mode ?? ''}
    onChange={e =>
      onModeChange((e.target.value || null) as SinceLastYearMode | null)
    }
  >
    <option value="">DCP vs last year…</option>
    {(Object.keys(MODE_LABELS) as SinceLastYearMode[]).map(m => (
      <option key={m} value={m}>
        {MODE_LABELS[m]}
      </option>
    ))}
  </select>
)

const plural = (n: number) => `${n} club${n === 1 ? '' : 's'}`

interface SinceLastYearLineProps {
  mode: SinceLastYearMode
  prior: PriorYearClubGoals | undefined
  isError: boolean
  summary: SinceLastYearSummary | null
  shown: number
  total: number
}

/**
 * Feedback line under the toolbar: how many clubs match, against which date,
 * and the full split. A polite live region, like the Close to Distinguished
 * count.
 */
export const SinceLastYearLine: React.FC<SinceLastYearLineProps> = ({
  mode,
  prior,
  isError,
  summary,
  shown,
  total,
}) => {
  let text: React.ReactNode
  if (isError) {
    text =
      'Last year’s DCP goals could not be loaded, so no club is marked as climbed or slipped.'
  } else if (!prior || !summary) {
    text = 'Loading last year’s DCP goals…'
  } else if (prior.comparisonDate === null) {
    text = `No snapshot for this district on or before ${formatLongDate(
      prior.targetDate
    )} in last program year, so all ${plural(total)} have no prior-year data.`
  } else {
    const date = formatLongDate(prior.comparisonDate)
    const note =
      prior.comparisonDate === prior.targetDate
        ? 'the same date last year'
        : `the nearest snapshot before ${formatLongDate(prior.targetDate)}`
    const lead =
      mode === 'no-prior'
        ? `${shown} of ${plural(total)} have no prior-year data to compare with ${date}, ${note}.`
        : `${shown} of ${plural(total)} ${mode} since ${date}, ${note}.`
    text = (
      <>
        {lead}{' '}
        <span className="clubs-since-line__split">
          {summary.climbed} climbed · {summary.slipped} slipped ·{' '}
          {summary.unchanged} unchanged · {summary.noPrior} with no prior-year
          data
        </span>
      </>
    )
  }
  return (
    <p className="clubs-preset-count clubs-since-line" aria-live="polite">
      {text}
    </p>
  )
}
