import React, { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useMeetingTimes } from '../hooks/useMeetingTimes'
import {
  RollupPageShell,
  RollupSkeleton,
} from '../components/rollups/RollupPageShell'
import { RollupMeetingHeatmap } from '../components/rollups/RollupMeetingHeatmap'
import { parseMeetingMode, parseMeetingSlot } from '../utils/meetingHeatmap'
import { scopeMeetingTimes } from '../utils/meetingTimesRollup'
import { normaliseRegionId } from '../utils/regionId'

/* /region/:n/meetings (#1814, epic #1781) — when the region's clubs meet:
   the district meeting-time heatmap (#1796) summed over the region's
   districts, from `snapshots/{date}/meeting-times.json`. A routed subpage
   of /region/:n (ADR-005). The page owns program year and date (R3) and
   pins the one query to its date; regions are that program year's own.
   Mode (`?mode=`), cell (`?slot=`) and the district filter (`?district=`)
   are URL state, whitelisted at the parse. Until a date has the file the
   page says "not available yet", never zeros. */

const RegionMeetingsPage: React.FC = () => {
  const { n } = useParams<{ n: string }>()
  const [searchParams] = useSearchParams()
  const region = normaliseRegionId(n) // "1" → "01" (#2130)
  const mode = parseMeetingMode(searchParams.get('mode'))
  const selection = parseMeetingSlot(searchParams.get('slot'))
  const district = searchParams.get('district')
  const controls = useProgramYearControls()
  const { view, isLoading } = useMeetingTimes(controls.effectiveDate)
  const scoped = useMemo(
    () =>
      view
        ? scopeMeetingTimes(view, {
            kind: 'region',
            regionId: region,
            district,
          })
        : null,
    [view, region, district]
  )
  const title = `Region ${region}`
  useDocumentTitle(`${title} Meeting Times`)

  return (
    <RollupPageShell
      title={title}
      eyebrow={`Toastmasters Region ${region} · Meetings`}
      lede={`When the clubs of Region ${region} meet, by weekday and local start hour. Select a cell for its districts.`}
      back={{ label: title, to: `/region/${region}` }}
      trail={[
        { label: 'Regions', to: '/regions' },
        { label: title, to: `/region/${region}` },
        { label: 'Meetings' },
      ]}
      subnavBase={`/region/${region}`}
      controls={controls}
    >
      {isLoading && <RollupSkeleton />}
      {!isLoading && (!scoped || scoped.all.length === 0) && (
        <p className="rollup-page__empty" data-testid="meetings-unavailable">
          {!view
            ? 'Region meeting times are not available yet for this date. They are computed with each snapshot from the clubs’ Find-a-Club listings; earlier dates predate them.'
            : !view.hasRegions
              ? (view.regionMembershipNote ??
                'Region membership is not available for this date.')
              : `Region ${region} is not in the meeting times for this date.`}
        </p>
      )}
      {!isLoading && view && scoped && scoped.all.length > 0 && (
        <RollupMeetingHeatmap
          scoped={scoped}
          unreadable={view.unreadable}
          mode={mode}
          selection={selection}
        />
      )}
    </RollupPageShell>
  )
}

export default RegionMeetingsPage
