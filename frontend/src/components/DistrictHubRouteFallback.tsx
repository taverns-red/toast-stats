import React from 'react'

export interface DistrictHubRouteFallbackProps {
  /** The generic district route fallback (spinner in the page root). */
  fallback: React.ReactNode
}

export function DistrictHubRouteFallback({
  fallback,
}: DistrictHubRouteFallbackProps): React.JSX.Element {
  return <>{fallback}</>
}
