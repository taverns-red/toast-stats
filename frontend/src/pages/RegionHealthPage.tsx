import React, { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useRegionRollups } from '../hooks/useRegionRollups'
import {
  RollupNeedsAttention,
  RollupPageShell,
  RollupSkeleton,
} from '../components/rollups/RollupPageShell'
import { RollupPanels } from '../components/rollups/RollupPanels'
import { RollupBreakdownTable } from '../components/rollups/RollupBreakdownTable'
import { needsAttention, regionBreakdown } from '../utils/regionRollupView'

/* /region/:n/health (#1815) — the region's rollup of its districts (#1799):
   club health, club status, Distinguished levels and compliance, then one
   row per district linking down to it. A routed subpage of /region/:n
   (ADR-005). The page owns program year and date (R3) and pins the one
   rollups query to its date; regions are that program year's own (#1820). */

const RegionHealthPage: React.FC = () => {
  const { n } = useParams<{ n: string }>()
  const region = (n ?? '').trim()
  const controls = useProgramYearControls()
  const { rollups, snapshotDate, isLoading } = useRegionRollups(
    controls.effectiveDate
  )
  const block = rollups?.regions?.[region] ?? null
  const children = useMemo(
    () => (rollups ? regionBreakdown(rollups, region) : []),
    [rollups, region]
  )
  const title = `Region ${region}`

  return (
    <RollupPageShell
      title={title}
      eyebrow={`Toastmasters Region ${region} · Health & compliance`}
      lede={`Club health, status, Distinguished levels and compliance across the districts of Region ${region}. Select a district to drill into its clubs.`}
      back={{ label: title, to: `/region/${region}` }}
      trail={[
        { label: 'Regions', to: '/regions' },
        { label: title, to: `/region/${region}` },
        { label: 'Health & compliance' },
      ]}
      subnavBase={`/region/${region}`}
      controls={controls}
    >
      {isLoading && <RollupSkeleton />}
      {!isLoading && !block && (
        <p className="rollup-page__empty" data-testid="rollups-unavailable">
          {rollups
            ? (rollups.regionMembershipNote ??
              `Region ${region} is not in the rollups for this date.`)
            : 'Region and world rollups are not published for this date. They are computed with each snapshot; earlier dates predate them.'}
        </p>
      )}
      {block && (
        <>
          <RollupPanels
            figures={block}
            programYear={controls.selectedProgramYear.label}
            snapshotDate={snapshotDate ?? rollups!.snapshotDate}
            attention={<RollupNeedsAttention rows={needsAttention(children)} />}
            scopeLabel={`in Region ${region}`}
          />
          <section
            className="rollup-page__breakdown"
            aria-labelledby="rollup-breakdown-heading"
          >
            <h2 id="rollup-breakdown-heading" className="rollup-section__title">
              Districts
            </h2>
            <RollupBreakdownTable
              rows={children}
              label={`Region ${region} districts`}
              identityHeader="District"
            />
          </section>
        </>
      )}
    </RollupPageShell>
  )
}

export default RegionHealthPage
