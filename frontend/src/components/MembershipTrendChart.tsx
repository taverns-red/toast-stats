import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts'
import { LoadingSkeleton } from './LoadingSkeleton'
import { EmptyState } from './ErrorDisplay'
import { formatLongDate, formatShortDate } from '../utils/dateFormatting'
import {
  buildMembershipTrendChartData,
  lastOf,
  pointNearDay,
  type TrendSeries,
} from './membershipTrendChartData'
import { useChartReadout, ChartReadout } from './charts/ChartReadout'

/** A named set of data points for one program year */
export interface YearTrendData {
  label: string
  data: Array<{ date: string; count: number }>
}

interface MembershipTrendChartProps {
  membershipTrend: Array<{ date: string; count: number }>
  isLoading?: boolean
  /** Prior-year trend data for YoY comparison overlay (#238) */
  priorYearTrends?: YearTrendData[] | undefined
  /**
   * The program year `membershipTrend` belongs to, e.g. "2026-2027" (#1705).
   * Passed by the page that owns the PY selector (R3), never inferred from
   * the points. Names the current line and finds the predecessor PY whose
   * 06-30 close anchors it (D15).
   */
  programYear?: string | undefined
}

interface Period {
  start: number
  end: number
  type: 'growth' | 'decline'
}

/** "2026-2027" → "PY 2026–27" */
const shortPyLabel = (label: string): string => {
  const m = /^(\d{4})-\d{2}(\d{2})$/.exec(label)
  return m ? `PY ${m[1]}–${m[2]}` : label
}

/** Legend name: an in-progress current year says how far it runs (#1705). */
const seriesName = (s: TrendSeries): string => {
  const base = shortPyLabel(s.label)
  const last = lastOf(s.points)
  return s.isCurrent && s.inProgress && last
    ? `${base} · to ${formatShortDate(last.date)}`
    : base
}

// Month starts as program-year days (0 = Jul 1) for a non-leap PY. In a leap
// PY the Mar–Jun ticks sit one day early, under a pixel at chart widths.
const MONTH_TICKS: ReadonlyArray<{ day: number; label: string }> = [
  { day: 0, label: 'Jul' },
  { day: 31, label: 'Aug' },
  { day: 62, label: 'Sep' },
  { day: 92, label: 'Oct' },
  { day: 123, label: 'Nov' },
  { day: 153, label: 'Dec' },
  { day: 184, label: 'Jan' },
  { day: 215, label: 'Feb' },
  { day: 243, label: 'Mar' },
  { day: 274, label: 'Apr' },
  { day: 304, label: 'May' },
  { day: 335, label: 'Jun' },
]
const monthLabel = (day: number): string =>
  MONTH_TICKS.find(t => t.day === day)?.label ?? ''

// Prior years are context, not the subject: thin, faint and each with its
// own dash pattern, so they are told apart by pattern and legend label as
// well as by colour (WCAG 1.4.1). The current year is the one solid line.
const PRIOR_YEAR_STYLES = [
  { stroke: 'var(--tm-cool-gray)', dash: '6 4' },
  { stroke: 'var(--tm-true-maroon-80)', dash: '2 3' },
] as const

/**
 * Tooltip (#1705): one line per program year, each with that year's real
 * date and value nearest the hovered position. Built from the series rather
 * than Recharts' payload, because daily current-year points and month-end
 * prior-year points rarely share an exact x.
 */
