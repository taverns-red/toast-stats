/**
 * basemapPrefetch — read the archive head while MapLibre is still loading
 * (#1943).
 *
 * pmtiles reads the first 16 KiB of the archive (header, root directory,
 * metadata) only once MapLibre has loaded, parsed and built the map, and it
 * reads the first leaf directory only after the worker has booted and asked
 * for a tile. In the world z0–10 build that leaf directory (bytes 2019–13173)
 * lies inside the same 16 KiB. Measured under the mobile profile (150 ms RTT,
 * 1.6 Mbps, 4× CPU), those two reads were serial round trips after the
 * 232 KB MapLibre chunk had arrived.
 *
 * This module starts that one read as soon as the map route renders, in
 * parallel with the MapLibre chunk, and keeps the bytes for
 * `PrefetchedHeadSource`. It is plain `fetch` with no pmtiles import, so it
 * adds nothing heavy to the page chunk. Any failure resolves `null` and
 * pmtiles reads the head itself, exactly as before.
 */

/** pmtiles' own first read: header + root directory, one request. */
export const BASEMAP_HEAD_BYTES = 16384

export interface BasemapHead {
  data: ArrayBuffer
  etag?: string
  cacheControl?: string
  expires?: string
}

const heads = new Map<string, Promise<BasemapHead | null>>()

async function readHead(
  url: string,
  fetchImpl: typeof fetch
): Promise<BasemapHead | null> {
  try {
    const resp = await fetchImpl(url, {
      headers: { range: `bytes=0-${BASEMAP_HEAD_BYTES - 1}` },
    })
    if (resp.status !== 206 && resp.status !== 200) return null
    // A 200 is only usable when it is the whole (tiny) archive; a server that
    // ignores Range would otherwise stream gigabytes.
    if (resp.status === 200) {
      const length = Number(resp.headers.get('content-length'))
      if (!length || length > BASEMAP_HEAD_BYTES) return null
    }
    const data = await resp.arrayBuffer()
    if (data.byteLength > BASEMAP_HEAD_BYTES) return null
    const head: BasemapHead = { data }
    const etag = resp.headers.get('etag')
    // Weak etags are useless for range consistency (pmtiles drops them too).
    if (etag && !etag.startsWith('W/')) head.etag = etag
    const cacheControl = resp.headers.get('cache-control')
    if (cacheControl) head.cacheControl = cacheControl
    const expires = resp.headers.get('expires')
    if (expires) head.expires = expires
    return head
  } catch {
    return null
  }
}

/** Starts (once per URL) and returns the head read. Never rejects. */
export function prefetchBasemapHead(
  url: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args)
): Promise<BasemapHead | null> {
  let head = heads.get(url)
  if (!head) {
    head = readHead(url, fetchImpl)
    heads.set(url, head)
  }
  return head
}

/** Tests only: forget every prefetched head. */
export function resetBasemapHeadPrefetch(): void {
  heads.clear()
}
