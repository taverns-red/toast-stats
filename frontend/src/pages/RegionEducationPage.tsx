import React, { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useEducationRollup } from '../hooks/useEducationRollup'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { RollupPageShell } from '../components/rollups/RollupPageShell'
import { RegionEducationView } from '../components/RegionEducationView'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import {
  buildRegionEducation,
  regionEducationTrend,
} from '../utils/regionEducation'
import { normaliseRegionId } from '../utils/regionId'

/* /region/:n/education (#1810, epic #1781) — the region's education awards
   from the #1801 rollup, by district. A routed subpage of /region/:n
   (ADR-005). The page owns the program year (R3): it asks the rollup for
   the PY its controls selected and passes it down; the date control only
   picks the PY here (the rollup is per program year, as of its reports
   date). A rollup that is not there yet says so — never zeros. */

const UNAVAILABLE: Record<string, (region: string, py: string) => string> = {
  'no-rollup': (_, py) =>
    `Education awards for ${py} are not available yet. They are rolled up from Toastmasters' education ledger with each daily run.`,
  'no-regions': (_, py) =>
    `Education awards by region are not available for ${py}: region membership is recorded from 2016-17 on.`,
  'region-absent': (region, py) =>
    `Region ${region} is not in the ${py} education rollup.`,
}

const RegionEducationPage: React.FC = () => {
  const { n } = useParams<{ n: string }>()
  const region = normaliseRegionId(n) // "1" → "01", the rollup key (#2130)
  const controls = useProgramYearControls()
  const programYear = controls.selectedProgramYear.label
  const { rollup, index, isLoading } = useEducationRollup(programYear)
  const education = useMemo(
    () => buildRegionEducation({ rollup, region }),
    [rollup, region]
  )
  const trend = useMemo(
    () => regionEducationTrend(index, region),
    [index, region]
  )
  const title = `Region ${region}`
  useDocumentTitle(`${title} Education`)

  return (
    <RollupPageShell
      title={title}
      eyebrow={`Toastmasters Region ${region} · Education`}
      lede={`Education awards across the districts of Region ${region} — Pathways levels, DTMs and legacy awards from Toastmasters' education ledger. Select a district for its own education page.`}
      back={{ label: title, to: `/region/${region}` }}
      trail={[
        { label: 'Regions', to: '/regions' },
        { label: title, to: `/region/${region}` },
        { label: 'Education' },
      ]}
      subnavBase={`/region/${region}`}
      controls={controls}
    >
      {isLoading && <LoadingSkeleton variant="card" />}
      {!isLoading && education.status !== 'available' && (
        <p
          role="status"
          className="education-empty"
          data-testid="education-unavailable"
        >
          {UNAVAILABLE[education.reason]!(region, programYear)}
        </p>
      )}
      {!isLoading && education.status === 'available' && (
        <RegionEducationView
          education={education}
          region={region}
          programYear={programYear}
          trend={trend}
        />
      )}
    </RollupPageShell>
  )
}

export default RegionEducationPage
