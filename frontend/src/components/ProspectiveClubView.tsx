import React from 'react'
import type { ProspectiveClubPageModel } from '../utils/prospectiveClubPage'

/* #2303 — red stub. */

export interface ProspectiveClubViewProps {
  model: ProspectiveClubPageModel
  districtId: string
  /** The displayed snapshot date (R3). */
  asOfDate: string
  /** `?py=&date=` kept from the page URL, or ''. */
  growthQuery: string
}

export const ProspectiveClubView: React.FC<ProspectiveClubViewProps> = () =>
  null
