import React from 'react'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useCharterCohortSurvivalRollup } from '../hooks/useCharterCohortSurvivalRollup'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { RollupPageShell } from '../components/rollups/RollupPageShell'
import { RollupSurvivalBody } from '../components/rollups/RollupSurvivalBody'
import type { CharterCohortSurvivalScope } from '../utils/charterCohortSurvival'

/* /regions/growth/survival (#1818) — worldwide charter cohort survival, a
   routed subpage of /regions (ADR-005), read from
   `config/charter-cohort-survival/world.json`. The page owns the program
   year (R3) and hands it down as the horizon. */

const WORLD: CharterCohortSurvivalScope = { kind: 'world' }

const WorldSurvivalPage: React.FC = () => {
  const controls = useProgramYearControls()
  const state = useCharterCohortSurvivalRollup(
    WORLD,
    controls.selectedProgramYear.label
  )
  useDocumentTitle('Worldwide Club Survival')

  return (
    <RollupPageShell
      title="Regions"
      eyebrow="Worldwide · Club survival"
      lede="How many of the clubs chartered worldwide each program year are still active 1, 3 and 5 years later."
      trail={[{ label: 'Regions', to: '/regions' }, { label: 'Club survival' }]}
      subnavBase="/regions"
      controls={controls}
    >
      <RollupSurvivalBody state={state} scope={WORLD} />
    </RollupPageShell>
  )
}

export default WorldSurvivalPage
