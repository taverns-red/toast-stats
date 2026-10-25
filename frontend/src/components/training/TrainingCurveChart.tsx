import React from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { OfficerTrainingRoundWindow } from '@taverns-red/analytics-core'
import { dayOfRound } from '@taverns-red/analytics-core'
import type { CurvePoint } from '../../utils/officerTraining'
import { formatShortDate } from '../../utils/dateFormatting'

/* Officer-training progress curve (#2296): % of clubs at or above the
   threshold on each published date of a round, this program year against
   last, aligned by day of the round so the same calendar day sits at the
   same x. Legacy palette (#2080): this year in --tm-loyal-blue, last year a
   dashed --tm-cool-gray. Points are dots joined by a line; a gap in the
   record is a straight segment between real points, never an invented one.
   The figures are also printed below the chart (it is aria-hidden). */

interface TrainingCurveChartProps {
  window: OfficerTrainingRoundWindow
  thisYear: readonly CurvePoint[]
  lastYear: readonly CurvePoint[]
  thisYearLabel: string
  lastYearLabel: string
}

interface Row {
  day: number
  thisYear?: number
  lastYear?: number
}

export const TrainingCurveChart: React.FC<TrainingCurveChartProps> = ({
  window,
  thisYear,
  lastYear,
  thisYearLabel,
  lastYearLabel,
}) => {
  const length = dayOfRound(window, window.end)
  const byDay = new Map<number, Row>()
  for (const p of thisYear) {
    byDay.set(p.day, {
      ...(byDay.get(p.day) ?? { day: p.day }),
      thisYear: p.pct,
    })
  }
  for (const p of lastYear) {
    byDay.set(p.day, {
      ...(byDay.get(p.day) ?? { day: p.day }),
      lastYear: p.pct,
    })
  }
  const rows = [...byDay.values()].sort((a, b) => a.day - b.day)

  // Month-start ticks, labelled with this round's own calendar days.
  const ticks: number[] = []
  const start = Date.parse(`${window.start}T00:00:00Z`)
  for (let day = 0; day <= length; day++) {
    if (new Date(start + day * 86_400_000).getUTCDate() === 1) ticks.push(day)
  }
  const dateOf = (day: number) =>
    new Date(start + day * 86_400_000).toISOString().slice(0, 10)

  return (
    <div className="training-curve" aria-hidden="true">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: -12 }}
        >
          <CartesianGrid stroke="var(--tm-cool-gray-20)" vertical={false} />
          <XAxis
            dataKey="day"
            type="number"
            domain={[0, length]}
            ticks={ticks}
            tickFormatter={day => formatShortDate(dateOf(day))}
            stroke="var(--tm-cool-gray)"
            fontSize={12}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={v => `${v}%`}
            stroke="var(--tm-cool-gray)"
            fontSize={12}
          />
          <Tooltip
            formatter={(value, name) => [
              `${Math.round(Number(value))}%`,
              name === 'thisYear' ? thisYearLabel : lastYearLabel,
            ]}
            labelFormatter={day => formatShortDate(dateOf(Number(day)))}
          />
          <Line
            dataKey="lastYear"
            stroke="var(--tm-cool-gray)"
            strokeDasharray="6 4"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            dataKey="thisYear"
            stroke="var(--tm-loyal-blue)"
            strokeWidth={2.5}
            dot={{ r: 2.5 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default TrainingCurveChart
