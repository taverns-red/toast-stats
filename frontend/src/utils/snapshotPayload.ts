/**
 * The raw district snapshot's shape, in one small module (#1788): the CDN
 * envelope and the club-visit award fields. `extractDivisionPerformance` and
 * the map's visit-round filter both read through here, so they agree on
 * which raw field means "visited" without the map loading the extractor.
 */

/**
 * Unwrap a district snapshot to its payload — the single place that knows a
 * dated CDN snapshot is a `PerDistrictData` envelope.
 *
 * The live file is `{districtId, districtName, collectedAt, status, data}` with
 * the payload at `.data` (verified against `snapshots/2026-06-30/district_61.json`).
 * Already-unwrapped payloads are passed through, so both shapes work.
 *
 * Returns `undefined` for anything that isn't an object.
 */
export function unwrapSnapshotPayload(
  districtSnapshot: unknown
): Record<string, unknown> | undefined {
  if (typeof districtSnapshot !== 'object' || districtSnapshot === null) {
    return undefined
  }
  const raw = districtSnapshot as Record<string, unknown>
  return typeof raw['data'] === 'object' && raw['data'] !== null
    ? (raw['data'] as Record<string, unknown>)
    : raw
}

/**
 * Raw snapshot field(s) holding the qualifying club-visit award for a round.
 * R1 → `Nov Visit award`. R2 → `May Visit award`, with the lowercase
 * `May visit award` fallback the CDN sometimes emits (bug #268).
 */
export function currentRoundVisitFields(round: 1 | 2): string[] {
  return round === 1
    ? ['Nov Visit award']
    : ['May Visit award', 'May visit award']
}

/**
 * A club has completed the round's visit when any candidate field is exactly
 * `'1'` (string) or `1` (number) — mirrors `countVisitCompletions`.
 */
export function hasCompletedRoundVisit(
  club: Record<string, unknown>,
  fields: string[]
): boolean {
  return fields.some(f => {
    const v = club[f]
    return v === '1' || v === 1
  })
}
