import React from 'react'
import { Link } from 'react-router-dom'
import type {
  RegionsTrainingOverview,
  RegionsTrainingRound,
} from '../utils/regionTraining'
import {
  formatPct,
  roundMonths,
  type TrainingRound,
} from '../utils/officerTraining'
import { formatShortDate } from '../utils/dateFormatting'

/* RegionsTrainingWorld (#2330) — the world figure the /regions
   officer-training columns are read against: each round's % of clubs with
   4+ officers trained (DCP goal 9) and with all seven, from the world block
   of the date's region-rollups.json. A round that has not opened says so
   with its opening date; a date without the figures says "not available",
   never 0%. */

export interface RegionsTrainingWorldProps {
  overview: RegionsTrainingOverview
}

const roundText = (round: TrainingRound, r: RegionsTrainingRound): string => {
  const head = `Round ${round} ${roundMonths(round)}: `
  if (r.state === 'notStarted')
    return `${head}not started · opens ${formatShortDate(r.opens)}`
  if (r.state === 'notAvailable') return `${head}not available`
  return `${head}${formatPct(r.figures.pctDcp)} of clubs with 4+ officers trained (DCP goal 9), ${formatPct(r.figures.pctAllSeven)} with all seven`
}

export const RegionsTrainingWorld: React.FC<RegionsTrainingWorldProps> = ({
  overview,
}) => (
  <div
    className="training-context regions-training-world"
    data-testid="regions-training-world"
  >
    <strong>World officer training</strong>
    {overview.available ? (
      <>
        {' '}
        — {roundText(1, overview.world.rounds[0])}.{' '}
        {roundText(2, overview.world.rounds[1])}.
      </>
    ) : (
      <>
        {' '}
        is not available for this date. It is recorded with each daily snapshot
        from the day the figure was added; earlier dates predate it.
      </>
    )}{' '}
    <Link to="/methodology#officer-training">How this is counted</Link>
  </div>
)
