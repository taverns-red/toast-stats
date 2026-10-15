import React, { useState } from 'react'
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
import { formatLongDate, parseLocalDate } from '../utils/dateFormatting'
import { useResponsiveTickInterval } from '../hooks/useResponsiveChartTicks'
import { useIsMobile } from '../hooks/useIsMobile'
import { dateAxisLayout } from './charts/compactAxis'
import {
  HistoricalRankChartEmpty,
  HistoricalRankChartError,
  HistoricalRankChartSkeleton,
  PLOT_HEIGHT,
  RankChartHeader,
  type RankMetric,
} from './HistoricalRankChartSkeleton'
import {
  useChartReadout,
  ChartReadout,
  formatReadoutDate,
} from './charts/ChartReadout'
import {
  ChartLegendChips,
  useSeriesVisibility,
} from './charts/ChartLegendChips'

interface HistoricalRankChartProps {
  data: RankHistoryResponse[]
  isLoading: boolean
  isError: boolean
  error?: Error | null
  /** Override program year label (prevents stale label from cached data) */
  selectedProgramYear?: {
    year: string | number
    startDate: string
    endDate: string
  }
}

interface TooltipPayload {
  dataKey: string
  value: number
  color: string
}

// Custom tooltip moved outside render
const CustomTooltip = ({
  active,
  payload,
  data,
  selectedMetric,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  data: RankHistoryResponse[]
  selectedMetric: RankMetric
}) => {
  if (active && payload && payload.length) {
    const date = (payload[0] as unknown as { payload: { date: string } })
      .payload.date
    const formattedDate = formatLongDate(date)

    return (
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 max-w-xs">
        <p className="text-sm font-medium text-gray-900 mb-2">
          {formattedDate}
        </p>
        {payload.map((entry: TooltipPayload, index: number) => {
          const districtData = data.find(d => d.districtId === entry.dataKey)
          return (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              <span className="font-semibold">
                {districtData?.districtName || entry.dataKey}:
              </span>{' '}
              {selectedMetric === 'aggregate'
                ? `Score ${Math.round(entry.value)}`
                : `Rank #${entry.value}`}
            </p>
          )
        })}
      </div>
    )
  }
  return null
}

const DISTRICT_COLORS = [
  'var(--tm-loyal-blue)', // Primary data series - TM Loyal Blue
  'var(--tm-true-maroon)', // Secondary data series - TM True Maroon
  'var(--tm-cool-gray)', // Tertiary data series - TM Cool Gray
  'var(--tm-happy-yellow)', // Accent data series - TM Happy Yellow
  'var(--tm-loyal-blue-80)', // Additional series with opacity
  'var(--tm-true-maroon-80)', // Additional series with opacity
  'var(--tm-cool-gray-80)', // Additional series with opacity
  'var(--tm-happy-yellow-80)', // Additional series with opacity
]

const HistoricalRankChart: React.FC<HistoricalRankChartProps> = ({
  data,
  isLoading,
  isError,
  error,
  selectedProgramYear,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<RankMetric>('aggregate')
  // Tap-to-pin readout on devices without hover (#1835) — before early returns.
  const readout = useChartReadout()
  // Legend chips toggle each district's line (#1835).
  const legend = useSeriesVisibility()
  // Phone x axis: four horizontal ticks, no −45° labels (#1835).
  const compact = useIsMobile(768)
  // Responsive tick interval for mobile (#237) — must be called before early returns
  const tickInterval = useResponsiveTickInterval(
    data?.reduce((count, d) => count + d.history.length, 0) ?? 0
  )

  if (isLoading) {
    // The same markup as the lazy chunk fallback (#1835).
    return (
      <HistoricalRankChartSkeleton
        programYear={selectedProgramYear}
        selectedMetric={selectedMetric}
      />
    )
  }

  if (isError) {
    return <HistoricalRankChartError error={error} />
  }

  if (!data || data.length === 0) {
    return <HistoricalRankChartEmpty />
  }

  // Use selectedProgramYear prop if provided, fall back to data (#232)
  const programYear = selectedProgramYear ?? data[0]?.programYear

  // Combine all dates from all districts
  const allDates = new Set<string>()
  data.forEach(district => {
    district.history.forEach(point => {
      allDates.add(point.date)
    })
  })

  // Sort dates chronologically
  const sortedDates = Array.from(allDates).sort()

  // Transform data for chart
  const chartData = sortedDates.map(date => {
    const dataPoint: Record<string, string | number> = { date }

    data.forEach(district => {
      const point = district.history.find(p => p.date === date)
      if (point) {
        let value: number
        switch (selectedMetric) {
          case 'clubs':
            value = point.clubsRank
            break
          case 'payments':
            value = point.paymentsRank
            break
          case 'distinguished':
            value = point.distinguishedRank
            break
          default:
            value = point.aggregateScore
        }
        dataPoint[district.districtId] = value
      }
    })

    return dataPoint
  })

  // Generate chart description for accessibility
  const metricLabel = {
    aggregate: 'Overall Score',
    clubs: 'Paid Clubs Rank',
    payments: 'Total Payments Rank',
    distinguished: 'Distinguished Clubs Rank',
  }[selectedMetric]

  const chartDescription = `Line chart showing ${metricLabel} progression for ${data.length} district${data.length !== 1 ? 's' : ''} over the program year from ${programYear?.startDate || 'July 1'} to ${programYear?.endDate || 'June 30'}.`

  return (
    <section
      className="redesign-panel sm:p-6"
      aria-label="Historical rank progression chart"
    >
      <RankChartHeader
        programYear={programYear}
        selectedMetric={selectedMetric}
        onSelect={setSelectedMetric}
      />

      <ChartLegendChips
        series={data.map((district, index) => ({
          key: district.districtId,
          name: district.districtName || district.districtId,
          color:
            DISTRICT_COLORS[index % DISTRICT_COLORS.length] ??
            'var(--tm-loyal-blue)',
        }))}
        visibility={legend}
      />
      <div
        role="img"
        {...readout.surfaceProps}
        aria-label={chartDescription}
        aria-describedby="rank-chart-desc"
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
                  sortedDates,
                  tickInterval || 'preserveStartEnd'
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
                reversed={selectedMetric !== 'aggregate'}
                label={
                  selectedMetric === 'aggregate'
                    ? {
                        value: 'Score (lower is better)',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: '12px' },
                      }
                    : {
                        value: 'Rank (lower is better)',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: '12px' },
                      }
                }
              />
              <Tooltip
                content={
                  <CustomTooltip data={data} selectedMetric={selectedMetric} />
                }
                {...readout.tooltipProps}
              />
              {data.map((district, index) => {
                const color =
                  DISTRICT_COLORS[index % DISTRICT_COLORS.length] ??
                  'var(--tm-loyal-blue)'
                return (
                  <Line
                    key={district.districtId}
                    type="monotone"
                    dataKey={district.districtId}
                    stroke={color}
                    strokeWidth={2}
                    dot={{
                      fill: color,
                      r: 0.3,
                    }}
                    activeDot={{ r: 0.5 }}
                    name={district.districtId}
                    hide={!legend.isVisible(district.districtId)}
                    connectNulls
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ChartReadout
        readout={readout}
        labelFormatter={formatReadoutDate}
        nameFormatter={id =>
          data.find(d => d.districtId === id)?.districtName ?? id
        }
      />
      <p id="rank-chart-desc" className="sr-only">
        {chartDescription}
      </p>
    </section>
  )
}

export default HistoricalRankChart
