import React, { useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useRegionRollups } from '../hooks/useRegionRollups'
import { useReportsRollups } from '../hooks/useReportsRollups'
import {
  RollupPageShell,
  RollupSkeleton,
} from '../components/rollups/RollupPageShell'
import { RollupGrowthFunnelView } from '../components/rollups/RollupGrowthFunnelView'
import { buildRollupGrowthFunnel } from '../utils/rollupGrowthFunnel'
import { normaliseRegionId } from '../utils/regionId'

/* /region/:n/growth (#1812, epic #1781) — the region's Club Growth funnel:
   the district funnel (#1794) rolled up over the region's districts, each
   stage broken down by district and linking to that district's funnel. A
   routed subpage of /region/:n (ADR-005). The page owns program year and
   date (R3) and pins both rollups queries to its date; regions are that
   program year's own (#1820). */

const RegionGrowthPage: React.FC = () => {
  const { n } = useParams<{ n: string }>()
  const { search } = useLocation()
  const region = normaliseRegionId(n) // "1" → "01", the rollups key (#2130)
  const controls = useProgramYearControls()
  const date = controls.effectiveDate
  const { reports, isLoading: reportsLoading } = useReportsRollups(date)
  const { rollups, isLoading: rollupsLoading } = useRegionRollups(date)
  const funnel = useMemo(
    () =>
      buildRollupGrowthFunnel({
        reports,
        rollups,
        scope: { kind: 'region', regionId: region },
        search,
      }),
    [reports, rollups, region, search]
  )
  const title = `Region ${region}`
  useDocumentTitle(`${title} Club Growth`)
  const loading = reportsLoading || rollupsLoading
  const asOf = date ?? reports?.snapshotDate ?? rollups?.snapshotDate ?? null

  return (
    <RollupPageShell
      title={title}
      eyebrow={`Toastmasters Region ${region} · Club growth`}
      lede={`Prospective clubs, new charters, coached clubs and suspensions across the districts of Region ${region}. Select a district to open its own funnel.`}
      back={{ label: title, to: `/region/${region}` }}
      trail={[
        { label: 'Regions', to: '/regions' },
        { label: title, to: `/region/${region}` },
        { label: 'Club growth' },
      ]}
      subnavBase={`/region/${region}`}
      controls={controls}
    >
      {loading && <RollupSkeleton />}
      {!loading && !funnel.found && (
        <p className="rollup-page__empty" data-testid="rollups-unavailable">
          {reports?.regionMembershipNote ??
            rollups?.regionMembershipNote ??
            (reports || rollups
              ? `Region ${region} is not in the rollups for this date.`
              : 'Region Club Growth is not available yet for this date. It is computed with each snapshot; earlier dates predate it.')}
        </p>
      )}
      {!loading && funnel.found && asOf && (
        <RollupGrowthFunnelView
          funnel={funnel}
          scopeLabel={`in Region ${region}`}
          childNoun="District"
          asOfDate={asOf}
        />
      )}
    </RollupPageShell>
  )
}

export default RegionGrowthPage
