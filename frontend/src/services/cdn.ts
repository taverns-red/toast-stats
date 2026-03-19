/**
 * CDN Client — Fetches pre-computed analytics directly from Cloud CDN
 *
 * The data pipeline writes JSON files to GCS which are served via Cloud CDN
 * at cdn.taverns.red. This client constructs URLs to these files and fetches
 * them directly, bypassing the Express backend for static analytics data.
 *
 * File layout in GCS:
 *   v1/latest.json                              → current snapshot date
 *   v1/dates.json                               → all available dates
 *   snapshots/{date}/analytics/district_{id}_{type}.json → per-district analytics
 *   config/district-snapshot-index.json          → date availability per district
 *
 * Fixes: #168 — Serve analytics via GCS + Cloud CDN
 */

const CDN_BASE_URL =
  import.meta.env['VITE_CDN_BASE_URL'] || 'https://cdn.taverns.red'

/**
 * CDN manifest — returned by v1/latest.json
 */
export interface CdnManifest {
  _format?: { version: string; type: string }
  latestSnapshotDate: string
  generatedAt: string
}

/**
 * CDN dates index — returned by v1/dates.json
 */
export interface CdnDatesIndex {
  _format?: { version: string; type: string }
  dates: string[]
  count: number
  generatedAt: string
}

// Cache the latest snapshot date to avoid re-fetching on every hook call
let cachedManifest: CdnManifest | null = null
let manifestPromise: Promise<CdnManifest> | null = null

/**
 * Fetch the CDN manifest to discover the current snapshot date.
 * Caches the result for the lifetime of the page (SPA).
 */
export async function fetchCdnManifest(): Promise<CdnManifest> {
  if (cachedManifest) return cachedManifest
  if (manifestPromise) return manifestPromise

  manifestPromise = fetch(`${CDN_BASE_URL}/v1/latest.json`)
    .then(res => {
      if (!res.ok) throw new Error(`CDN manifest fetch failed: ${res.status}`)
      return res.json() as Promise<CdnManifest>
    })
    .then(manifest => {
      cachedManifest = manifest
      return manifest
    })
    .catch(err => {
      manifestPromise = null // Allow retry on next call
      throw err
    })

  return manifestPromise
}

/**
 * Fetch all available snapshot dates from CDN.
 */
export async function fetchCdnDates(): Promise<CdnDatesIndex> {
  const res = await fetch(`${CDN_BASE_URL}/v1/dates.json`)
  if (!res.ok) throw new Error(`CDN dates fetch failed: ${res.status}`)
  return res.json() as Promise<CdnDatesIndex>
}

/**
 * CDN rankings — returned by v1/rankings.json
 * Generated from all-districts-rankings.json during the data pipeline (#173)
 */
export interface CdnRankingsData {
  _format?: { version: string; type: string }
  rankings: Array<{
    districtId: string
    districtName: string
    region: string
    paidClubs: number
    paidClubBase: number
    clubGrowthPercent: number
    totalPayments: number
    paymentBase: number
    paymentGrowthPercent: number
    activeClubs: number
    distinguishedClubs: number
    selectDistinguished: number
    presidentsDistinguished: number
    distinguishedPercent: number
    clubsRank: number
    paymentsRank: number
    distinguishedRank: number
    aggregateScore: number
    overallRank: number
  }>
  date: string
  generatedAt: string
}

/**
 * Fetch district rankings from CDN.
 * The pipeline writes v1/rankings.json from all-districts-rankings.json.
 */
export async function fetchCdnRankings(): Promise<CdnRankingsData> {
  const res = await fetch(`${CDN_BASE_URL}/v1/rankings.json`)
  if (!res.ok) throw new Error(`CDN rankings fetch failed: ${res.status}`)
  return res.json() as Promise<CdnRankingsData>
}

/**
 * Construct a CDN URL for a pre-computed analytics file.
 *
 * @param date - Snapshot date (YYYY-MM-DD)
 * @param districtId - District ID
 * @param type - Analytics file type (e.g. 'analytics', 'membership', 'clubhealth')
 * @returns Full CDN URL
 */
export function cdnAnalyticsUrl(
  date: string,
  districtId: string,
  type: string
): string {
  return `${CDN_BASE_URL}/snapshots/${date}/analytics/district_${districtId}_${type}.json`
}

/**
 * Construct a CDN URL for a district snapshot file.
 */
export function cdnSnapshotUrl(date: string, districtId: string): string {
  return `${CDN_BASE_URL}/snapshots/${date}/district_${districtId}.json`
}

/**
 * Construct a CDN URL for the district snapshot index.
 */
export function cdnSnapshotIndexUrl(): string {
  return `${CDN_BASE_URL}/config/district-snapshot-index.json`
}

/**
 * Fetch a JSON file from CDN with typing.
 * Throws on non-OK responses for the caller to handle (e.g. fallback to Express).
 */
export async function fetchFromCdn<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`CDN fetch failed: ${res.status} for ${url}`)
  }
  return res.json() as Promise<T>
}

/**
 * Reset the cached manifest (useful for testing or forced refresh).
 */
export function resetCdnManifestCache(): void {
  cachedManifest = null
  manifestPromise = null
}

/**
 * Fetch a district snapshot from CDN.
 * Returns the full snapshot JSON (DistrictStatistics shape).
 */
export async function fetchCdnDistrictSnapshot<T>(
  date: string,
  districtId: string
): Promise<T> {
  return fetchFromCdn<T>(cdnSnapshotUrl(date, districtId))
}

/**
 * Fetch a pre-computed analytics file for a district.
 * @param type - Analytics type: 'analytics', 'membership', 'clubhealth',
 *   'distinguished-analytics', 'membership-analytics', 'vulnerable-clubs',
 *   'leadership-insights', 'year-over-year', 'performance-targets', 'club-trends-index'
 */
export async function fetchCdnDistrictAnalytics<T>(
  date: string,
  districtId: string,
  type: string
): Promise<T> {
  return fetchFromCdn<T>(cdnAnalyticsUrl(date, districtId, type))
}

/**
 * CDN snapshot index — maps districtIds to their available snapshot dates.
 */
export interface CdnSnapshotIndex {
  [districtId: string]: string[]
}

/**
 * Fetch the district snapshot index from CDN.
 * Returns a map of districtId → list of available dates.
 */
export async function fetchCdnSnapshotIndex(): Promise<CdnSnapshotIndex> {
  return fetchFromCdn<CdnSnapshotIndex>(cdnSnapshotIndexUrl())
}
