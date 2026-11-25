/* DivisionPrintPage (#2299) — /district/:districtId/division/:divId/print.
   The Division Print Pack: a one-page summary (recognition and each area's
   standing, close-to-Distinguished clubs, club visits, Club Success Plans),
   then the full club roster on a forced second page. A real routed leaf
   inside the app shell; print CSS hides the shell. */

import { useDocumentTitle } from '../hooks/useDocumentTitle'
import React from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useCouncilPack } from '../hooks/useCouncilPack'
import {
  DivisionNotFound,
  divisionNotFoundHeading,
} from '../components/EntityNotFound'
import { CouncilPackPage } from '../components/councilPack/CouncilPackPage'

const DivisionPrintPage: React.FC = () => {
  const { districtId, divId } = useParams<{
    districtId: string
    divId: string
  }>()
  const { search } = useLocation()
  const data = useCouncilPack(districtId, { division: divId ?? '' })
  useDocumentTitle(
    data.isNotFound
      ? divisionNotFoundHeading(districtId ?? '', divId ?? '')
      : `Division ${divId?.toUpperCase()} Print Pack — District ${districtId}`
  )
  if (data.isNotFound) {
    return (
      <DivisionNotFound districtId={districtId ?? ''} divId={divId ?? ''} />
    )
  }
  const title = data.pack
    ? `Division ${data.pack.divisionId}`
    : `Division ${divId?.toUpperCase()}`
  return (
    <CouncilPackPage
      kind="division"
      districtId={districtId ?? ''}
      title={title}
      sourcePath={`/district/${districtId}/division/${divId}`}
      search={search}
      data={data}
    />
  )
}

export default DivisionPrintPage
