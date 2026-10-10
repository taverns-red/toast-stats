/**
 * Time-series publish plan (#1731, plan E2-1).
 *
 * Decides which local time-series files must be uploaded. A file is skipped
 * only when the live remote object already carries the same
 * `x-goog-meta-sha256` (the sha256 of the uncompressed JSON) and the CDN
 * headers the frontend depends on. Anything else (a missing object, an
 * object from before E2-1 with no sha, or wrong headers) is uploaded.
 *
 * Why it matters: `gcloud storage cp -Z` does not gzip deterministically, so
 * re-uploading identical content changes the stored crc32c every run, and
 * the cloud-to-cloud promotion rsync (which compares hashes) then re-copies
 * every object to prod. Skipping unchanged files keeps their generation and
 * hash, so promotion skips them too.
 *
 * The listing is the JSON of `gcloud storage objects list <prefix>**
 * --format=json`. Recorded real shapes live in
 * __tests__/fixtures/gcloud-objects-list/.
 */

export const TIME_SERIES_CONTENT_TYPE = 'application/json'
export const TIME_SERIES_CACHE_CONTROL = 'public, max-age=3600'

export interface RemoteObject {
  sha256: string | undefined
  contentEncoding: string | undefined
  contentType: string | undefined
  cacheControl: string | undefined
}

export interface LocalFile {
  /** Path relative to the store root, e.g. `district_61/2026-2027.json`. */
  rel: string
  /** sha256 hex of the file's bytes (uncompressed JSON). */
  sha256: string
}

export interface PublishPlan {
  upload: LocalFile[]
  unchanged: number
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined

/**
 * Parse an `objects list --format=json` listing into live objects by name.
 * Noncurrent generations (they carry `noncurrent_time`, and prod lists them)
 * are ignored. Throws on anything that is not an array of named objects, so
 * an unexpected shape fails the publish instead of re-uploading or skipping
 * blindly.
 */
export function parseObjectsListing(json: unknown): Map<string, RemoteObject> {
  if (!Array.isArray(json)) {
    throw new Error('objects listing is not a JSON array')
  }
  const out = new Map<string, RemoteObject>()
  for (const entry of json) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as { name?: unknown }).name !== 'string'
    ) {
      throw new Error(
        `objects listing entry has no name: ${JSON.stringify(entry)}`
      )
    }
    const e = entry as Record<string, unknown>
    if (e.noncurrent_time !== undefined) continue
    const custom = e.custom_fields
    const sha256 =
      typeof custom === 'object' && custom !== null
        ? str((custom as Record<string, unknown>).sha256)
        : undefined
    out.set(e.name as string, {
      sha256,
      contentEncoding: str(e.content_encoding),
      contentType: str(e.content_type),
      cacheControl: str(e.cache_control),
    })
  }
  return out
}

function isCurrent(remote: RemoteObject | undefined, sha256: string): boolean {
  return (
    remote !== undefined &&
    remote.sha256 === sha256 &&
    remote.contentEncoding === 'gzip' &&
    remote.contentType === TIME_SERIES_CONTENT_TYPE &&
    // gcloud appends ", no-transform" to a -Z upload's Cache-Control.
    (remote.cacheControl ?? '').startsWith(TIME_SERIES_CACHE_CONTROL)
  )
}

/**
 * @param objectPrefix the remote prefix the local store root maps onto,
 *   e.g. `time-series/`.
 */
export function planTimeSeriesUploads(
  local: LocalFile[],
  remote: Map<string, RemoteObject>,
  objectPrefix: string
): PublishPlan {
  const upload: LocalFile[] = []
  let unchanged = 0
  for (const file of local) {
    if (isCurrent(remote.get(`${objectPrefix}${file.rel}`), file.sha256)) {
      unchanged++
    } else {
      upload.push(file)
    }
  }
  return { upload, unchanged }
}
