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
 *
 * #1440 widened this in two ways, both needed by the sites it adopts:
 *
 *   - It takes `unknown`. The callers are raw scraped records and parsed JSON
 *     (`row['Club Number']`, `parsed['clubId']`), where the value is typed
 *     `unknown` / `string | number | null` — normalizing at the boundary beats
 *     a `String(...)` cast at every call site, each of which is a chance to
 *     get the nullish case wrong.
 *   - It strips non-digits before comparing. `clubPerformance` rows arrive
 *     with CSV import debris — a leading apostrophe (`'180`), an embedded
 *     label (`Club 180`) — which `FindAClubMerger` has tolerated since #429.
 *     That tolerance moved here rather than staying a private third
 *     convention. A digit-FREE id is preserved as-is, so two distinct
 *     non-numeric ids can never normalize onto the same key.
 */
export function normalizeClubId(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  const trimmed = typeof raw === 'number' ? String(raw) : String(raw).trim()
  if (trimmed === '') return ''
  const digits = trimmed.replace(/\D/g, '')
  // Nothing numeric to canonicalize — keep the id distinct rather than
  // collapsing it into the empty bucket.
  if (digits === '') return trimmed
  const stripped = digits.replace(/^0+/, '')
  return stripped === '' ? digits : stripped
}

/**
 * True when two club ids name the same club, in EITHER padding direction —
 * stored-bare/looked-up-padded and stored-padded/looked-up-bare both match.
 *
 * A missing or empty id never matches: an absent id is not an identity, and
 * treating two absences as equal would join unrelated rows.
 */
export function clubIdsMatch(a: unknown, b: unknown): boolean {
  const left = normalizeClubId(a)
  if (left === '') return false
  return left === normalizeClubId(b)
}

/**
 * Look up a club in an object keyed by club id (`config/club-index.json`,
 * `data.clubs`), tolerating a key form that differs from the caller's id
 * (#1440).
 *
 * The index inherits whichever form the snapshot that generated it stored, so
 * an exact-key lookup turns a padding difference into "club X is not in the
 * club index" — indistinguishable from a genuinely unknown club.
 *
 * Own keys only: a bare `record[clubId]` resolves inherited `Object.prototype`
 * members ('constructor', '__proto__', 'toString') to phantom truthy hits
 * (#1112), which is how an unknown club once came back as available with an
 * undefined district. (`hasOwnProperty.call` rather than `Object.hasOwn`:
 * this package compiles against the ES2020 lib.)
 */
export function findClubEntry<T>(
  clubs: Readonly<Record<string, T>> | null | undefined,
  clubId: unknown
): T | undefined {
  if (!clubs) return undefined
  const target = normalizeClubId(clubId)
  if (target === '') return undefined

  // Fast path: the id is already in the stored key form.
  if (
    typeof clubId === 'string' &&
    Object.prototype.hasOwnProperty.call(clubs, clubId)
  ) {
    return clubs[clubId]
  }

  for (const [key, value] of Object.entries(clubs)) {
    if (normalizeClubId(key) === target) return value
  }
  return undefined
}
