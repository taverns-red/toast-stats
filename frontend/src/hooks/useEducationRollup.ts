/**
 * The education rollup for one program year, plus its index (#1810, data
 * from #1801) — two reads that every region's education page shares, so
 * moving between regions is free.
 *
 * The page passes its own selected PY label (R3); this never reads a PY out
 * of a response. An absent object is `null` ("not available yet"), not an
 * error.
 */
import { useQuery } from '@tanstack/react-query'
import type {
  EducationRollupIndex,
  EducationRollupProgramYear,
} from '@taverns-red/shared-contracts'
import {
  fetchCdnEducationRollup,
  fetchCdnEducationRollupIndex,
} from '../services/cdn'

const STALE = 5 * 60 * 1000
const GC = 10 * 60 * 1000

export interface UseEducationRollupResult {
  rollup: EducationRollupProgramYear | null
  index: EducationRollupIndex | null
  isLoading: boolean
}

export function useEducationRollup(
  programYear: string
): UseEducationRollupResult {
  const year = useQuery({
    queryKey: ['education-rollup', programYear] as const,
    queryFn: () => fetchCdnEducationRollup(programYear),
    staleTime: STALE,
    gcTime: GC,
  })
  const { index } = useEducationRollupIndex()
  return {
    rollup: year.data ?? null,
    index,
    isLoading: year.isLoading,
  }
}

/** The rollup index alone (#1807) — one shared read: the district page's
 *  multi-year bars need only its `trend`. `null` = not published yet. */
export function useEducationRollupIndex(): {
  index: EducationRollupIndex | null
  isLoading: boolean
} {
  const index = useQuery({
    queryKey: ['education-rollup-index'] as const,
    queryFn: fetchCdnEducationRollupIndex,
    staleTime: STALE,
    gcTime: GC,
  })
  return { index: index.data ?? null, isLoading: index.isLoading }
}
