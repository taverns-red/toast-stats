/**
 * `SnapshotDate` — a nominal brand for the PINNED snapshot date (#1323, epic
 * #1319).
 *
 * ## Why this exists
 *
 * Toastmasters' month-end reconciliation pins a snapshot to the month-end
 * (`2026-06-30`) while the dashboard **as-of** date keeps advancing
 * (`sourceCsvDate = 2026-07-05`). The two are equal ~340 days a year and
 * diverge for ~1–3 weeks each close. Per-snapshot CDN files live under the
 * *pinned* date, so keying a fetch on the *as-of* date 404s → null → blank UI,
 * with no error. It passes every test and every mid-month check.
 *
 * That bug shipped four times (#1289, #1292, #1296, #1315) because one field
 * name — `date` — carried two divergent meanings and nothing distinguished
 * them. Sprints 1–3 of epic #1319 renamed the field (`asOfDate` vs
 * `snapshotDate`) and made the divergence the default in test fixtures. Those
 * catch the mistake. This makes it **unrepresentable**: a `string` no longer
 * satisfies a `snapshots/{date}/…` entry point, so recurrence #5 cannot compile.
 *
 * ## The contract
 *
 * A value is a `SnapshotDate` only if it came from a source that actually
 * enumerates snapshots — the CDN dates index, the manifest, or a date validated
 * against them. The brand is a *provenance* claim, not a format claim, so the
 * mints below are the ONLY way to make one. `as SnapshotDate` re-admits the
 * whole bug class in five characters and is banned by ESLint outside this
 * module (`no-restricted-syntax`, guarded by
 * `src/__tests__/lint/no-snapshot-date-cast.test.ts`).
 *
 * ## What is deliberately NOT a SnapshotDate
 *
 * - `asOfDate` / `metadata.sourceCsvDate` — the advancing as-of date. Display
 *   and provenance only. This is the #1315 bug.
 * - `ProgramYear.startDate` / `.endDate` — synthesized calendar bounds
 *   (`${year + 1}-06-30`), not dates any snapshot was written under.
 * - `new Date()` / `todayIso()` — the wall clock never names a snapshot.
 *
 * @see tasks/lessons/lessons/key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate.md
 */

/**
 * A date string known to name a real, pinned CDN snapshot.
 *
 * Assignable TO `string` (so display/formatting helpers need no change) but not
 * FROM one — that asymmetry is the entire guard.
 */
export type SnapshotDate = string & { readonly __brand: 'SnapshotDate' }

/** Shape of the CDN dates index (`v1/dates.json`) this module mints from. */
interface DatesIndexLike {
  dates: string[]
}

/** Shape of the CDN manifest (`v1/latest.json`) this module mints from. */
interface ManifestLike {
  latestSnapshotDate: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * True when `raw` is a well-formed, real calendar date in `YYYY-MM-DD`.
 *
 * Shape alone is not enough: `2026-13-01` and `2026-02-29` match the regex but
 * name no day. `Date` silently rolls those forward (Feb 29 → Mar 1), so the
 * round-trip back through `toISOString` is what actually rejects them — if the
 * date were real it would serialize to the same string it parsed from.
 */
function isIsoCalendarDate(raw: string): boolean {
  if (!ISO_DATE.test(raw)) return false
  const parsed = new Date(`${raw}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(raw)
}

/**
 * Mint a `SnapshotDate` from an untrusted string — a URL `?date=` / `?from=` /
 * `?to=` value, or a public API parameter.
 *
 * This validates FORMAT, which is weaker than the brand's provenance promise:
 * it cannot know whether a snapshot was actually written under this date. It is
 * the right mint only where the value is a user-supplied *selection* from dates
 * the app already offered (the picker's options come from the index) and where
 * a wrong date degrades to a 404-and-fallback rather than silently wrong data.
 * Prefer {@link snapshotDatesFrom} whenever the index is at hand — narrowing an
 * element of the real list carries the provenance this cannot.
 *
 * @returns the branded date, or `undefined` if `raw` is absent or not a real
 *   `YYYY-MM-DD` calendar date.
 */
export function toSnapshotDate(
  raw: string | null | undefined
): SnapshotDate | undefined {
  if (!raw) return undefined
  return isIsoCalendarDate(raw) ? (raw as SnapshotDate) : undefined
}

/**
 * Mint every snapshot date in a CDN dates index — the primary mint. These dates
 * come from the pipeline's own enumeration of what it wrote, which is exactly
 * the provenance the brand claims.
 *
 * Malformed entries are dropped rather than trusted wholesale: an index is a
 * remote JSON payload, and a brand minted from an unvalidated source is
 * laundering, not validation.
 *
 * Order is preserved — callers sort for themselves.
 */
export function snapshotDatesFrom(
  index: DatesIndexLike | null | undefined
): SnapshotDate[] {
  return (index?.dates ?? []).filter(isIsoCalendarDate) as SnapshotDate[]
}

/**
 * Mint the latest snapshot date from the CDN manifest (`v1/latest.json`) — the
 * pipeline's own statement of the newest snapshot it wrote.
 *
 * @returns `undefined` while the manifest query is in flight, or if the
 *   manifest's date is malformed.
 */
export function snapshotDateFromManifest(
  manifest: ManifestLike | null | undefined
): SnapshotDate | undefined {
  return toSnapshotDate(manifest?.latestSnapshotDate)
}
