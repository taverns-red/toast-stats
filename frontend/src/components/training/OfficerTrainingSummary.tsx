import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  DEFAULT_TRAINING_THRESHOLD,
  distributionOf,
  figuresFromDistribution,
  filterTrainingClubs,
  formatPct,
  roundStatus,
  trainingClubsFromSnapshot,
  trainingPageUrl,
  trainingRoundContext,
} from '../../utils/officerTraining'
import { formatDisplayDate } from '../../utils/dateFormatting'

/* Officer-training count on the division and area pages (#2296): clubs with
   4+ officers trained (DCP goal 9) in each round for this division or area,
   with a deep link to the Training page pre-filtered to it. Reads the
   snapshot the page already loads; renders nothing when the snapshot has no
   officer-training columns. Program year and date come from the page (R3). */

interface OfficerTrainingSummaryProps {
  districtId: string
  /** The page's raw district snapshot (`useDistrictStatistics`). */
  snapshot: unknown
  /** The date the page pinned its snapshot to. */
  snapshotDate: string
  /** The page's program year ("YYYY-YYYY"). */
  programYear: string
  division: string
  area?: string | undefined
}

export const OfficerTrainingSummary: React.FC<OfficerTrainingSummaryProps> = ({
  districtId,
  snapshot,
  snapshotDate,
  programYear,
  division,
  area,
}) => {
  const clubs = useMemo(() => {
    const all = trainingClubsFromSnapshot(snapshot)
    return all ? filterTrainingClubs(all, { division, area }) : null
  }, [snapshot, division, area])
  if (!clubs || clubs.length === 0) return null

  const { rounds } = trainingRoundContext(snapshotDate, programYear)
  const parts = rounds.map(window => {
    const status = roundStatus(window, snapshotDate)
    if (status === 'upcoming') {
      return `Round ${window.round}: opens ${formatDisplayDate(window.start)}`
    }
    const f = figuresFromDistribution(
      distributionOf(clubs, window.round),
      DEFAULT_TRAINING_THRESHOLD
    )
    const when = status === 'open' ? 'open' : 'final'
    return `Round ${window.round} (${when}): ${f.atThreshold} of ${f.clubs} clubs with 4+ trained (${formatPct(f.pctDcp)})`
  })

  return (
    <aside
      className="training-summary"
      aria-label="Officer training"
      data-testid="officer-training-summary"
    >
      <span className="training-summary__title">
        Officer training (DCP goal 9)
      </span>
      <span>{parts.join(' · ')}</span>
      <Link to={trainingPageUrl(districtId, { division, area })}>
        See the Training page
      </Link>
    </aside>
  )
}

export default OfficerTrainingSummary
