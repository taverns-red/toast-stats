/* AreaPrintPage (#2299) — /district/:districtId/division/:divId/area/:areaId/print.
   The one-page Area print pack: recognition, close-to-Distinguished clubs,
   club visits, Club Success Plans and the area's clubs, dated. A real routed
   leaf inside the app shell (no tabs, no ?print=1 toggle): print.css and
   council-pack.css hide the shell when printing. */

import React from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useCouncilPack } from '../hooks/useCouncilPack'
import { CouncilPackPage } from '../components/councilPack/CouncilPackPage'

const AreaPrintPage: React.FC = () => {
  const { districtId, divId, areaId } = useParams<{
    districtId: string
    divId: string
    areaId: string
  }>()
  const { search } = useLocation()
  const data = useCouncilPack(districtId, {
    division: divId ?? '',
    area: areaId ?? '',
  })
  if (data.isNotFound) {
    throw new Response(null, { status: 404, statusText: 'Area not found' })
  }
  const areaLabel = data.pack ? `Area ${data.pack.areaId}` : `Area ${areaId}`
  return (
    <CouncilPackPage
      kind="area"
      districtId={districtId ?? ''}
      title={areaLabel}
      parentName={data.divisionName ?? `Division ${divId?.toUpperCase()}`}
      sourcePath={`/district/${districtId}/division/${divId}/area/${areaId}`}
      search={search}
      data={data}
    />
  )
}

export default AreaPrintPage
