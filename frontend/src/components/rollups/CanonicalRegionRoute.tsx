import React from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { canonicalRegionPath, normaliseRegionId } from '../../utils/regionId'

/* CanonicalRegionRoute (#2130) — wraps every `/region/:n…` route. An
   unpadded id (`/region/1/health?py=2025`) replaces itself with the padded
   canonical URL (`/region/01/health?py=2025`), keeping subpath, query and
   hash; a canonical URL renders its page unchanged. */

export const CanonicalRegionRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { n } = useParams<{ n: string }>()
  const location = useLocation()
  const canonical = normaliseRegionId(n)
  if (n !== undefined && canonical !== n) {
    return <Navigate to={canonicalRegionPath(location, canonical)} replace />
  }
  return <>{children}</>
}
