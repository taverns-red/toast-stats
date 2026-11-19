import React from 'react'
import { Link } from 'react-router-dom'
import { useDistrictRevision } from '../hooks/useDistrictRevision'
import { formatShortDate } from '../utils/dateFormatting'
import { newestMonthEndOnOrBefore } from '../utils/snapshotPoints'

interface DistrictRevisedNoteProps {
  districtId: string
  viewedDate: string | undefined
  /** The district's newest snapshot date, to find its newest month end. */
  latestSnapshotDate: string | undefined
}

/**
 * "Revised <date>" under the district lede, linking to What Changed on that
 * month end's newest revision (#2475). It is separate from the global
 * freshness pill, which has no district context and a fixed width (#2472).
 *
 * What Changed offers revisions only for the newest month end, so the note
 * appears only when that is the date on screen. That is known from the dates
 * alone, so the line is rendered at once with a reserved height and filled
 * when the revision index loads; mounting it late pushed the page down.
 */
export const DistrictRevisedNote: React.FC<DistrictRevisedNoteProps> = ({
  districtId,
  viewedDate,
  latestSnapshotDate,
}) => {
  const monthEnd =
    viewedDate &&
    latestSnapshotDate &&
    viewedDate === newestMonthEndOnOrBefore(latestSnapshotDate)
      ? viewedDate
      : undefined
  const revision = useDistrictRevision(districtId, monthEnd)
  if (!monthEnd) return null
  const query = revision
    ? new URLSearchParams({ from: revision.from, to: revision.to }).toString()
    : ''
  return (
    <p className="district-revised-note" data-testid="district-revised-note">
      {revision && (
        <Link to={`/district/${districtId}/changes?${query}`}>
          Revised {formatShortDate(revision.revisedOn)}
        </Link>
      )}
    </p>
  )
}
