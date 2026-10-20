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
  const index = useQuery({
    queryKey: ['education-rollup-index'] as const,
    queryFn: fetchCdnEducationRollupIndex,
    staleTime: STALE,
    gcTime: GC,
  })
  return {
    rollup: year.data ?? null,
    index: index.data ?? null,
    isLoading: year.isLoading,
  }
}

// Red stub (#1807): implemented in the next commit.
export function useEducationRollupIndex(): {
  index: EducationRollupIndex | null
  isLoading: boolean
} {
  return { index: null, isLoading: false }
}
