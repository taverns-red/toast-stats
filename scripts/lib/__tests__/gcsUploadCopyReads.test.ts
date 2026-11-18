/**
 * #2980: a `copy` can outlast one access token (the z14 basemap is ~69 GB, a
 * token lasts an hour), and its source reads must trust only what a ranged
 * GET proves.
 *
 * - Token: the helper asks an injected provider for a fresh token before a
 *   source GET once the current one is older than tokenMaxAgeMs, and on a 401
 *   re-mints and retries that chunk exactly once. A second 401 is fatal.
 * - Reads: a 200 that ignores Range on a partial chunk is fatal, a short 206
 *   is retried, a 206 whose Content-Range starts at the wrong offset is fatal.
 *
 * The upload session URL carries no token, so only the reads (and the
 * initiation POST) use one.
 */
import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { uploadObject, type UploadOptions } from '../gcsUpload'

const SESSION = 'https://storage.googleapis.com/upload/storage/v1/b/b/o?u=1'
const DATA = 'hello-bytes' // 11 bytes, chunkSize 4 -> 3 chunks
const MD5 = createHash('md5').update(DATA).digest('base64')

type Get = (n: number, range: [number, number], auth: string) => Response

/** Staging source plus a destination session. `get` answers ranged GETs. */
const world = (get: Get) => {
  const gets: { auth: string; range: string }[] = []
  const auths: string[] = []
  let received = ''
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    const h = (init.headers ?? {}) as Record<string, string>
    if (h['Authorization']) auths.push(h['Authorization'])
    if (init.method === 'POST')
      return new Response('{}', { status: 200, headers: { Location: SESSION } })
    if (init.method === 'PUT') {
      received += Buffer.from(
        await new Response(init.body as BodyInit).arrayBuffer()
      ).toString()
      const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(h['Content-Range']!)
      if (m && Number(m[2]) + 1 < Number(m[3]))
        return new Response('', {
          status: 308,
          headers: { Range: `bytes=0-${m[2]}` },
        })
      return new Response(JSON.stringify({ md5Hash: MD5 }), { status: 200 })
    }
    if (url.includes('alt=media')) {
      const r = /^bytes=(\d+)-(\d+)$/.exec(h['Range']!)!
      gets.push({ auth: h['Authorization']!, range: h['Range']! })
      return get(gets.length, [Number(r[1]), Number(r[2])], h['Authorization']!)
    }
    return new Response(
      JSON.stringify({ size: String(DATA.length), md5Hash: MD5 }),
      { status: 200 }
    )
  }) as unknown as typeof fetch
  return { fetchFn, gets, auths, received: () => received }
}

