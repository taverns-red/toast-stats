/**
 * Canonical club-id comparison (#1437; the shared home #1440 asks for).
 *
 * Toastmasters emits a club number in two lexical forms — zero-padded
 * (`00009905`) and bare (`9905`) — and `DataTransformer.test.ts:772-780` pins
 * the case where BOTH arrive inside a SINGLE snapshot (one form in
 * `clubPerformance`, the other in `districtPerformance`). The transformer
 * stores whichever form arrived, verbatim. Nothing in the pipeline enforces
 * form stability across program years.
 *
 * So every strict `===` between a URL param and a stored `clubId` is a silent
 * miss waiting to happen: `.find()` returns `undefined`, the caller renders
 * "no data", and the result is indistinguishable from a club that genuinely
 * has no record (Lesson 47).
 *
 * `normalizeClubId` already existed as a PRIVATE method on `DataTransformer`,
 * used for exactly one join. This is that rule, promoted to the one package
 * frontend, analytics-core, collector-cli and mcp-server all depend on, so
 * there is one definition rather than a fourth copy. #1440 adopts it at the
 * remaining call sites; #1437 uses it in `useClubHistory`.
 *
 * Pure string logic, no I/O.
 */

/**
 * The canonical (bare) form of a club id: leading zeros stripped.
 *
 * An all-zeros input is preserved rather than collapsing to `''`, matching the
 * behaviour `DataTransformer.normalizeClubId` has always had — an empty key
 * would collide every malformed row into one bucket. Surrounding whitespace
 * from a CSV cell is trimmed first.
 */
export function normalizeClubId(clubId: string): string {
  const trimmed = clubId.trim()
  const stripped = trimmed.replace(/^0+/, '')
  return stripped === '' ? trimmed : stripped
}

/**
 * True when two club ids name the same club, in EITHER padding direction —
 * stored-bare/looked-up-padded and stored-padded/looked-up-bare both match.
 *
 * A missing or empty id never matches: an absent id is not an identity, and
 * treating two absences as equal would join unrelated rows.
 */
export function clubIdsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false
  const left = normalizeClubId(a)
  const right = normalizeClubId(b)
  if (left === '' || right === '') return false
  return left === right
}
