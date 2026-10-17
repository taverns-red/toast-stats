import React from 'react'
import { Sparkline } from './Sparkline'
import { CLUB_TREND_HEIGHT, CLUB_TREND_WIDTH } from './ClubTrendSparkline'
import { describeDistrictTrend } from '../utils/districtTrendSeries'

/* A district's program-year membership sparkline (#1815) — the district
   counterpart of the Clubs-table trend (#1792), same 60×16 primitive and
   class. `undefined` = still loading (reserve the box, no line); `null` or
   an empty series = no trend for this date, said in words, never a fake
   flat line. */
export const DistrictTrendSparkline: React.FC<{
  series: number[] | null | undefined
}> = ({ series }) => {
  if (series === undefined)
    return <span className="club-trend-sparkline" aria-hidden="true" />
  if (series === null || series.length === 0)
    return (
      <span className="club-trend-sparkline district-trend--none">
        <span className="sr-only">{describeDistrictTrend([])}</span>
        <span aria-hidden="true">—</span>
      </span>
    )
  return (
    <Sparkline
      data={series}
      width={CLUB_TREND_WIDTH}
      height={CLUB_TREND_HEIGHT}
      ariaLabel={describeDistrictTrend(series)}
      className="club-trend-sparkline"
    />
  )
}

export default DistrictTrendSparkline
