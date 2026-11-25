import React from 'react'
import NotFoundPanel from './NotFoundPanel'
import { buildDistrictSectionUrl } from '../config/districtSections'

interface DivisionNotFoundProps {
  districtId: string
  divId: string
}

/** Not-found panel for a division id the district does not have. */
export const DivisionNotFound: React.FC<DivisionNotFoundProps> = ({
  districtId,
  divId,
}) => (
  <NotFoundPanel
    heading={`Division ${divId.toUpperCase()} isn't in District ${districtId}`}
    message="Check the division letter in the link, or open the district to see its divisions."
    suggestionsLead={`Go to District ${districtId}:`}
    suggestions={[
      {
        label: `District ${districtId} divisions`,
        to: buildDistrictSectionUrl(districtId, 'divisions'),
      },
      {
        label: `District ${districtId} overview`,
        to: buildDistrictSectionUrl(districtId, ''),
      },
    ]}
  />
)

interface AreaNotFoundProps extends DivisionNotFoundProps {
  areaId: string
}

/** Not-found panel for an area id the division does not have. */
export const AreaNotFound: React.FC<AreaNotFoundProps> = ({
  districtId,
  divId,
  areaId,
}) => (
  <NotFoundPanel
    heading={`Area ${areaId.toUpperCase()} isn't in Division ${divId.toUpperCase()} of District ${districtId}`}
    message="Check the area number in the link, or open the division to see its areas."
    suggestionsLead="Go to:"
    suggestions={[
      {
        label: `Division ${divId.toUpperCase()}`,
        to: `/district/${districtId}/division/${divId}`,
      },
      {
        label: `District ${districtId} divisions`,
        to: buildDistrictSectionUrl(districtId, 'divisions'),
      },
    ]}
  />
)
