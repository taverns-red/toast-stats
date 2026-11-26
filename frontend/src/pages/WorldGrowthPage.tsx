import React, { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useRegionRollups } from '../hooks/useRegionRollups'
import { useReportsRollups } from '../hooks/useReportsRollups'
import { useReinstatableClubsFile } from '../hooks/useReinstatableClubs'
import {
  RollupPageShell,
  RollupSkeleton,
} from '../components/rollups/RollupPageShell'
import { RollupGrowthFunnelView } from '../components/rollups/RollupGrowthFunnelView'
import { buildRollupGrowthFunnel } from '../utils/rollupGrowthFunnel'
import { buildRollupReinstate } from '../utils/rollupReinstate'

/* /regions/growth (#1813, epic #1781) — the worldwide Club Growth funnel:
   the district funnel (#1794) rolled up over every district, each stage
   broken down by region and linking to that region's funnel. A routed
   subpage of /regions (ADR-005); the page owns program year and date (R3).
   Coverage — how many districts' daily reports the counts include — is
   stated. Without region membership for the date, the world block still
   renders and the region tables are empty. */

const HEADING = 'Worldwide club growth'

const WorldGrowthPage: React.FC = () => {
  const { search } = useLocation()
  const controls = useProgramYearControls()
  const date = controls.effectiveDate
  const { reports, isLoading: reportsLoading } = useReportsRollups(date)
  const { rollups, isLoading: rollupsLoading } = useRegionRollups(date)
  const funnel = useMemo(
    () =>
      buildRollupGrowthFunnel({
        reports,
        rollups,
        scope: { kind: 'world' },
        search,
      }),
    [reports, rollups, search]
  )
  useDocumentTitle(HEADING)
  // #3094: the "Can reinstate" card, summed from the one dated file. The
  // funnel waits for it, so the strip renders once with its final number of
  // cards (no layout shift, the trap in #3092). The fetch never throws: a
  // date without the file settles to null quickly.
  const { file, isLoading: reinstateLoading } = useReinstatableClubsFile(date)
  const reinstate = useMemo(
    () =>
      buildRollupReinstate({
        file,
        date,
        districtIds: 'all',
        search,
      }),
    [file, date, search]
  )
  const loading = reportsLoading || rollupsLoading || reinstateLoading
  const asOf = date ?? reports?.snapshotDate ?? rollups?.snapshotDate ?? null

  return (
    <RollupPageShell
      title="Regions"
      heading={HEADING}
      eyebrow="Worldwide · Club growth"
      lede="Prospective clubs, new charters, coached clubs and suspensions for every district worldwide. Select a region to open its own funnel."
      trail={[{ label: 'Regions', to: '/regions' }, { label: 'Club growth' }]}
      subnavBase="/regions"
      controls={controls}
    >
      {loading && <RollupSkeleton />}
      {!loading && !funnel.found && (
        <p className="rollup-page__empty" data-testid="rollups-unavailable">
          Worldwide Club Growth is not available yet for this date. It is
          computed with each snapshot; earlier dates predate it.
        </p>
      )}
      {!loading && funnel.found && asOf && (
        <RollupGrowthFunnelView
          funnel={funnel}
          scopeLabel="worldwide"
          childNoun="Region"
          asOfDate={asOf}
          reinstate={reinstate}
        />
      )}
    </RollupPageShell>
  )
}

export default WorldGrowthPage
