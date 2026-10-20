/* Moved-region banner (#1821). Regions have been redrawn several times
   (District 61 sat in Regions 06, 09 and 05). When the district changed
   region, its page names each other region and links to it FOR the last
   year the district was there — `?py=` keeps every link off a dead end
   (that region's page for today would not list this district).

   The program year is the page's own selection (R3); the history is
   `config/district-region-history.json` (#1820). */
import React from 'react'
import { Link } from 'react-router-dom'
import type { DistrictRegionHistory } from '@taverns-red/shared-contracts'
import {
  formerRegionRuns,
  regionOfDistrict,
  shortProgramYear,
  type RegionRun,
} from '../utils/regionHistory'

export interface DistrictRegionMoveBannerProps {
  districtId: string
  /** The page's selected program year label, e.g. "2019-2020". */
  programYear: string
  history: DistrictRegionHistory | null | undefined
}

function runSentence(run: RegionRun): string {
  const first = shortProgramYear(run.firstProgramYear)
  const last = shortProgramYear(run.lastProgramYear)
  if (run.ongoing)
    return `Since ${first} this district is in Region ${run.region}`
  const span = first === last ? first : `${first} – ${last}`
  return `In ${span} this district was in Region ${run.region}`
}

/** `?py=` takes the program year's start year. */
const pyParam = (label: string): string => label.slice(0, 4)

export const DistrictRegionMoveBanner: React.FC<
  DistrictRegionMoveBannerProps
> = ({ districtId, programYear, history }) => {
  const runs = formerRegionRuns(history, districtId, programYear)
  if (runs.length === 0) return null

  const newest = history?.programYears[history.programYears.length - 1]
  const current = regionOfDistrict(history, districtId, programYear)
  const headingId = `region-history-${districtId}`

  return (
    <aside
      role="note"
      aria-labelledby={headingId}
      className="region-move-note"
      data-testid="region-move-note"
    >
      <h2 id={headingId} className="region-move-note__title">
        Region history
      </h2>
      <ul className="region-move-note__list">
        {current && programYear !== newest && (
          <li className="region-move-note__item">
            <span>
              In {shortProgramYear(programYear)} this district was in Region{' '}
              {current}
            </span>
          </li>
        )}
        {runs.map(run => (
          <li key={run.firstProgramYear} className="region-move-note__item">
            <span>{runSentence(run)}</span>
            <Link
              to={`/region/${run.region}?py=${pyParam(run.lastProgramYear)}`}
              className="region-move-note__link"
            >
              Open Region {run.region} for{' '}
              {shortProgramYear(run.lastProgramYear)}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
