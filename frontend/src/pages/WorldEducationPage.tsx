import React, { useMemo } from 'react'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useEducationRollup } from '../hooks/useEducationRollup'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { RollupPageShell } from '../components/rollups/RollupPageShell'
import { WorldEducationView } from '../components/WorldEducationView'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import {
  buildWorldEducation,
  worldEducationTrend,
} from '../utils/worldEducation'

/* /regions/education (#1811, epic #1781) — worldwide education awards from
   the #1801 rollup's world block, by region. A routed subpage of /regions
   (ADR-005), beside /regions/growth and /regions/health. The page owns the
   program year (R3): it asks the rollup (the same two reads the region page
   shares) for the PY its controls selected and passes it down. A rollup
   that is not there yet says so — never zeros. */

const WorldEducationPage: React.FC = () => {
  const controls = useProgramYearControls()
  const programYear = controls.selectedProgramYear.label
  const { rollup, index, isLoading } = useEducationRollup(programYear)
  const education = useMemo(() => buildWorldEducation({ rollup }), [rollup])
  const trend = useMemo(() => worldEducationTrend(index), [index])
  useDocumentTitle('Worldwide Education')

  return (
    <RollupPageShell
      title="Regions"
      eyebrow="Worldwide · Education"
      lede="Education awards for every district worldwide — Pathways levels, DTMs and legacy awards from Toastmasters' education ledger. Select a region for its own education page."
      trail={[{ label: 'Regions', to: '/regions' }, { label: 'Education' }]}
      subnavBase="/regions"
      controls={controls}
    >
      {isLoading && <LoadingSkeleton variant="card" />}
      {!isLoading && education.status !== 'available' && (
        <p
          role="status"
          className="education-empty"
          data-testid="education-unavailable"
        >
          Education awards for {programYear} are not available yet. They are
          rolled up from Toastmasters&apos; education ledger with each daily
          run.
        </p>
      )}
      {!isLoading && education.status === 'available' && (
        <WorldEducationView
          education={education}
          programYear={programYear}
          trend={trend}
        />
      )}
    </RollupPageShell>
  )
}

export default WorldEducationPage
