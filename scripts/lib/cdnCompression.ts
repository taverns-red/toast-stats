/**
 * Is a CDN JSON response compressed on the wire, and does it decode to one
 * layer of JSON? (#1852)
 *
 * Two storage classes reach the browser through cdn.taverns.red:
 * - snapshots/ and time-series/ are stored gzip (`-Z`, which also sets
 *   `no-transform`) and served pre-encoded;
 * - v1/ and config/ are stored identity (gcs-upload.sh refuses `-Z` and
 *   no-transform there) and compressed at the edge by Cloud CDN dynamic
 *   compression (backend bucket `--compression-mode=AUTOMATIC`).
 *
 * Dynamic compression (docs.cloud.google.com/cdn/docs/dynamic-compression)
 * leaves a response alone when it already has a Content-Encoding, has
 * `no-transform`, or is under 1 KiB or over 10 MiB. It prefers brotli.
 */

import * as zlib from 'node:zlib'

export const DYNAMIC_COMPRESSION_MIN_BYTES = 1024
export const DYNAMIC_COMPRESSION_MAX_BYTES = 10 * 1024 * 1024

export interface CdnResponse {
  path: string
  status: number
  /** Lower-cased header names. */
  headers: Record<string, string>
  /** Bytes on the wire (the body as received, before any decode). */
  wireBytes: number
}

export type VerdictKind =
  | 'edge-compressed'
  | 'stored-gzip'
  | 'below-threshold'
  | 'uncompressed'
  | 'too-large'
  | 'bad-encoding'
  | 'http-error'

export interface Verdict {
  path: string
  ok: boolean
  kind: VerdictKind
  detail: string
}

const EDGE_ENCODINGS = new Set(['br', 'gzip'])

export function classifyCdnResponse(r: CdnResponse): Verdict {
  const h = r.headers
  const verdict = (ok: boolean, kind: VerdictKind, detail: string) => ({
    path: r.path,
    ok,
    kind,
    detail,
  })
  if (r.status !== 200) {
    return verdict(false, 'http-error', `HTTP ${r.status}`)
  }
  const served = (h['content-encoding'] ?? 'identity').trim().toLowerCase()
  const stored = (h['x-goog-stored-content-encoding'] ?? 'identity')
    .trim()
    .toLowerCase()
  const storedBytes = Number(h['x-goog-stored-content-length'] ?? r.wireBytes)

  if (stored === 'gzip') {
    return served === 'gzip'
      ? verdict(
          true,
          'stored-gzip',
          `stored gzip, ${r.wireBytes} B on the wire`
        )
      : verdict(
          false,
          'bad-encoding',
          `stored gzip but served Content-Encoding '${served}'`
        )
  }
  if (served !== 'identity') {
    return EDGE_ENCODINGS.has(served)
      ? verdict(
          true,
          'edge-compressed',
          `${served}: ${storedBytes} B stored, ${r.wireBytes} B on the wire`
        )
      : verdict(
          false,
          'bad-encoding',
          `unexpected Content-Encoding '${served}'`
        )
  }
  if (storedBytes < DYNAMIC_COMPRESSION_MIN_BYTES) {
    return verdict(
      true,
      'below-threshold',
      `${storedBytes} B: under the CDN's 1 KiB compression floor`
    )
  }
  if (storedBytes > DYNAMIC_COMPRESSION_MAX_BYTES) {
    return verdict(
      false,
      'too-large',
      `${storedBytes} B: over the CDN's 10 MiB dynamic-compression ceiling`
    )
  }
  const cacheControl = (h['cache-control'] ?? '').toLowerCase()
  return verdict(
    false,
    'uncompressed',
    cacheControl.includes('no-transform')
      ? `${storedBytes} B served identity: Cache-Control has no-transform, which disables CDN dynamic compression`
      : `${storedBytes} B served identity: is the backend bucket's compression-mode AUTOMATIC (or is this a cache entry from before the switch)?`
  )
}

const isGzip = (b: Buffer) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b

/**
 * Peel the one Content-Encoding layer the browser peels, then require JSON.
 * Throws on gzip left over (a #1702 double encode, or gzip served as
 * identity) and on bytes that do not parse.
 */
export function decodeCdnBody(
  body: Buffer,
  contentEncoding: string | undefined
): Buffer {
  const enc = (contentEncoding ?? 'identity').trim().toLowerCase()
  let out: Buffer
  if (enc === 'br') out = zlib.brotliDecompressSync(body)
  else if (enc === 'gzip') out = zlib.gunzipSync(body)
  else if (enc === 'identity') out = body
  else throw new Error(`unsupported Content-Encoding '${enc}'`)
  if (isGzip(out)) {
    throw new Error(
      `still gzip after decoding Content-Encoding '${enc}' (double-encoded or mislabelled)`
    )
  }
  try {
    JSON.parse(out.toString('utf-8'))
  } catch (err) {
    throw new Error(`decoded body is not JSON: ${(err as Error).message}`)
  }
  return out
}
