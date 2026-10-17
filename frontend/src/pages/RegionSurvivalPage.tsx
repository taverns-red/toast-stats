import React, { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useCharterCohortSurvivalRollup } from '../hooks/useCharterCohortSurvivalRollup'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { RollupPageShell } from '../components/rollups/RollupPageShell'
import { RollupSurvivalBody } from '../components/rollups/RollupSurvivalBody'
import { normaliseRegionId } from '../utils/regionId'
import type { CharterCohortSurvivalScope } from '../utils/charterCohortSurvival'

/* /region/:n/growth/survival (#1818) — the region's charter cohort
   survival: "of the clubs chartered in this region in PY X, how many are
   still active 1, 3, 5 years later?" A routed subpage of /region/:n
   (ADR-005), read from `config/charter-cohort-survival/region_<NN>.json`,
   which the pipeline folds from the club-district history with each
   program year's own region membership. The page owns the program year
   (R3) and hands it down as the horizon. */

const RegionSurvivalPage: React.FC = () => {
  const { n } = useParams<{ n: string }>()
  const region = normaliseRegionId(n) // "9" → "09", the file key (#2130)
  const controls = useProgramYearControls()
  const scope = useMemo(
    (): CharterCohortSurvivalScope => ({ kind: 'region', regionId: region }),
    [region]
  )
  const state = useCharterCohortSurvivalRollup(
    scope,
    controls.selectedProgramYear.label
  )
  const title = `Region ${region}`
  useDocumentTitle(`${title} Club Survival`)

  return (
    <RollupPageShell
      title={title}
      eyebrow={`Toastmasters Region ${region} · Club survival`}
      lede={`How many of the clubs chartered in Region ${region} each program year are still active 1, 3 and 5 years later.`}
      back={{ label: title, to: `/region/${region}` }}
      trail={[
        { label: 'Regions', to: '/regions' },
        { label: title, to: `/region/${region}` },
        { label: 'Club survival' },
      ]}
      subnavBase={`/region/${region}`}
      controls={controls}
    >
      <RollupSurvivalBody state={state} scope={scope} />
    </RollupPageShell>
  )
}

export default RegionSurvivalPage
