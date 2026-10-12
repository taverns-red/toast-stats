/**
 * Data builder for MembershipTrendChart (#1705). Stub — see the tests.
 */

export interface TrendPoint {
  date: string
  count: number
}

export interface PriorYearTrend {
  label: string
  data: TrendPoint[]
}

export interface TrendSeriesPoint extends TrendPoint {
  day: number
  anchor?: boolean
}

export interface TrendSeries {
  key: string
  label: string
  isCurrent: boolean
  inProgress: boolean
  points: TrendSeriesPoint[]
}

export interface TrendChartRow {
  day: number
  [seriesKey: string]: number | undefined
}

export interface MembershipTrendChartData {
  rows: TrendChartRow[]
  series: TrendSeries[]
  domain: [number, number]
}

export function buildMembershipTrendChartData(
  _current: TrendPoint[],
  _priors: PriorYearTrend[],
  _currentProgramYear?: string
): MembershipTrendChartData {
  return { rows: [], series: [], domain: [0, 0] }
}
