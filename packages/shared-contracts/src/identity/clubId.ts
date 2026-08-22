/**
 * Canonical club identity (#1440) — ONE definition of "the same club".
 *
 * Toastmasters club numbers reach us in more than one lexical form. TI's
 * `clubPerformance` export writes `00009905`; its `districtPerformance`
 * export writes `9905` — sometimes within a single snapshot (pinned by
 * `DataTransformer.test.ts`'s Club 00009905 regression). CSV import quirks add
 * leading apostrophes and stray whitespace on top.
 *
 * Before #1440 three private conventions coexisted across eight call sites
 * (raw / leading-zeros-stripped / 8-char zero-padded), with no shared
 * definition, and every disagreement degraded to an EMPTY STATE rather than an
 * error: a `.find()` that returns undefined renders "Club Not Found"; a missing
 * object key renders "not in the club index"; a diff keyed on the raw id
 * reports an entire district's roster as removed-and-re-added. That is the
 * Lesson 47 silent-lookup signature — a live instance is indistinguishable
 * from "this club genuinely has no data".
 *
 * The canonical form is the BARE digit string (leading zeros stripped) —
 * promoted from the transformer's long-standing private `normalizeClubId`,
 * which the clubPerformance↔districtPerformance join has always depended on.
 * It is width-independent, so a future club number wider than 8 digits cannot
 * break it the way a fixed `padStart(8, '0')` would.
 *
 * Apply it at BOTH ends:
 *   - write time — the transformer canonicalizes before an id lands in a
 *     snapshot, and the club index inherits that key form;
 *   - read time — every comparison and key lookup normalizes both sides, so a
 *     padded URL against a bare stored id (and the reverse) both resolve.
 *
 * Historical snapshots are never rewritten; read-time normalization covers
 * them. An agreement test (`__tests__/club-id-agreement.test.ts`) pins every
 * site to this module so a ninth site cannot silently diverge.
 *
 * @module identity/clubId
 */

/**
 * Reduce any club-id form to its canonical (bare) representation.
 *
 * - `'00009905'`, `'9905'`, `9905`, `"'9905"`, `' 9905 '` → `'9905'`
 * - all-zeros (`'0000'`, `'0'`) → `'0'` — never an empty string, and one
 *   canonical form so the padded/bare round trip holds even for that
 *   degenerate id
 * - nullish / blank → `''` (an absent id, which never matches anything)
 * - a digit-free id is preserved (trimmed) rather than collapsed, so two
 *   distinct non-numeric ids cannot land on the same key
 */
export function normalizeClubId(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  const text = typeof raw === 'number' ? String(raw) : String(raw).trim()
  if (text === '') return ''
  const digits = text.replace(/\D/g, '')
  // No digits at all: not a club number we can canonicalize. Preserve the
  // trimmed input so distinct ids stay distinct.
  if (digits === '') return text
  const stripped = digits.replace(/^0+/, '')
  return stripped === '' ? '0' : stripped
}

/**
 * True when two club ids denote the same club, in EITHER padding direction.
 *
 * An absent id (nullish, blank) never matches — including against another
 * absent id, so a record with no club number cannot collide with a lookup
 * that has no club number.
 */
export function clubIdsMatch(a: unknown, b: unknown): boolean {
  const left = normalizeClubId(a)
  if (left === '') return false
  return left === normalizeClubId(b)
}

/**
 * Look up a club in an object keyed by club id (`config/club-index.json`,
 * `data.clubs`), tolerating a key form that differs from the caller's id.
 *
 * Own keys only — a bare `record[clubId]` resolves inherited
 * `Object.prototype` members ('constructor', '__proto__', 'toString') to
 * phantom truthy hits (#1112), which is how an unknown club once came back as
 * `available: true` with an undefined district. (`hasOwnProperty.call` rather
 * than `Object.hasOwn`: this package compiles against the ES2020 lib.)
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
