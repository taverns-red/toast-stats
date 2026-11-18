/**
 * #2991: a long `copy` logs each access-token mint, so the first real z14 prod
 * copy leaves evidence that the token was renewed. One line per mint with the
 * count, the seconds since the copy started, the reason (age or 401) and
 * whether the token changed. One summary line at the end. No token text,
 * prefix, suffix, length or hash is ever logged.
 */
import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { uploadObject, type UploadOptions } from '../gcsUpload'

const SESSION = 'https://storage.googleapis.com/upload/storage/v1/b/b/o?u=1'
const DATA = 'hello-bytes' // 11 bytes, chunkSize 4 -> 3 chunks
const MD5 = createHash('md5').update(DATA).digest('base64')

type Get = (n: number, range: [number, number], auth: string) => Response

const world = (get: Get) => {
  let gets = 0
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    const h = (init.headers ?? {}) as Record<string, string>
    if (init.method === 'POST')
      return new Response('{}', { status: 200, headers: { Location: SESSION } })
    if (init.method === 'PUT') {
      await new Response(init.body as BodyInit).arrayBuffer()
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
      gets++
      return get(gets, [Number(r[1]), Number(r[2])], h['Authorization']!)
    }
    return new Response(
      JSON.stringify({ size: String(DATA.length), md5Hash: MD5 }),
      { status: 200 }
    )
  }) as unknown as typeof fetch
  return fetchFn
}

const part = ([a, b]: [number, number]): Response =>
  new Response(DATA.slice(a, b + 1), {
    status: 206,
    headers: { 'Content-Range': `bytes ${a}-${b}/${DATA.length}` },
  })

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

describe('copy token mint log (#2991)', () => {
  it('logs an age mint with count, elapsed seconds and changed: yes', async () => {
    let clock = 1_000_000
    let minted = 0
    const lines: string[] = []
    const fetchFn = world((n, r) => {
      clock += 5 * 60_000
      return part(r)
    })
    await uploadObject(
      copy(fetchFn, {
        tokenProvider: async () => `tok-${++minted}`,
        now: () => clock,
        log: l => lines.push(l),
      })
    )
    // The copy starts at clock 1_000_000. GET 1 runs at +0 s (age 0, no mint)
    // and moves the clock to +300 s; GET 2 is the first read past 4 minutes.
    expect(lines[0]).toBe('token mint 1: +300s, reason: age, changed: yes')
    expect(lines[1]).toBe('token mint 2: +600s, reason: age, changed: yes')
  })

  it('logs changed: no when gcloud returns the cached token', async () => {
    let clock = 0
    const lines: string[] = []
    const fetchFn = world((n, r) => {
      clock += 5 * 60_000
      return part(r)
    })
    await uploadObject(
      copy(fetchFn, {
        tokenProvider: async () => 'tok-0',
        now: () => clock,
        log: l => lines.push(l),
      })
    )
    expect(lines[0]).toBe('token mint 1: +300s, reason: age, changed: no')
  })

  it('logs a 401 mint with reason 401', async () => {
    let clock = 0
    const lines: string[] = []
    const fetchFn = world((n, r, auth) => {
      clock += 1000
      return n === 2 && auth === 'Bearer tok-0'
        ? new Response('', { status: 401 })
        : part(r)
    })
    await uploadObject(
      copy(fetchFn, {
        tokenProvider: async () => 'tok-1',
        now: () => clock,
        log: l => lines.push(l),
      })
    )
    expect(lines[0]).toBe('token mint 1: +2s, reason: 401, changed: yes')
  })

  it('ends a copy with one summary line: total mints and real changes', async () => {
    let clock = 0
    let minted = 0
    const lines: string[] = []
    const fetchFn = world((n, r) => {
      clock += 5 * 60_000
      return part(r)
    })
    await uploadObject(
      copy(fetchFn, {
        // mint 1 returns the same token, mint 2 a new one
        tokenProvider: async () => (++minted === 1 ? 'tok-0' : 'tok-9'),
        now: () => clock,
        log: l => lines.push(l),
      })
    )
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('token mints: 2 total, 1 changed')
  })

  it('still logs the summary when the copy fails', async () => {
    const lines: string[] = []
    const fetchFn = world(() => new Response('', { status: 403 }))
    await expect(
      uploadObject(
        copy(fetchFn, {
          tokenProvider: async () => 'tok-1',
          log: l => lines.push(l),
        })
      )
    ).rejects.toThrow('403')
    expect(lines).toEqual(['token mints: 0 total, 0 changed'])
  })

  it('never logs token text, prefix, suffix or length', async () => {
    let clock = 0
    let minted = 0
    const lines: string[] = []
    const first = 'ya29.SECRET-first-token-abcdef0123456789'
    const fresh = () => `ya29.SECRET-fresh-${++minted}-zyxwvu9876543210`
    const fetchFn = world((n, r, auth) => {
      clock += 5 * 60_000
      return n === 2 && auth === `Bearer ${first}`
        ? new Response('', { status: 401 })
        : part(r)
    })
    await uploadObject(
      copy(fetchFn, {
        token: first,
        tokenProvider: async () => fresh(),
        now: () => clock,
        log: l => lines.push(l),
      })
    )
    expect(lines.length).toBeGreaterThan(1)
    const all = lines.join('\n')
    expect(all).not.toMatch(/ya29|SECRET|abcdef|zyxwvu|Bearer/)
    expect(all).not.toContain(String(first.length))
    expect(all).not.toContain(
      createHash('sha256').update(first).digest('hex').slice(0, 8)
    )
  })

  it('logs nothing about mints when there is no provider', async () => {
    const lines: string[] = []
    const fetchFn = world((n, r) => part(r))
    await uploadObject(copy(fetchFn, { log: l => lines.push(l) }))
    expect(lines).toEqual([])
  })

  it('by default writes to stderr, never stdout (R4)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const fetchFn = world((n, r) => part(r))
      await uploadObject(copy(fetchFn, { tokenProvider: async () => 'tok-0' }))
      expect(err).toHaveBeenCalledWith('token mints: 0 total, 0 changed')
      expect(out).not.toHaveBeenCalled()
    } finally {
      err.mockRestore()
      out.mockRestore()
    }
  })
})
