/**
 * Read a GCS-backed store file whatever number of gzip layers it carries
 * (#1702).
 *
 * The time-series objects are uploaded with `gcloud storage cp -Z`, so they
 * are stored `Content-Encoding: gzip`. Whether a download decompresses them
 * depends on the tool and SDK version: `gsutil rsync` did, `gcloud storage
 * rsync` on the CI runner (SDK ~588) does not. The non-decompressing download
 * plus the next `-Z` upload added one layer per run, ~10 by the time it was
 * caught. Peeling every layer on read makes any depth, including zero, load
 * as the plain JSON the writer produced.
 */

import { promises as fs } from 'node:fs'
import { gunzipSync } from 'node:zlib'

/** RFC 1952 member header: ID1 = 0x1f, ID2 = 0x8b. */
const GZIP_ID1 = 0x1f
const GZIP_ID2 = 0x8b

/**
 * Upper bound on layers peeled before giving up. The incident reached ~10;
 * the cap keeps a pathological input from looping without bound.
 */
export const MAX_GZIP_LAYERS = 64

export class GzipLayerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'GzipLayerError'
  }
}

/** True when the buffer starts with the gzip magic bytes `1f 8b`. */
export function isGzipped(buf: Uint8Array): boolean {
  return buf.length >= 2 && buf[0] === GZIP_ID1 && buf[1] === GZIP_ID2
}

/**
 * Gunzip repeatedly until the bytes no longer start with the gzip magic.
 * Plain input comes back as-is with `layers: 0`. A layer whose header is
 * present but whose body does not inflate throws `GzipLayerError`.
 */
export function peelGzipLayers(
  input: Buffer,
  maxLayers: number = MAX_GZIP_LAYERS
): { data: Buffer; layers: number } {
  let data = input
  let layers = 0
  while (isGzipped(data)) {
    if (layers >= maxLayers) {
      throw new GzipLayerError(
        `more than ${maxLayers} gzip layers; refusing to keep peeling`
      )
    }
    try {
      data = gunzipSync(data)
    } catch (err) {
      throw new GzipLayerError(
        `gzip layer ${layers + 1} does not inflate: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err }
      )
    }
    layers++
  }
  return { data, layers }
}

/**
 * Read a store file as UTF-8 text with every gzip layer removed. Filesystem
 * errors (ENOENT included) propagate unchanged, so callers keep their
 * "store doesn't exist yet" branch.
 */
export async function readStoreFileText(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath)
  return peelGzipLayers(raw).data.toString('utf-8')
}
