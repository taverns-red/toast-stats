import { describe, it, expect, vi } from 'vitest'
import type { RangeResponse, Source } from 'pmtiles'
import { PrefetchedHeadSource } from '../prefetchedHeadSource'
import type { BasemapHead } from '../basemapPrefetch'

/* #1943 — pmtiles reads the header (bytes 0–16383) and then, once the worker
 * asks for the first tile, the first leaf directory, which in the world
 * z0–10 build sits at bytes 2019–13173: inside the same 16 KiB. Serving both
 * from the early prefetch removes two serial round trips from the
 * after-MapLibre critical path. Anything outside the prefetched bytes goes to
 * the real FetchSource unchanged. */

const URL = 'https://cdn.example.test/basemap/world.pmtiles'

function head(etag?: string): BasemapHead {
  const bytes = new Uint8Array(16384)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
  return { data: bytes.buffer, etag, cacheControl: 'public, max-age=86400' }
}

function fallback(): Source & { getBytes: ReturnType<typeof vi.fn> } {
  return {
    getKey: () => URL,
    getBytes: vi.fn(async (): Promise<RangeResponse> => ({
      data: new ArrayBuffer(4),
      etag: '"net"',
    })),
  }
}

describe('PrefetchedHeadSource', () => {
  it('keys the archive by its URL, so the pmtiles protocol finds it', () => {
    const src = new PrefetchedHeadSource(
      URL,
      Promise.resolve(head()),
      fallback()
    )
    expect(src.getKey()).toBe(URL)
  })

  it('serves the header read from the prefetched bytes', async () => {
    const net = fallback()
    const src = new PrefetchedHeadSource(
      URL,
      Promise.resolve(head('"e1"')),
      net
    )
    const r = await src.getBytes(0, 16384)
    expect(net.getBytes).not.toHaveBeenCalled()
    expect(r.data.byteLength).toBe(16384)
    expect(r.etag).toBe('"e1"')
    expect(r.cacheControl).toBe('public, max-age=86400')
  })

  it('serves the first leaf directory (2019–13173) from the same bytes', async () => {
    const net = fallback()
    const src = new PrefetchedHeadSource(
      URL,
      Promise.resolve(head('"e1"')),
      net
    )
    const r = await src.getBytes(2019, 11155, undefined, '"e1"')
    expect(net.getBytes).not.toHaveBeenCalled()
    const got = new Uint8Array(r.data)
    expect(got.byteLength).toBe(11155)
    expect(got[0]).toBe(2019 % 251)
    expect(got[11154]).toBe((2019 + 11154) % 251)
  })

  it('goes to the network for bytes beyond the prefetch', async () => {
    const net = fallback()
    const ctrl = new AbortController()
    const src = new PrefetchedHeadSource(
      URL,
      Promise.resolve(head('"e1"')),
      net
    )
    const r = await src.getBytes(3711918, 67863, ctrl.signal, '"e1"')
    expect(net.getBytes).toHaveBeenCalledWith(
      3711918,
      67863,
      ctrl.signal,
      '"e1"'
    )
    expect(r.etag).toBe('"net"')
  })

  it('goes to the network for a read that straddles the prefetch end', async () => {
    const net = fallback()
    const src = new PrefetchedHeadSource(URL, Promise.resolve(head()), net)
    await src.getBytes(16000, 1000)
    expect(net.getBytes).toHaveBeenCalledTimes(1)
  })

  it('goes to the network when the caller expects a different etag', async () => {
    const net = fallback()
    const src = new PrefetchedHeadSource(
      URL,
      Promise.resolve(head('"old"')),
      net
    )
    await src.getBytes(2019, 100, undefined, '"new"')
    expect(net.getBytes).toHaveBeenCalledTimes(1)
  })

  it('goes to the network when the prefetch failed', async () => {
    const net = fallback()
    const src = new PrefetchedHeadSource(URL, Promise.resolve(null), net)
    await src.getBytes(0, 16384)
    expect(net.getBytes).toHaveBeenCalledWith(0, 16384, undefined, undefined)
  })

  it('returns a copy, so pmtiles cannot detach the shared prefetch buffer', async () => {
    const src = new PrefetchedHeadSource(
      URL,
      Promise.resolve(head()),
      fallback()
    )
    const a = await src.getBytes(0, 16384)
    const b = await src.getBytes(0, 16384)
    expect(a.data).not.toBe(b.data)
  })
})
