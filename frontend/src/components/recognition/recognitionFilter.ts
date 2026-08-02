/**
 * Recognition filter semantics + URL codec (#1362).
 *
 * The rules live here rather than in the page so they can be tested as rules,
 * and so the chip row and the table can never disagree about what a selection
 * means.
 *
 * **OR within a group, AND across groups** — conventional faceted search, and
 * consistent with the region filter already reading as "any of these regions":
 *
 *   awards=[Extension, Retention]  tier=Select
 *   → (Extension OR Retention) AND (tier >= Select)
 *
 * The tier leg is a **`>=` threshold**, not equality, because the tiers are an
 * ordinal ladder. The ordering is not restated here: it is `TierRecognition.
 * order` from the shared registry (#1361), which is the single description of
 * the recognition vocabulary. Same for the winner flags — the predicate reads
 * `winnerFlagKey` off the registry entry rather than naming CDN fields, so a
 * renamed flag is a compile error there instead of a filter that silently
 * matches nothing.
 */
import type { CompetitiveAwardStandings } from '../../services/cdn'
import {
  AWARD_RECOGNITION,
  TIER_RECOGNITION,
  tierRecognition,
  type AwardRecognitionId,
  type TierRecognitionId,
} from './recognitionRegistry'

export interface RecognitionFilterState {
  /** Selected competitive awards — OR'd together. */
  awards: readonly AwardRecognitionId[]
  /** Minimum Distinguished tier, or null for "any". */
  tier: TierRecognitionId | null
}

/** Module-level so its identity is stable across renders (the #978 pattern). */
export const EMPTY_RECOGNITION_FILTER: RecognitionFilterState = {
  awards: [],
  tier: null,
}

export const isRecognitionFilterActive = (
  filter: RecognitionFilterState
): boolean => filter.awards.length > 0 || filter.tier !== null

const AWARD_BY_ID = new Map(AWARD_RECOGNITION.map(a => [a.id, a]))
const TIER_ORDER_BY_ID = new Map(TIER_RECOGNITION.map(t => [t.id, t.order]))

/**
 * Does this district satisfy the filter?
 *
 * An ACTIVE filter with no standings matches nothing — the honest answer is
 * "we cannot say this district won anything", not "show it anyway". An empty
 * filter admits everything regardless, so the table is never hidden behind a
 * secondary query that is merely slow.
 */
export function districtMatchesRecognition(
  filter: RecognitionFilterState,
  districtId: string,
  standings: CompetitiveAwardStandings | null | undefined
): boolean {
  if (filter.awards.length > 0) {
    const flags = standings?.byDistrict?.[districtId]
    const holdsAny = filter.awards.some(id => {
      const award = AWARD_BY_ID.get(id)
      return award ? Boolean(flags?.[award.winnerFlagKey]) : false
    })
    if (!holdsAny) return false
  }

  if (filter.tier !== null) {
    const threshold = TIER_ORDER_BY_ID.get(filter.tier)
    if (threshold === undefined) return false
    // `tierRecognition` resolves NotDistinguished / Unknown / absent to
    // undefined — absence is the signal, the same convention the badge and the
    // row `data-tier` hook use.
    const held = tierRecognition(
      standings?.distinguishedDistrict?.[districtId]?.currentTier
    )
    if (!held || held.order < threshold) return false
  }

  return true
}

/* ── URL codec (?awards=extension,retention&tier=select) ────────────────────
   Tokens are derived from the registry ids, never a parallel list. Awards keep
   their id verbatim; tiers lower-case theirs, so the param reads as prose
   (`tier=select`) while the state stays the registry's `'Select'`. */

const AWARD_IDS: readonly AwardRecognitionId[] = AWARD_RECOGNITION.map(
  a => a.id
)

/**
 * Canonicalised: registry order, duplicates dropped. Click order must not
 * produce two different links for the same view.
 */
export function serializeAwardIds(
  awards: readonly AwardRecognitionId[]
): string {
  return AWARD_IDS.filter(id => awards.includes(id)).join(',')
}

/** Unknown tokens are dropped rather than failing the whole param. */
export function parseAwardIds(value: string): AwardRecognitionId[] {
  const wanted = new Set(
    value
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
  )
  return AWARD_IDS.filter(id => wanted.has(id.toLowerCase()))
}

export function serializeTierId(tier: TierRecognitionId | null): string {
  return tier === null ? '' : tier.toLowerCase()
}

export function parseTierId(value: string): TierRecognitionId | null {
  const token = value.trim().toLowerCase()
  if (!token) return null
  return TIER_RECOGNITION.find(t => t.id.toLowerCase() === token)?.id ?? null
}
