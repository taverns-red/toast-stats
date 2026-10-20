import React, { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
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

/* /regions/meetings (#1814, epic #1781) — when clubs meet worldwide: the
   district meeting-time heatmap (#1796) summed over every district, from
   `snapshots/{date}/meeting-times.json`, broken down and filterable by
   region (`?region=`). A routed subpage of /regions (ADR-005); the page
   owns program year and date (R3). Until a date has the file the page says
   "not available yet", never zeros. */

const WorldMeetingsPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const mode = parseMeetingMode(searchParams.get('mode'))
  const selection = parseMeetingSlot(searchParams.get('slot'))
  const region = searchParams.get('region')
  const controls = useProgramYearControls()
  const { view, isLoading } = useMeetingTimes(controls.effectiveDate)
  const scoped = useMemo(
    () => (view ? scopeMeetingTimes(view, { kind: 'world', region }) : null),
    [view, region]
  )
  useDocumentTitle('Worldwide Meeting Times')

  return (
    <RollupPageShell
      title="Regions"
      eyebrow="Worldwide · Meetings"
      lede="When clubs meet worldwide, by weekday and local start hour. Select a cell for its regions, or a region to narrow the grid."
      trail={[{ label: 'Regions', to: '/regions' }, { label: 'Meetings' }]}
      subnavBase="/regions"
      controls={controls}
    >
      {isLoading && <RollupSkeleton />}
      {!isLoading && (!scoped || scoped.all.length === 0) && (
        <p className="rollup-page__empty" data-testid="meetings-unavailable">
          Worldwide meeting times are not available yet for this date. They are
          computed with each snapshot from the clubs&rsquo; Find-a-Club
          listings; earlier dates predate them.
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

export default WorldMeetingsPage