const TrendTooltip = ({
  active,
  label,
  series,
  periods,
  currentDates,
}: {
  active?: boolean
  label?: number | string
  series: TrendSeries[]
  periods: Period[]
  currentDates: string[]
}) => {
  if (!active || label === undefined || label === '') return null
  const day = Number(label)
  const lines = series.flatMap(s => {
    const p = pointNearDay(s, day)
    return p ? [{ s, p }] : []
  })
  if (lines.length === 0) return null

  const currentPoint = lines.find(l => l.s.isCurrent)?.p
  const pointIndex =
    currentPoint && !currentPoint.anchor
      ? currentDates.indexOf(currentPoint.date)
      : -1
  const period =
    pointIndex >= 0
      ? periods.find(p => pointIndex >= p.start && pointIndex <= p.end)
      : undefined

  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 max-w-[12.5rem] sm:max-w-[16rem]">
      <ul className="space-y-1">
        {lines.map(({ s, p }) => (
          <li
            key={s.key}
            className={`text-sm ${
              s.isCurrent ? 'text-tm-loyal-blue font-semibold' : 'text-gray-700'
            }`}
          >
            {shortPyLabel(s.label)} · {formatLongDate(p.date)}
            {p.anchor ? ' (prior year close)' : ''}: {p.count.toLocaleString()}{' '}
            members
          </li>
        ))}
      </ul>
      {period && (
        <p
          className={`text-xs mt-1 ${
            period.type === 'growth' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {period.type === 'growth' ? '📈 Growth Period' : '📉 Decline Period'}
        </p>
      )}
    </div>
  )
}

export const MembershipTrendChart: React.FC<MembershipTrendChartProps> = ({
  membershipTrend,
  isLoading,
  priorYearTrends,
  programYear,
}) => {
  // Tap-to-pin readout on devices without hover (#1835) — before early returns.
  const readout = useChartReadout()

  if (isLoading) {
    return <LoadingSkeleton variant="chart" />
  }

  if (!membershipTrend || membershipTrend.length === 0) {
    return (
      <EmptyState
        title="No Membership Trend Data"
        message="There isn't enough historical data to display membership trends. Collect more data over time to see trends."
        icon="data"
      />
    )
  }

  // Whole-PY chart data (#1705): every series placed by program-year day,
  // prior years in full, the current year up to its latest point and
  // anchored on the predecessor's 06-30 close (D15).
  const chart = buildMembershipTrendChartData(
    membershipTrend,
    priorYearTrends ?? [],
    programYear
  )
  const currentSeries = chart.series[0]!
  const priorSeries = chart.series.slice(1)

  // Statistics and insights read the current year's OWN points only — never
  // the D15 anchor, which is the prior year's close.
  const sortedData = currentSeries.points.filter(p => !p.anchor)
  const currentDates = sortedData.map(d => d.date)

  // Calculate statistics
  const counts = sortedData.map(d => d.count)
  const maxMembership = Math.max(...counts)
  const minMembership = Math.min(...counts)
  const startMembership = counts[0] ?? 0
  const endMembership = counts[counts.length - 1] ?? 0
  const netChange = endMembership - startMembership
  const percentChange =
    startMembership > 0
      ? ((netChange / startMembership) * 100).toFixed(1)
      : '0.0'

  // Detect growth/decline periods (3+ consecutive increases/decreases)
  const periods: Period[] = []
  let currentPeriod: { start: number; type: 'growth' | 'decline' } | null = null

  for (let i = 1; i < sortedData.length; i++) {
    const current = sortedData[i]
    const previous = sortedData[i - 1]
    if (!current || !previous) continue

    const change = current.count - previous.count
    const type = change > 0 ? 'growth' : change < 0 ? 'decline' : null

    if (type) {
      if (!currentPeriod || currentPeriod.type !== type) {
        if (currentPeriod && i - currentPeriod.start >= 3) {
          periods.push({ ...currentPeriod, end: i - 1 })
        }
        currentPeriod = { start: i - 1, type }
      }
    } else {
      if (currentPeriod && i - currentPeriod.start >= 3) {
        periods.push({ ...currentPeriod, end: i - 1 })
      }
      currentPeriod = null
    }
  }

  if (currentPeriod && sortedData.length - currentPeriod.start >= 3) {
    periods.push({ ...currentPeriod, end: sortedData.length - 1 })
  }

  // Detect seasonal patterns (simple: compare same months across different periods)
  const monthlyAverages: { [key: string]: number[] } = {}
  sortedData.forEach(point => {
    const month = new Date(point.date).getMonth()
    if (!monthlyAverages[month]) {
      monthlyAverages[month] = []
    }
    monthlyAverages[month].push(point.count)
  })

  // Find months with consistent patterns
  const seasonalMonths: Array<{ month: number; pattern: 'high' | 'low' }> = []
  Object.entries(monthlyAverages).forEach(([month, values]) => {
    if (values.length >= 2) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      const overallAvg = counts.reduce((a, b) => a + b, 0) / counts.length
      const deviation = ((avg - overallAvg) / overallAvg) * 100

      if (Math.abs(deviation) > 5) {
        seasonalMonths.push({
          month: parseInt(month),
          pattern: deviation > 0 ? 'high' : 'low',
        })
      }
    }
  })

  const firstDataPoint = sortedData[0]
  const lastDataPoint = sortedData[sortedData.length - 1]

  if (!firstDataPoint || !lastDataPoint) {
    return <div>No data available</div>
  }

  const monthTicks = MONTH_TICKS.map(t => t.day).filter(
    d => d <= chart.domain[1]
  )

  // Screen-reader summary (#1705): the current year AND each prior year,
  // so the comparison is not carried by the drawing alone.
  const priorSummary = priorSeries
    .map(s => {
      const last = lastOf(s.points)
      return last
        ? ` ${shortPyLabel(s.label)} ended at ${last.count.toLocaleString()} members on ${formatLongDate(last.date)}.`
        : ''
    })
    .join('')
  const chartDescription = `Line chart of district membership across the program year, July to June. ${shortPyLabel(currentSeries.label)}: ${startMembership.toLocaleString()} members on ${formatLongDate(firstDataPoint.date)}, ${endMembership.toLocaleString()} on ${formatLongDate(lastDataPoint.date)}, ${netChange >= 0 ? 'up' : 'down'} ${Math.abs(netChange)} (${percentChange}%).${priorSummary}`

  return (
    <div
      className="redesign-panel"
      aria-label="District membership trend chart"
    >
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 font-tm-headline flex items-center">
          District Membership Trend
          <a
            href="/methodology#district-membership-trend"
            aria-label="info"
            title="How is this calculated?"
            className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </h2>
        <p className="text-sm text-gray-600 mt-1 font-tm-body">
          Paid members per snapshot · Source: Toastmasters District Performance
          · Program year July–June, prior years for comparison
        </p>
      </div>

      {/* Statistics Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-tm-loyal-blue-10 rounded-lg p-3 border border-tm-loyal-blue-20">
          <p className="text-xs text-tm-loyal-blue font-medium font-tm-body">
            Current
          </p>
          <p className="text-2xl font-bold text-tm-loyal-blue font-tm-headline">
            {endMembership.toLocaleString()}
          </p>
        </div>
        <div
          className={`rounded-lg p-3 border ${
            netChange >= 0
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <p
            className={`text-xs font-medium font-tm-body ${
              netChange >= 0 ? 'text-green-700' : 'text-red-700'
            }`}
          >
            Net Change
          </p>
          <p
            className={`text-2xl font-bold font-tm-headline ${
              netChange >= 0 ? 'text-green-900' : 'text-red-900'
            }`}
          >
            {netChange >= 0 ? '+' : ''}
            {netChange}
          </p>
          {/* #1023 — name the metric AND baseline so this member-count delta
              can't be read as the Overview "Net Member Change" (a payments-vs-
              payment-base figure). Single text node so the copy is assertable. */}
          <p className="text-xs text-gray-600 mt-1 font-tm-body">
            {`since first snapshot (${formatLongDate(firstDataPoint.date)}) · member counts`}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-700 font-medium font-tm-body">Peak</p>
          <p className="text-2xl font-bold text-gray-900 font-tm-headline">
            {maxMembership.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-700 font-medium font-tm-body">Low</p>
          <p className="text-2xl font-bold text-gray-900 font-tm-headline">
            {minMembership.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Insights */}
      {(periods.length > 0 || seasonalMonths.length > 0) && (
        <div className="mb-6 p-4 bg-tm-loyal-blue-10 border border-tm-loyal-blue-20 rounded-lg">
          <h3 className="text-sm font-semibold text-tm-loyal-blue mb-2 font-tm-headline">
            📊 Insights
          </h3>
          <ul className="space-y-1 text-sm text-tm-loyal-blue-80 font-tm-body">
            {periods.filter(p => p.type === 'growth').length > 0 && (
              <li>
                • {periods.filter(p => p.type === 'growth').length} sustained
                growth period(s) detected
              </li>
            )}
            {periods.filter(p => p.type === 'decline').length > 0 && (
              <li>
                • {periods.filter(p => p.type === 'decline').length} sustained
                decline period(s) detected
              </li>
            )}
            {seasonalMonths.length > 0 && (
              <li>
                • Seasonal patterns detected in {seasonalMonths.length} month(s)
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Chart */}
      <div
        role="img"
        aria-label={chartDescription}
        className="w-full overflow-x-auto"
      >
        <div className="min-w-[320px]">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={chart.rows}
              margin={{ top: 5, right: 20, left: 10, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--tm-cool-gray-20)"
              />
              <XAxis
                dataKey="day"
                type="number"
                domain={chart.domain}
                ticks={monthTicks}
                tickFormatter={monthLabel}
                interval="preserveStartEnd"
                stroke="var(--tm-cool-gray)"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="var(--tm-cool-gray)"
                style={{ fontSize: '12px' }}
                label={{
                  value: 'Total Members',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: '12px' },
                }}
              />
              <Tooltip
                content={
                  <TrendTooltip
                    series={chart.series}
                    periods={periods}
                    currentDates={currentDates}
                  />
                }
                {...readout.tooltipProps}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                verticalAlign="top"
                height={36}
              />

              {/* Prior program years first, so the current line paints on
                  top (#238, #243, #1705). */}
              {priorSeries.map((s, i) => {
                const style =
                  PRIOR_YEAR_STYLES[i % PRIOR_YEAR_STYLES.length] ??
                  PRIOR_YEAR_STYLES[0]
                return (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={style.stroke}
                    strokeWidth={1.5}
                    strokeDasharray={style.dash}
                    strokeOpacity={0.6}
                    dot={false}
                    activeDot={{ r: 3 }}
                    name={seriesName(s)}
                    legendType="plainline"
                    connectNulls
                    isAnimationActive={false}
                  />
                )
              })}

              {/* The current program year: the one solid, heavy line. */}
              <Line
                type="monotone"
                dataKey={currentSeries.key}
                stroke="var(--tm-loyal-blue)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
                name={seriesName(currentSeries)}
                legendType="plainline"
                connectNulls
                isAnimationActive={false}
              />

              {/* Growth / decline period bounds on the current year. */}
              {periods.map((period, index) => {
                const startPoint = sortedData[period.start]
                const endPoint = sortedData[period.end]
                if (!startPoint || !endPoint) return null
                const stroke =
                  period.type === 'growth'
                    ? 'var(--tm-loyal-blue)'
                    : 'var(--tm-true-maroon)'
                return (
                  <React.Fragment key={`${period.type}-${index}`}>
                    <ReferenceLine
                      x={startPoint.day}
                      stroke={stroke}
                      strokeWidth={2}
                      strokeOpacity={0.3}
                    />
                    <ReferenceLine
                      x={endPoint.day}
                      stroke={stroke}
                      strokeWidth={2}
                      strokeOpacity={0.3}
                    />
                  </React.Fragment>
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ChartReadout
        readout={readout}
        labelFormatter={day => `Day ${Number(day) + 1} of the program year`}
      />

      {/* Legend for highlights */}
      {periods.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
          {periods.some(p => p.type === 'growth') && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-green-500"></div>
              <span className="font-tm-body">Growth Period</span>
            </div>
          )}
          {periods.some(p => p.type === 'decline') && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-red-500"></div>
              <span className="font-tm-body">Decline Period</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
