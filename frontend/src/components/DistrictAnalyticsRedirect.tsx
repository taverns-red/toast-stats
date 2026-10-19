import React from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { analyticsRedirectTarget } from '../utils/analyticsRedirect'

/* The element for the retired `/district/:id/analytics` route (#2159). A
   history REPLACE, so Back skips the dead URL. The mapping lives in
   analyticsRedirectTarget. */
export const DistrictAnalyticsRedirect: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const { search, hash } = useLocation()
  if (!districtId) return null
  return (
    <Navigate to={analyticsRedirectTarget(districtId, search, hash)} replace />
  )
}
