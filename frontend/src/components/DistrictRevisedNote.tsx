import React from 'react'
import { Link } from 'react-router-dom'
import { useDistrictRevisedAsOf } from '../hooks/useDistrictRevisedAsOf'
import { formatShortDate } from '../utils/dateFormatting'
import { isMonthEnd } from '../utils/snapshotPoints'

interface DistrictRevisedNoteProps {
  districtId: string
  viewedDate: string | undefined
}

/**
 * "Revised <date>" beside a district's data date, linking to that district's
 * What Changed page (#2475). It is separate from the global freshness pill,
 * which has no district context and a fixed width (#2472).
 *
 * Only a month end can be revised, and that is known from the date alone, so
 * on a month-end view the line is always rendered with a reserved height and
 * filled once the revision index loads. Mounting it late pushed the page down.
 */
export const DistrictRevisedNote: React.FC<DistrictRevisedNoteProps> = ({
  districtId,
  viewedDate,
}) => {
  const revisedAsOf = useDistrictRevisedAsOf(districtId, viewedDate)
  if (!viewedDate || !isMonthEnd(viewedDate)) return null
  return (
    <p className="district-revised-note" data-testid="district-revised-note">
      {revisedAsOf && (
        <Link to={`/district/${districtId}/changes`}>
          Revised {formatShortDate(revisedAsOf)}
        </Link>
      )}
    </p>
  )
}
