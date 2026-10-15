import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

/* #1817 — the Club Growth page's way into charter cohort survival
   (`/district/:id/growth/survival`). The page's program year and date ride
   along in the URL, which is where the target reads them from (R3). */

const KEPT_PARAMS = ['py', 'date'] as const

export const GrowthSurvivalLink: React.FC<{ districtId: string }> = ({
  districtId,
}) => {
  const [params] = useSearchParams()
  const kept = new URLSearchParams()
  for (const key of KEPT_PARAMS) {
    const value = params.get(key)
    if (value) kept.set(key, value)
  }
  const qs = kept.toString()
  return (
    <p className="survival-entry">
      <Link
        to={`/district/${districtId}/growth/survival${qs ? `?${qs}` : ''}`}
        className="survival-entry__link"
      >
        Club survival by charter year →
      </Link>
    </p>
  )
}
