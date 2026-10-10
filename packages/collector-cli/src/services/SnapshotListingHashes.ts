/**
 * SnapshotListingHashes — decide which overlap dates the value gate must
 * download (#1730, plan E2-4).
 *
 * Promotion copies `snapshots/{date}/all-districts-rankings.json` from staging
 * to prod byte for byte, so when the live object on both sides has the same
 * stored hash the bytes are the same, the digests are the same, and the date
 * is `unchanged`. Those dates need not be downloaded. Everything else is
 * fetched and compared exactly as before.
 *
 * Input is the JSON from `gcloud storage objects list
 * "gs://<bucket>/snapshots/*\/all-districts-rankings.json" --format=json`.
 * Recorded shape (fixtures/gcs-objects-list): `name`, `crc32c_hash`,
 * `md5_hash`, and `noncurrent_time` on noncurrent generations, which that
 * listing includes next to the live object.
 *
 * Fail-safe: an unusable listing on either side fetches every overlap date;
 * a date with no live entry, two live entries, or no comparable hash on
 * either side is fetched.
 */

const RANKINGS_NAME =
  /^snapshots\/(\d{4}-\d{2}-\d{2})\/all-districts-rankings\.json$/

export interface ObjectHashes {
  crc32c?: string
  md5?: string
}

/** date → live object hashes, or 'ambiguous' if it has several live entries. */
export type RankingsListing = Map<string, ObjectHashes | 'ambiguous'>

export interface ValueDiffFetchPlan {
  /** true when a listing was unusable and every overlap date is fetched */
  fullFetch: boolean
  reason: string
  /** overlap dates to download and compare (input order) */
  fetch: string[]
  /** overlap dates whose live hashes match on both sides (input order) */
  hashEqual: string[]
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/**
 * Parse a listing. Returns null when the listing is unusable: not an array,
 * or an entry that is not an object.
 */
export function parseRankingsListing(raw: unknown): RankingsListing | null {
  if (!Array.isArray(raw)) return null
  const map: RankingsListing = new Map()
  for (const item of raw) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return null
    }
    const entry = item as Record<string, unknown>
    // Noncurrent / soft-deleted generations are not what `cp` downloads.
    if (
      entry['noncurrent_time'] !== undefined ||
      entry['soft_delete_time'] !== undefined
    ) {
      continue
    }
    const name = nonEmptyString(entry['name'])
    const m = name ? RANKINGS_NAME.exec(name) : null
    if (!m) continue
    const date = m[1]!
    if (map.has(date)) {
      map.set(date, 'ambiguous')
      continue
    }
    const hashes: ObjectHashes = {}
    const crc32c = nonEmptyString(entry['crc32c_hash'])
    const md5 = nonEmptyString(entry['md5_hash'])
    if (crc32c) hashes.crc32c = crc32c
    if (md5) hashes.md5 = md5
    map.set(date, hashes)
  }
  return map
}

/**
 * Equal only when at least one hash kind is present on both sides and every
 * kind present on both sides matches. md5 is absent on composite objects, so
 * crc32c alone is enough when it is the only common kind.
 */
function hashesEqual(a: ObjectHashes, b: ObjectHashes): boolean {
  let compared = 0
  for (const kind of ['crc32c', 'md5'] as const) {
    const x = a[kind]
    const y = b[kind]
    if (x === undefined || y === undefined) continue
    if (x !== y) return false
    compared++
  }
  return compared > 0
}

export function planValueDiffFetch(
  overlapDates: string[],
  stagingListing: unknown,
  prodListing: unknown
): ValueDiffFetchPlan {
  const staging = parseRankingsListing(stagingListing)
  const prod = parseRankingsListing(prodListing)
  if (!staging || !prod) {
    const side =
      !staging && !prod
        ? 'both listings'
        : !staging
          ? 'staging listing'
          : 'prod listing'
    return {
      fullFetch: true,
      reason: `${side} unusable — full fetch of ${overlapDates.length} overlap date(s)`,
      fetch: [...overlapDates],
      hashEqual: [],
    }
  }

  const fetch: string[] = []
  const hashEqual: string[] = []
  for (const date of overlapDates) {
    const s = staging.get(date)
    const p = prod.get(date)
    if (
      s !== undefined &&
      p !== undefined &&
      s !== 'ambiguous' &&
      p !== 'ambiguous' &&
      hashesEqual(s, p)
    ) {
      hashEqual.push(date)
    } else {
      fetch.push(date)
    }
  }
  return {
    fullFetch: false,
    reason: `${fetch.length} of ${overlapDates.length} overlap date(s) differ or lack a comparable hash; ${hashEqual.length} hash-equal skipped`,
    fetch,
    hashEqual,
  }
}
