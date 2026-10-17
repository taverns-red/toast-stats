import React, { useMemo } from 'react'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useRegionRollups } from '../hooks/useRegionRollups'
import {
  RollupPageShell,
  RollupSkeleton,
} from '../components/rollups/RollupPageShell'
import { RollupPanels } from '../components/rollups/RollupPanels'
import { RollupBreakdownTable } from '../components/rollups/RollupBreakdownTable'
import { needsAttention, worldBreakdown } from '../utils/regionRollupView'

/* /regions/health (#1815) — the worldwide rollup (#1799): club health,
   status, Distinguished levels and compliance, then one row per region
   linking down to its own rollup page. A routed subpage of /regions
   (ADR-005); the page owns program year and date (R3).

   When region membership is unavailable for the date, the world block still
   renders and the region table is replaced by the artifact's own note. */

const WorldHealthPage: React.FC = () => {
  const controls = useProgramYearControls()
  const { rollups, snapshotDate, isLoading } = useRegionRollups(
    controls.effectiveDate
  )
  const children = useMemo(
    () => (rollups ? worldBreakdown(rollups) : []),
    [rollups]
  )

  return (
    <RollupPageShell
      title="Regions"
      eyebrow="Worldwide · Health & compliance"
      lede="Club health, status, Distinguished levels and compliance for every club worldwide. Select a region to drill into its districts."
      trail={[
        { label: 'Regions', to: '/regions' },
        { label: 'Health & compliance' },
      ]}
      subnavBase="/regions"
      controls={controls}
      attention={rollups ? needsAttention(children) : null}
    >
      {isLoading && <RollupSkeleton />}
      {!isLoading && !rollups && (
        <p className="rollup-page__empty" data-testid="rollups-unavailable">
          Region and world rollups are not published for this date. They are
          computed with each snapshot; earlier dates predate them.
        </p>
      )}
      {rollups && (
        <>
          <RollupPanels
            figures={rollups.world}
            programYear={controls.selectedProgramYear.label}
            snapshotDate={snapshotDate ?? rollups.snapshotDate}
            scopeLabel="worldwide"
          />
          <section
            className="rollup-page__breakdown"
            aria-labelledby="rollup-breakdown-heading"
          >
            <h2 id="rollup-breakdown-heading" className="rollup-section__title">
              Regions
            </h2>
            {rollups.regions ? (
              <RollupBreakdownTable
                rows={children}
                label="Regions"
                identityHeader="Region"
              />
            ) : (
              <p
                className="rollup-page__empty"
                data-testid="rollups-regions-unavailable"
              >
                {rollups.regionMembershipNote ??
                  'Region membership is not available for this date.'}
              </p>
            )}
          </section>
        </>
      )}
    </RollupPageShell>
  )
}

export default WorldHealthPage
