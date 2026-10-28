/**
 * useUrlSuccessPlanTargets — the District Success Plan targets in
 * `?targets=` (#2297).
 *
 * The URL is the only carrier and the source of truth when the param is
 * present. Within the tab session the last targets seen for a district ride
 * along to its subpages, the way `?py=` does through ProgramYearContext: the
 * section nav links carry no query string, so without this Trends would
 * lose the plan the Overview just showed. That memory is in-module only —
 * never localStorage or sessionStorage — so it ends with the tab and never
 * silently diverges from a shared link on another visit.
 */
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  TARGETS_PARAM,
  decodeTargets,
  encodeTargets,
  type SuccessPlanTargets,
} from '../utils/successPlanTargets'

/** districtId → the raw param last seen or written for it. */
const memory = new Map<string, string>()

/** Test seam: forget every district's carried targets. */
export function resetSuccessPlanTargetsMemory(): void {
  memory.clear()
}

export function useUrlSuccessPlanTargets(districtId: string | undefined) {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlRaw = searchParams.get(TARGETS_PARAM)
  // Bumped when a write leaves the URL unchanged (clearing carried targets
  // on a URL that never had the param), so the page still re-renders.
  const [, setVersion] = useState(0)

  const remembered = districtId ? memory.get(districtId) : undefined
  const raw = urlRaw ?? remembered ?? null
  const targets = decodeTargets(raw)

  useEffect(() => {
    if (districtId && urlRaw !== null) memory.set(districtId, urlRaw)
  }, [districtId, urlRaw])

  const setTargets = useCallback(
    (next: SuccessPlanTargets | null) => {
      const encoded = next ? encodeTargets(next) : ''
      if (districtId) {
        if (encoded) memory.set(districtId, encoded)
        else memory.delete(districtId)
      }
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev)
          if (encoded) params.set(TARGETS_PARAM, encoded)
          else params.delete(TARGETS_PARAM)
          return params
        },
        { replace: true }
      )
      setVersion(v => v + 1)
    },
    [districtId, setSearchParams, setVersion]
  )

  return { targets, setTargets }
}