/** A correct 206 for [a, b]. */
const part = (
  [a, b]: [number, number],
  over: { start?: number; body?: string } = {}
): Response => {
  const body = over.body ?? DATA.slice(a, b + 1)
  const start = over.start ?? a
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${start + body.length - 1}/${DATA.length}`,
    },
  })
}

const copy = (
  fetchFn: typeof fetch,
  over: Partial<UploadOptions> = {}
): UploadOptions => ({
  bucket: 'b',
  object: 'basemap/x.pmtiles',
  source: { kind: 'gcs', bucket: 'stg', object: 'basemap/x.pmtiles' },
  contentType: 'application/octet-stream',
  cacheControl: 'public, max-age=86400, no-transform',
  onExists: 'fail',
  token: 'tok-0',
  fetch: fetchFn,
  chunkSize: 4,
  sleep: async () => {},
  ...over,
})

describe('copy source reads (#2980)', () => {
  it('a 200 that ignores Range on a partial chunk is fatal, not retried', async () => {
    const { fetchFn, gets } = world(() => new Response(DATA, { status: 200 }))
    await expect(uploadObject(copy(fetchFn))).rejects.toThrow('200')
    expect(gets).toHaveLength(1)
  })

  it('a short 206 is retried, then the copy completes', async () => {
    const { fetchFn, gets, received } = world((n, r) =>
      n === 2 ? part(r, { body: DATA.slice(r[0], r[0] + 2) }) : part(r)
    )
    expect(await uploadObject(copy(fetchFn))).toBe('created')
    expect(gets.map(g => g.range)).toEqual([
      'bytes=0-3',
      'bytes=4-7',
      'bytes=4-7',
      'bytes=8-10',
    ])
    expect(received()).toBe(DATA)
  })

  it('a 206 whose Content-Range starts at the wrong offset is fatal, not retried', async () => {
    const { fetchFn, gets } = world((n, r) =>
      n === 2 ? part(r, { start: 0, body: DATA.slice(0, 4) }) : part(r)
    )
    await expect(uploadObject(copy(fetchFn))).rejects.toThrow(/Content-Range/)
    expect(gets).toHaveLength(2)
  })
})

describe('copy token refresh (#2980)', () => {
  it('on a 401 re-mints and retries that chunk once', async () => {
    const mint = vi.fn(async () => 'tok-1')
    const { fetchFn, gets, received } = world((n, r, auth) =>
      n === 2 && auth === 'Bearer tok-0'
        ? new Response('', { status: 401 })
        : part(r)
    )
    expect(await uploadObject(copy(fetchFn, { tokenProvider: mint }))).toBe(
      'created'
    )
    expect(mint).toHaveBeenCalledTimes(1)
    expect(gets.map(g => [g.range, g.auth])).toEqual([
      ['bytes=0-3', 'Bearer tok-0'],
      ['bytes=4-7', 'Bearer tok-0'],
      ['bytes=4-7', 'Bearer tok-1'],
      ['bytes=8-10', 'Bearer tok-1'],
    ])
    expect(received()).toBe(DATA)
  })

  it('two 401s on one chunk is fatal, with one re-mint only', async () => {
    const mint = vi.fn(async () => 'tok-1')
    const { fetchFn, gets } = world(n =>
      n >= 2 ? new Response('', { status: 401 }) : part([0, 3])
    )
    await expect(
      uploadObject(copy(fetchFn, { tokenProvider: mint }))
    ).rejects.toThrow('401')
    expect(mint).toHaveBeenCalledTimes(1)
    expect(gets).toHaveLength(3)
  })

  it('a 401 without a provider is fatal', async () => {
    const { fetchFn, gets } = world(() => new Response('', { status: 401 }))
    await expect(uploadObject(copy(fetchFn))).rejects.toThrow('401')
    expect(gets).toHaveLength(1)
  })

  it('a later chunk gets a fresh token once the current one is older than tokenMaxAgeMs', async () => {
    let clock = 0
    let minted = 0
    const mint = vi.fn(async () => `tok-${++minted}`)
    const { fetchFn, gets } = world((n, r) => {
      clock += 20 * 60_000 // each source GET takes 20 minutes
      return part(r)
    })
    await uploadObject(
      copy(fetchFn, {
        tokenProvider: mint,
        tokenMaxAgeMs: 30 * 60_000,
        now: () => clock,
      })
    )
    // t=0 token-0; GET 1 at 0 (age 0); GET 2 at 20 min (age 20); GET 3 at 40 min (age 40 > 30)
    expect(gets.map(g => g.auth)).toEqual([
      'Bearer tok-0',
      'Bearer tok-0',
      'Bearer tok-1',
    ])
    expect(mint).toHaveBeenCalledTimes(1)
  })

  it('by default asks the provider again once 4 minutes have passed', async () => {
    // gcloud serves its cached token until 5 minutes before expiry, so the
    // provider has to be asked often enough to land inside that window.
    let clock = 0
    let minted = 0
    const mint = vi.fn(async () => `tok-${++minted}`)
    const { fetchFn, gets } = world((n, r) => {
      clock += 5 * 60_000 // each source GET takes 5 minutes
      return part(r)
    })
    await uploadObject(copy(fetchFn, { tokenProvider: mint, now: () => clock }))
    expect(gets.map(g => g.auth)).toEqual([
      'Bearer tok-0',
      'Bearer tok-1',
      'Bearer tok-2',
    ])
  })

  it('cancels the 401 response body before it retries', async () => {
    const cancel = vi.fn(async () => {})
    const { fetchFn } = world((n, r, auth) => {
      if (n === 2 && auth === 'Bearer tok-0') {
        const res = new Response('', { status: 401 })
        Object.defineProperty(res, 'body', {
          value: { cancel },
        })
        return res
      }
      return part(r)
    })
    await uploadObject(copy(fetchFn, { tokenProvider: async () => 'tok-1' }))
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('never puts a token in an error message', async () => {
    const { fetchFn } = world(() => new Response('', { status: 401 }))
    const err = await uploadObject(
      copy(fetchFn, {
        token: 'sekrit-0',
        tokenProvider: async () => 'sekrit-1',
      })
    ).catch((e: Error) => e)
    expect(String((err as Error).message)).not.toMatch(/sekrit/)
  })

  it('a provider that fails is fatal and says so', async () => {
    const { fetchFn } = world(() => new Response('', { status: 401 }))
    const err = await uploadObject(
      copy(fetchFn, {
        tokenProvider: async () => {
          throw new Error('gcloud failed: ya29.FAKE-provider-secret')
        },
      })
    ).catch((e: Error) => e)
    expect((err as Error).message).toMatch(/token/i)
    expect((err as Error).message).not.toContain('FAKE-provider-secret')
  })
})
