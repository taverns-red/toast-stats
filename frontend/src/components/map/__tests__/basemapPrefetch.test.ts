import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  BASEMAP_HEAD_BYTES,
  prefetchBasemapHead,
  resetBasemapHeadPrefetch,
} from '../basemapPrefetch'

/* #1943 — the first 16 KiB of the archive (header, root directory, metadata
 * and the first leaf directory of the world z0–10 build) is fetched as soon
 * as the map route renders, in parallel with the MapLibre chunk, instead of
 * after it. Response shapes follow what cdn.taverns.red returns for the real
 * object (observed 2026-10-13): 206, `content-range: bytes 0-16383/3782079721`,
 * a strong `etag`, `cache-control: public, max-age=86400, no-transform`. */

const URL = 'https://cdn.example.test/basemap/world.pmtiles'

function cdn206(bytes = BASEMAP_HEAD_BYTES, etag = '"9b7c"'): Response {
  return new Response(new Uint8Array(bytes).fill(7), {
    status: 206,
    headers: {
      'content-range': `bytes 0-${bytes - 1}/3782079721`,
      'content-length': String(bytes),
      etag,
      'cache-control': 'public, max-age=86400, no-transform',
    },
  })
}

describe('prefetchBasemapHead', () => {
  beforeEach(() => resetBasemapHeadPrefetch())

  it('requests exactly the first 16 KiB with a Range header', async () => {
    const fetchImpl = vi.fn(async () => cdn206())
    const head = await prefetchBasemapHead(URL, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as Parameters<
      typeof fetch
    >
    expect(url).toBe(URL)
    expect(new Headers(init?.headers).get('range')).toBe('bytes=0-16383')
    expect(head?.data.byteLength).toBe(16384)
    expect(head?.etag).toBe('"9b7c"')
    expect(head?.cacheControl).toBe('public, max-age=86400, no-transform')
  })

  it('fetches once per URL, however many times the map renders', async () => {
    const fetchImpl = vi.fn(async () => cdn206())
    const a = prefetchBasemapHead(URL, fetchImpl)
    const b = prefetchBasemapHead(URL, fetchImpl)
    expect(a).toBe(b)
    await a
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('drops a weak etag, as pmtiles FetchSource does', async () => {
    const head = await prefetchBasemapHead(URL, async () =>
      cdn206(BASEMAP_HEAD_BYTES, 'W/"weak"')
    )
    expect(head?.etag).toBeUndefined()
  })

  it('resolves null, never rejects, when the request fails', async () => {
    const head = await prefetchBasemapHead(URL, async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(head).toBeNull()
  })

  it('resolves null on an error status', async () => {
    const head = await prefetchBasemapHead(
      URL,
      async () => new Response('nope', { status: 403 })
    )
    expect(head).toBeNull()
  })

  it('resolves null when the server ignores Range and sends the whole file', async () => {
    const head = await prefetchBasemapHead(
      URL,
      async () =>
        new Response(new Uint8Array(10), {
          status: 200,
          headers: { 'content-length': '3782079721' },
        })
    )
    expect(head).toBeNull()
  })

  it('accepts a 200 for an archive smaller than 16 KiB', async () => {
    const head = await prefetchBasemapHead(
      URL,
      async () =>
        new Response(new Uint8Array(900), {
          status: 200,
          headers: { 'content-length': '900' },
        })
    )
    expect(head?.data.byteLength).toBe(900)
  })
})
