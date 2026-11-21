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
import { ALL_TIED_MESSAGE, isRankTied } from '../utils/rankTies'
import { formatLongDate, parseLocalDate } from '../utils/dateFormatting'
import { AllTiedPlot } from './charts/AllTiedPlot'
import { useResponsiveTickInterval } from '../hooks/useResponsiveChartTicks'
import { useIsMobile } from '../hooks/useIsMobile'
import { dateAxisLayout } from './charts/compactAxis'
import { AXIS_TICK, AXIS_LABEL_STYLE } from './charts/chartAxis'
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
  type ChartReading,
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
  value: number | null | undefined
  color: string
  hide?: boolean
}

// Custom tooltip moved outside render
const CustomTooltip = ({
  active,
  payload,
  data,
  selectedMetric,
  isTied,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  data: RankHistoryResponse[]
  selectedMetric: RankMetric
  isTied: (districtId: string, date: string) => boolean
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
          const tied = isTied(entry.dataKey, date)
          if (entry.hide === true || (entry.value == null && !tied)) {
            return null
          }
          const districtData = data.find(d => d.districtId === entry.dataKey)
          return (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              <span className="font-semibold">
                {districtData?.districtName || entry.dataKey}:
              </span>{' '}
              {tied
                ? 'Tied'
                : selectedMetric === 'aggregate'
                  ? `Score ${Math.round(entry.value ?? 0)}`
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

const districtColor = (index: number): string =>
  DISTRICT_COLORS[index % DISTRICT_COLORS.length] ?? 'var(--tm-loyal-blue)'

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

  // The overall line plots the score, not a rank, so only a category is
  // left out on a date every district is tied in.
  const tiedKeys = new Set<string>()
  const isTied = (districtId: string, date: string): boolean =>
    tiedKeys.has(`${districtId}|${date}`)

  // Transform data for chart
  const chartData = sortedDates.map(date => {
    const dataPoint: Record<string, string | number | null> = { date }

    data.forEach(district => {
      const point = district.history.find(p => p.date === date)
      if (
        point &&
        selectedMetric !== 'aggregate' &&
        isRankTied(point, selectedMetric)
      ) {
        tiedKeys.add(`${district.districtId}|${date}`)
        dataPoint[district.districtId] = null
      } else if (point) {
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

  // The Overall Score is never left out, so only a category can be all tied.
  const allTied =
    tiedKeys.size > 0 &&
    chartData.every(row => data.every(d => row[d.districtId] == null))

  // The phone readout drops null values, so a tied date would show only
  // its date; describe it as the desktop tooltip does.
  const describeTiedReading = (label: string): ChartReading | null => {
    const rows = data.flatMap((district, index) =>
      legend.isVisible(district.districtId) &&
      isTied(district.districtId, label)
        ? [
            {
              key: district.districtId,
              name: district.districtId,
              value: 'Tied',
              color: districtColor(index),
            },
          ]
        : []
    )
    return rows.length > 0 ? { label: formatReadoutDate(label), rows } : null
  }

  // Generate chart description for accessibility
  const metricLabel = {
    aggregate: 'Overall Score',
    clubs: 'Paid Clubs Rank',
    payments: 'Total Payments Rank',
    distinguished: 'Distinguished Clubs Rank',
  }[selectedMetric]

  const chartDescription = `Line chart showing ${metricLabel} progression for ${data.length} district${data.length !== 1 ? 's' : ''} over the program year from ${programYear?.startDate || 'July 1'} to ${programYear?.endDate || 'June 30'}.${allTied ? ` ${ALL_TIED_MESSAGE}` : ''}`

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
          color: districtColor(index),
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
          {allTied ? (
            <AllTiedPlot height={PLOT_HEIGHT} />
          ) : (
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
                  tick={AXIS_TICK}
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
                  tick={AXIS_TICK}
                  allowDecimals={false}
                  width={50}
                  reversed={selectedMetric !== 'aggregate'}
                  label={
                    selectedMetric === 'aggregate'
                      ? {
                          value: 'Score (higher is better)',
                          angle: -90,
                          position: 'insideLeft',
                          style: AXIS_LABEL_STYLE,
                        }
                      : {
                          value: 'Rank (lower is better)',
                          angle: -90,
                          position: 'insideLeft',
                          style: AXIS_LABEL_STYLE,
                        }
                  }
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      data={data}
                      selectedMetric={selectedMetric}
                      isTied={isTied}
                    />
                  }
                  // Keep tied districts, whose value is null, so they read
                  // "Tied"; the tooltip drops other empty and hidden entries.
                  filterNull={false}
                  {...readout.tooltipProps}
                />
                {data.map((district, index) => {
                  const color = districtColor(index)
                  return (
                    <Line
                      key={district.districtId}
                      // Integer ranks: a spline would draw dips that never happened.
                      type="linear"
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
          )}
        </div>
      </div>
      <ChartReadout
        readout={readout}
        labelFormatter={formatReadoutDate}
        describe={describeTiedReading}
        // An all-tied chart has nothing to tap; the empty line keeps its height.
        {...(allTied ? { hint: '' } : {})}
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
