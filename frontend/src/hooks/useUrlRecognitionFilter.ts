import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  parseAwardIds,
  serializeAwardIds,
  parseTierId,
  serializeTierId,
  type RecognitionFilterState,
} from '../components/recognition/recognitionFilter'

/**
 * URL-synced Recognition filter (#1362) — `?awards=extension,retention&tier=select`.
 *
 * Follows the `?regions=` convention (#978): `{ replace: true }`, params
 * dropped when empty so a default view has a clean URL, and every other param
 * preserved.
 *
 * **Why not two `useUrlState` calls.** The filter is two facets that change
 * together — clicking an award chip writes `awards` and leaves `tier` alone,
 * and "Clear filters" drops both at once. Two `useUrlState`s means two
 * `setSearchParams` calls in one handler, and react-router resolves a
 * functional updater against the params of the CURRENT render, not against the
 * pending first update. The second call therefore rebuilds the URL from the
 * pre-click params and silently discards the first — awards vanish, tier
 * sticks. One writer, one write.
 */
export function useUrlRecognitionFilter(): [
  RecognitionFilterState,
  (next: RecognitionFilterState) => void,
] {
  const [searchParams, setSearchParams] = useSearchParams()
  // Keyed on the RAW strings so the parsed array/tier keep a stable identity
  // across unrelated renders (the #978 memo discipline — a fresh array every
  // render busts the downstream 138-row filter memo on every keystroke).
  const awardsRaw = searchParams.get('awards') ?? ''
  const tierRaw = searchParams.get('tier') ?? ''

  const filter = useMemo<RecognitionFilterState>(
    () => ({ awards: parseAwardIds(awardsRaw), tier: parseTierId(tierRaw) }),
    [awardsRaw, tierRaw]
  )

  const setFilter = useCallback(
    (next: RecognitionFilterState) => {
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev)
          const awards = serializeAwardIds(next.awards)
          if (awards) params.set('awards', awards)
          else params.delete('awards')

          const tier = serializeTierId(next.tier)
          if (tier) params.set('tier', tier)
          else params.delete('tier')

          return params
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  return [filter, setFilter]
}
