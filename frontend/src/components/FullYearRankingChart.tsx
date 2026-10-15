import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { RankHistoryResponse } from '../types/districts'
import type { ProgramYear } from '../utils/programYear'
import { formatLongDate, parseLocalDate } from '../utils/dateFormatting'
import { useIsMobile } from '../hooks/useIsMobile'
import { dateAxisLayout } from './charts/compactAxis'
import {
  useChartReadout,
  ChartReadout,
  formatReadoutDate,
} from './charts/ChartReadout'
import {
  ChartHeader,
  FullYearRankingChartEmpty,
  FullYearRankingChartSkeleton,
  PLOT_HEIGHT,
} from './FullYearRankingChartSkeleton'
import { METRIC_CONFIG, type RankMetric } from './fullYearRankingMetrics'

export type { RankMetric }

/**
 * Props for the FullYearRankingChart component
 */
export interface FullYearRankingChartProps {
  /** Rank history data for the selected program year */
  data: RankHistoryResponse | null
  /** Currently selected metric to display */
  selectedMetric: RankMetric
  /** Callback when metric selection changes */
  onMetricChange: (metric: RankMetric) => void
  /** Whether data is currently loading */
  isLoading: boolean
  /** The program year being displayed */
  programYear: ProgramYear
}

/**
 * Tooltip payload type for recharts
 */
interface TooltipPayload {
  dataKey: string
  value: number
  color: string
  payload: ChartDataPoint
}

/**
 * Chart data point structure
 */
interface ChartDataPoint {
  date: string
  value: number
}

/**
 * Custom tooltip component for the chart
 */
interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
  selectedMetric: RankMetric
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  selectedMetric,
}) => {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const dataPoint = payload[0]
  if (!dataPoint) {
    return null
  }

  // Use the label (date) from recharts, or fall back to payload data
  const dateToFormat = label || dataPoint.payload?.date
  const formattedDate = dateToFormat
    ? formatLongDate(dateToFormat)
    : 'Unknown date'
  const metricConfig = METRIC_CONFIG[selectedMetric]

  // Get the value - it could be in dataPoint.value or dataPoint.payload.value
  const value = dataPoint.value ?? dataPoint.payload?.value ?? 0

  return (
    <div
      className="redesign-panel"
      style={{ minWidth: 180, padding: 12 }}
      role="tooltip"
    >
      <p className="text-sm font-medium text-gray-900 mb-1 whitespace-nowrap">
        {formattedDate}
      </p>
      <p className="text-sm whitespace-nowrap" style={{ color: 'var(--link)' }}>
        {metricConfig.shortLabel}: Rank #{value}
      </p>
    </div>
  )
}

/**
 * FullYearRankingChart Component
 *
 * Displays a line chart showing ranking progression throughout a program year.
 * Extends the HistoricalRankChart pattern with:
 * - Metric toggle (Overall/Clubs/Payments/Distinguished)
 * - Inverted Y-axis (rank 1 at top)
 * - Tooltip showing exact rank and date on hover
 * - Toastmasters brand colors
 * - Accessibility features (aria-label, screen reader description)
 * - Horizontal scroll for mobile viewports
 *
 * @example
 * ```tsx
 * <FullYearRankingChart
 *   data={rankHistory}
 *   selectedMetric="clubs"
 *   onMetricChange={setSelectedMetric}
 *   isLoading={false}
 *   programYear={currentProgramYear}
 * />
 * ```
 */
