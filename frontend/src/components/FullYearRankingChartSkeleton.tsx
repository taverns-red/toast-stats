import React from 'react'
import type { HistoricalRankPoint } from '../types/districts'
import type { ProgramYear } from '../utils/programYear'
import { ChartSkeleton } from './ChartSkeleton'
import { TOUCH_QUERY } from './charts/ChartReadout'
import { useMediaQuery } from '../hooks/useMediaQuery'

/* The Ranking Progression chart's chrome and loading state (#1835).
 *
 * Split from the chart so the lazy wrapper can paint the loading state as
 * its chunk fallback without pulling Recharts into the route's static graph;
 * the chunk landing then moves nothing (Lesson 158, the #1926 pattern). */

/** The plot's height — the loading state reserves the same (#1835). */
export const PLOT_HEIGHT = 400

/**
 * Rank metric types for the chart
 */
export type RankMetric = 'aggregate' | 'clubs' | 'payments' | 'distinguished'

/**
 * Metric configuration for display labels and chart settings
 */
export interface MetricConfig {
  label: string
  shortLabel: string
  dataKey: keyof HistoricalRankPoint
  description: string
}

export const METRIC_CONFIG: Record<RankMetric, MetricConfig> = {
  aggregate: {
    label: 'Overall Rank',
    shortLabel: 'Overall',
    dataKey: 'overallRank',
    description: 'Overall ranking position based on aggregate score (1 = best)',
  },
  clubs: {
    label: 'Paid Clubs Rank',
    shortLabel: 'Clubs',
    dataKey: 'clubsRank',
    description: 'Ranking based on paid club count relative to base',
  },
  payments: {
    label: 'Membership Payments Rank',
    shortLabel: 'Payments',
    dataKey: 'paymentsRank',
    description: 'Ranking based on total membership payments relative to base',
  },
  distinguished: {
    label: 'Distinguished Clubs Rank',
    shortLabel: 'Distinguished',
    dataKey: 'distinguishedRank',
    description:
      'Ranking based on percentage of clubs achieving distinguished status',
  },
}

const METRICS: readonly RankMetric[] = [
  'aggregate',
  'clubs',
  'payments',
  'distinguished',
]

/**
 * Metric toggle button component
 */
interface MetricToggleButtonProps {
  metric: RankMetric
  selectedMetric: RankMetric
  onSelect: (metric: RankMetric) => void
}

const MetricToggleButton: React.FC<MetricToggleButtonProps> = ({
  metric,
  selectedMetric,
  onSelect,
}) => {
  const isSelected = metric === selectedMetric
  const config = METRIC_CONFIG[metric]

  return (
    <button
      onClick={() => onSelect(metric)}
      className={
        'districts-toolbar__sort-btn' +
        (isSelected ? ' districts-toolbar__sort-btn--active' : '')
      }
      style={{ minHeight: 44 }}
      aria-pressed={isSelected}
      aria-label={`View ${config.label}`}
    >
      {config.shortLabel}
    </button>
  )
}

/**
 * Heading, program year and metric toggles — shared by the loaded chart and
 * its loading state, so the skeleton has the loaded chrome (#1835).
 */
export const ChartHeader: React.FC<{
  programYear: ProgramYear
  selectedMetric: RankMetric
  onMetricChange: (metric: RankMetric) => void
}> = ({ programYear, selectedMetric, onMetricChange }) => (
  <div className="flex flex-col gap-4 mb-4">
    <div className="flex-1">
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 font-tm-headline">
        Ranking Progression
      </h2>
      <p className="text-sm text-gray-600 font-tm-body mt-1">
        Program Year: {programYear.label} ({programYear.startDate} to{' '}
        {programYear.endDate})
      </p>
    </div>

    {/* Metric Toggle */}
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Select ranking metric"
    >
      <span className="text-sm font-medium text-gray-600 font-tm-body self-center mr-2">
        View:
      </span>
      {METRICS.map(metric => (
        <MetricToggleButton
          key={metric}
          metric={metric}
          selectedMetric={selectedMetric}
          onSelect={onMetricChange}
        />
      ))}
    </div>
  </div>
)

/**
 * Loading state: the loaded panel with only the plot replaced (#1835,
 * Lesson 158) — same chrome, a 400 px plot placeholder and, without hover,
 * the readout line — so the chart lands without a shift. The chart's
 * `isLoading` state and its lazy chunk fallback both render it.
 */
export const FullYearRankingChartSkeleton: React.FC<{
  programYear: ProgramYear
  selectedMetric: RankMetric
  onMetricChange: (metric: RankMetric) => void
}> = header => {
  const touch = useMediaQuery(TOUCH_QUERY)
  return (
    <section
      className="redesign-panel sm:p-6"
      aria-busy="true"
      aria-label="Loading ranking progression chart"
    >
      <ChartHeader {...header} />
      <ChartSkeleton height={PLOT_HEIGHT} />
      {touch && (
        <p className="chart-readout" data-testid="chart-readout-reserve">
          &nbsp;
        </p>
      )}
    </section>
  )
}
