import React from 'react'
import { Link } from 'react-router-dom'
import { useDistrictRevisedAsOf } from '../hooks/useDistrictRevisedAsOf'
import { formatShortDate } from '../utils/dateFormatting'

interface DistrictRevisedNoteProps {
  districtId: string
  viewedDate: string | undefined
}

/**
 * "Revised <date>" beside a district's data date, linking to that district's
 * What Changed page (#2475). Renders nothing unless the district has a
 * reconciliation revision for the month end on screen. It is separate from the
 * global freshness pill, which has no district context and a fixed width (#2472).
 */
export const DistrictRevisedNote: React.FC<DistrictRevisedNoteProps> = ({
  districtId,
  viewedDate,
}) => {
  const revisedAsOf = useDistrictRevisedAsOf(districtId, viewedDate)
  if (!revisedAsOf) return null
  return (
    <p className="district-revised-note" data-testid="district-revised-note">
      <Link to={`/district/${districtId}/changes`}>
        Revised {formatShortDate(revisedAsOf)}
      </Link>
    </p>
  )
}
