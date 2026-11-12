import { useMediaQuery } from './useMediaQuery'
import type { BreakpointTier } from '../components/clubsColumnMeta'

export type { BreakpointTier }

/**
 * The width tier the Clubs table lays out for (#2676, spec §4.5):
 * 768-1023 `tablet`, 1024-1279 `laptop`, 1280-1599 `desktop`, >=1600 `wide`.
 * Below 768 the phone list renders instead, so `tablet` also covers it.
 *
 * `useMediaQuery` reads `matchMedia` synchronously on the first render, so the
 * first frame already has the right column set and nothing shifts afterwards
 * (risk R-4, CLS <= 0.1).
 */
export function useBreakpointTier(): BreakpointTier {
  const wide = useMediaQuery('(min-width: 1600px)')
  const desktop = useMediaQuery('(min-width: 1280px)')
  const laptop = useMediaQuery('(min-width: 1024px)')
  return wide ? 'wide' : desktop ? 'desktop' : laptop ? 'laptop' : 'tablet'
}
