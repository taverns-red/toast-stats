import React from 'react'
import { ChartSkeleton } from './ChartSkeleton'
import { TOUCH_QUERY } from './charts/ChartReadout'
import { useMediaQuery } from '../hooks/useMediaQuery'

/* The Historical Rank Progression chart's chrome and loading state (#1835).
 *
 * Split from the chart so the lazy wrapper can paint the loading state as
 * its chunk fallback without pulling Recharts into the route's static graph;
 * the chunk landing then moves nothing (Lesson 158, the #1926 pattern). */

export type RankMetric = 'aggregate' | 'clubs' | 'payments' | 'distinguished'

/** The plot's height — the loading state reserves the same (#1835). */
export const PLOT_HEIGHT = 400

export type ProgramYearLabel = {
  year: string | number
  startDate: string
  endDate: string
}

const METRIC_BUTTONS: ReadonlyArray<{ metric: RankMetric; label: string }> = [
  { metric: 'aggregate', label: 'Overall Score' },
  { metric: 'clubs', label: 'Paid Clubs' },
  { metric: 'payments', label: 'Total Payments' },
  { metric: 'distinguished', label: 'Distinguished' },
]

/**
 * Heading, program year and metric toggles — shared by the loaded chart and
 * its loading state, so the skeleton has the loaded chrome (#1835).
 */
export const RankChartHeader: React.FC<{
  programYear: ProgramYearLabel | undefined
  selectedMetric: RankMetric
  onSelect: (metric: RankMetric) => void
  disabled?: boolean
}> = ({ programYear, selectedMetric, onSelect, disabled = false }) => (
  <div className="flex flex-col gap-4 mb-4">
    <div className="flex-1">
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
        Historical Rank Progression
      </h2>
      {programYear && (
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Program Year: {programYear.year} ({programYear.startDate} to{' '}
          {programYear.endDate})
        </p>
      )}
    </div>

    {/* Metric Toggle */}
    <div className="flex flex-wrap gap-2">
      <span className="text-sm font-medium text-gray-700 self-center mr-2">
        View:
      </span>
      {METRIC_BUTTONS.map(({ metric, label }) => (
        <button
          key={metric}
          onClick={() => onSelect(metric)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors font-tm-body ${
            selectedMetric === metric
              ? 'bg-tm-loyal-blue text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
          disabled={disabled}
          aria-pressed={selectedMetric === metric}
        >
          {label}
        </button>
      ))}
    </div>
  </div>
)

const noop = () => {}

/**
 * The loaded panel with only the plot replaced (Lesson 158): same chrome,
 * one legend-chip row, the 400 px plot and, without hover, the readout line.
 * The chart's `isLoading` state and its lazy chunk fallback both render it.
 */
export const HistoricalRankChartSkeleton: React.FC<{
  programYear: ProgramYearLabel | undefined
  selectedMetric?: RankMetric
}> = ({ programYear, selectedMetric = 'aggregate' }) => {
  // Without hover the loaded chart carries the readout line under the plot.
  const touch = useMediaQuery(TOUCH_QUERY)
  return (
    <section
      className="redesign-panel sm:p-6"
      aria-busy="true"
      aria-label="Loading historical rank data"
    >
      <RankChartHeader
        programYear={programYear}
        selectedMetric={selectedMetric}
        onSelect={noop}
        disabled
      />
      <div className="chart-legend-chips" aria-hidden="true">
        <span className="chart-legend-chip chart-legend-chip--static">
          &nbsp;
        </span>
      </div>
      <ChartSkeleton height={PLOT_HEIGHT} />
      {touch && (
        <p className="chart-readout" data-testid="chart-readout-reserve">
          &nbsp;
        </p>
      )}
    </section>
  )
}

/** Stub (#1835 red): the chunk fallback for every pre-data state. */
export const HistoricalRankChartFallback: React.FC<{
  data: unknown[]
  isLoading: boolean
  isError: boolean
  error?: Error | null
  selectedProgramYear?: ProgramYearLabel
}> = () => null