const FullYearRankingChart: React.FC<FullYearRankingChartProps> = ({
  data,
  selectedMetric,
  onMetricChange,
  isLoading,
  programYear,
}) => {
  // Tap-to-pin readout on devices without hover (#1835) — before early returns.
  const readout = useChartReadout()
  // Phone x axis: four horizontal ticks, no −45° labels (#1835).
  const compact = useIsMobile(768)
  // Show loading skeleton while data is being fetched
  if (isLoading) {
    return (
      <FullYearRankingChartSkeleton
        programYear={programYear}
        selectedMetric={selectedMetric}
        onMetricChange={onMetricChange}
      />
    )
  }

  // Show empty state if no data
  if (!data || data.history.length === 0) {
    return <FullYearRankingChartEmpty programYear={programYear} />
  }

  const metricConfig = METRIC_CONFIG[selectedMetric]

  // Sort history chronologically
  const sortedHistory = [...data.history].sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  // Transform data for the chart
  const chartData: ChartDataPoint[] = sortedHistory.map(point => ({
    date: point.date,
    value: point[metricConfig.dataKey] as number,
  }))

  // Generate accessible description
  const chartDescription = generateChartDescription(
    data,
    selectedMetric,
    programYear,
    chartData
  )

  return (
    <section
      className="redesign-panel sm:p-6"
      aria-label="Full year ranking progression chart"
    >
      <ChartHeader
        programYear={programYear}
        selectedMetric={selectedMetric}
        onMetricChange={onMetricChange}
      />

      {/* Chart container with horizontal scroll for mobile */}
      <div
        role="img"
        {...readout.surfaceProps}
        aria-label={chartDescription}
        aria-describedby="full-year-rank-chart-desc"
        className="w-full overflow-x-auto"
      >
        {/* The desktop min-width; a phone sheet is narrower (#1835). */}
        <div className={compact ? undefined : 'min-w-[320px]'}>
          <ResponsiveContainer
            width="100%"
            height={PLOT_HEIGHT}
            minWidth={compact ? 0 : 320}
          >
            <LineChart
              {...readout.chartProps}
              data={chartData}
              margin={{
                top: 5,
                right: compact ? 16 : 10,
                left: 0,
                bottom: compact ? 5 : 60,
              }}
              aria-hidden="true"
              // The wrapper is the accessible role="img"; Recharts' default
              // layer would put tabindex=0 inside aria-hidden (#1660).
              accessibilityLayer={false}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--tm-cool-gray-20)"
              />
              <XAxis
                dataKey="date"
                stroke="var(--tm-cool-gray)"
                style={{ fontSize: '12px' }}
                {...dateAxisLayout(
                  compact,
                  chartData.map(d => d.date)
                )}
                tickFormatter={value => {
                  const date = parseLocalDate(value)
                  return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                }}
              />
              <YAxis
                stroke="var(--tm-cool-gray)"
                style={{ fontSize: '12px' }}
                width={50}
                reversed={true}
                domain={['dataMin', 'dataMax'] as const}
                label={{
                  value: 'Rank (1 = best)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: '12px' },
                }}
              />
              <Tooltip
                content={<CustomTooltip selectedMetric={selectedMetric} />}
                {...readout.tooltipProps}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--tm-loyal-blue)"
                strokeWidth={2}
                dot={{
                  fill: 'var(--tm-loyal-blue)',
                  r: 0.3,
                }}
                activeDot={{
                  r: 6,
                  fill: 'var(--tm-loyal-blue)',
                  stroke: 'var(--tm-white)',
                  strokeWidth: 2,
                }}
                name={metricConfig.label}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ChartReadout readout={readout} labelFormatter={formatReadoutDate} />

      {/* Screen reader accessible description */}
      <p id="full-year-rank-chart-desc" className="sr-only">
        {chartDescription}
      </p>
    </section>
  )
}

/**
 * Generate an accessible description of the chart for screen readers
 */
function generateChartDescription(
  data: RankHistoryResponse,
  selectedMetric: RankMetric,
  programYear: ProgramYear,
  chartData: ChartDataPoint[]
): string {
  const metricConfig = METRIC_CONFIG[selectedMetric]
  const dataPointCount = chartData.length

  if (dataPointCount === 0) {
    return `No ${metricConfig.label} data available for ${data.districtName} in the ${programYear.label} program year.`
  }

  const firstPoint = chartData[0]
  const lastPoint = chartData[dataPointCount - 1]

  if (!firstPoint || !lastPoint) {
    return `${metricConfig.label} chart for ${data.districtName} in the ${programYear.label} program year.`
  }

  // Calculate trend
  const startValue = firstPoint.value
  const endValue = lastPoint.value
  const change = endValue - startValue

  // All metrics are now rank-based (#89), lower rank is better
  let trendDescription: string
  if (change < 0) {
    trendDescription = `improved from rank ${startValue} to rank ${endValue}`
  } else if (change > 0) {
    trendDescription = `declined from rank ${startValue} to rank ${endValue}`
  } else {
    trendDescription = `remained at rank ${startValue}`
  }

  return `Line chart showing ${metricConfig.label} progression for ${data.districtName} over the ${programYear.label} program year. The chart contains ${dataPointCount} data points. The district ${trendDescription}. The rank is displayed on the Y-axis with rank 1 at the top, and dates are shown on the X-axis.`
}

export default FullYearRankingChart
