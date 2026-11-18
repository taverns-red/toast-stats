/**
 * #2972: integrity and resilience of the upload helper.
 *
 * - The resumable initiation sends md5Hash in the object metadata (the source
 *   object's for `copy`, a locally computed one for `put`), and the final
 *   response's md5Hash must match it. GCS rejects a mismatching upload itself;
 *   the helper checks the answer too, so a silent change cannot pass.
 * - `copy` refuses a source with Content-Encoding set: fetch would
 *   auto-decompress it and the copy would not be byte-identical.
 * - `copy` reads the source with one ranged GET per chunk, so a dropped source
 *   connection retries that chunk, not the whole object.
 *
 * Docs: https://docs.cloud.google.com/storage/docs/json_api/v1/objects (md5Hash,
 * contentEncoding), https://docs.cloud.google.com/storage/docs/resumable-uploads
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uploadObject, type UploadOptions } from '../gcsUpload'

const SESSION = 'https://storage.googleapis.com/upload/storage/v1/b/b/o?u=1'
const BYTES = 'hello-bytes' // 11 bytes
const md5 = (s: string): string => createHash('md5').update(s).digest('base64')

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gcs-integrity-'))
  file = join(dir, 'a.bin')
  writeFileSync(file, BYTES)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body: string
}

interface World {
  /** What the staging object holds. */
  source?: { data: string; md5Hash?: string; contentEncoding?: string }
  /** md5Hash the final PUT answers with; default: md5 of what was received. */
  finalMd5?: string | null
  /** Make the nth ranged GET (1-based) fail with this. */
  failGet?: Record<number, Response | Error>
}

const fakeWorld = (w: World) => {
  const calls: Call[] = []
  let gets = 0
  let received = ''
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    const body = init.body
      ? Buffer.from(
          await new Response(init.body as BodyInit).arrayBuffer()
        ).toString()
      : ''
    calls.push({ method: init.method ?? 'GET', url, headers, body })
    if (init.method === 'POST')
      return new Response('{}', { status: 200, headers: { Location: SESSION } })
    if (init.method === 'PUT') {
      received += body
      const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(headers['Content-Range']!)
      if (m && Number(m[2]) + 1 < Number(m[3]))
        return new Response('', {
          status: 308,
          headers: { Range: `bytes=0-${m[2]}` },
        })
      const md5Hash = w.finalMd5 === undefined ? md5(received) : w.finalMd5
      return new Response(JSON.stringify(md5Hash ? { md5Hash } : {}), {
        status: 200,
      })
    }
    // GET against the source
    const src = w.source!
    if (url.includes('alt=media')) {
      gets++
      const fail = w.failGet?.[gets]
      if (fail instanceof Error) throw fail
      if (fail) return fail
      const r = /^bytes=(\d+)-(\d+)$/.exec(headers['Range'] ?? '')
      if (!r) return new Response(src.data, { status: 200 })
      const slice = src.data.slice(Number(r[1]), Number(r[2]) + 1)
      return new Response(slice, {
        status: 206,
        headers: {
          'Content-Length': String(slice.length),
          'Content-Range': `bytes ${r[1]}-${Number(r[1]) + slice.length - 1}/${src.data.length}`,
        },
      })
    }
    return new Response(
      JSON.stringify({
        size: String(src.data.length),
        md5Hash: src.md5Hash ?? md5(src.data),
        ...(src.contentEncoding
          ? { contentEncoding: src.contentEncoding }
          : {}),
      }),
      { status: 200 }
    )
  }) as unknown as typeof fetch
  return { fetchFn, calls, gets: () => gets }
}

const base = (over: Partial<UploadOptions>): UploadOptions => ({
  bucket: 'b',
  object: 'basemap/x.pmtiles',
  source: { kind: 'file', path: file },
  contentType: 'application/octet-stream',
  cacheControl: 'public, max-age=86400, no-transform',
  onExists: 'fail',
  token: 'tok',
  fetch,
  chunkSize: 4,
  sleep: async () => {},
  ...over,
})

const copyOpts = (fetchFn: typeof fetch): UploadOptions =>
  base({
    fetch: fetchFn,
    source: { kind: 'gcs', bucket: 'stg', object: 'basemap/x.pmtiles' },
  })

describe('md5Hash on upload (#2972)', () => {
  it('put sends the md5 of the file in the initiation metadata', async () => {
    const { fetchFn, calls } = fakeWorld({})
    await uploadObject(base({ fetch: fetchFn }))
    const post = calls.find(c => c.method === 'POST')!
    expect(JSON.parse(post.body).md5Hash).toBe(md5(BYTES))
  })

  it('put fails when the final response md5Hash differs', async () => {
    const { fetchFn } = fakeWorld({ finalMd5: md5('other') })
    await expect(uploadObject(base({ fetch: fetchFn }))).rejects.toThrow(/md5/i)
  })

  it('put fails when the final response has no md5Hash', async () => {
    const { fetchFn } = fakeWorld({ finalMd5: null })
    await expect(uploadObject(base({ fetch: fetchFn }))).rejects.toThrow(/md5/i)
  })

  it("copy sends the source object's md5Hash in the initiation metadata", async () => {
    const { fetchFn, calls } = fakeWorld({ source: { data: BYTES } })
    await uploadObject(copyOpts(fetchFn))
    const post = calls.find(c => c.method === 'POST')!
    expect(JSON.parse(post.body).md5Hash).toBe(md5(BYTES))
  })

  it('copy fails when the final md5Hash is not the source md5Hash', async () => {
    const { fetchFn } = fakeWorld({
      source: { data: BYTES },
      finalMd5: md5('other'),
    })
    await expect(uploadObject(copyOpts(fetchFn))).rejects.toThrow(/md5/i)
  })
})

describe('copy refuses a Content-Encoding source (#2972)', () => {
  it('throws a clear error and opens no upload session', async () => {
    const { fetchFn, calls } = fakeWorld({
      source: { data: BYTES, contentEncoding: 'gzip' },
    })
    await expect(uploadObject(copyOpts(fetchFn))).rejects.toThrow(
      /Content-Encoding.*gzip/i
    )
    expect(calls.some(c => c.method === 'POST')).toBe(false)
  })
})

describe('copy reads the source one ranged GET per chunk (#2972)', () => {
  it('sends a Range header per chunk', async () => {
    const { fetchFn, calls } = fakeWorld({ source: { data: BYTES } })
    await uploadObject(copyOpts(fetchFn))
    const ranges = calls
      .filter(c => c.url.includes('alt=media'))
      .map(c => c.headers['Range'])
    expect(ranges).toEqual(['bytes=0-3', 'bytes=4-7', 'bytes=8-10'])
  })

  it('a dropped source connection retries that chunk only', async () => {
    const { fetchFn, calls } = fakeWorld({
      source: { data: BYTES },
      failGet: { 2: new Error('socket hang up') },
    })
    await uploadObject(copyOpts(fetchFn))
    const ranges = calls
      .filter(c => c.url.includes('alt=media'))
      .map(c => c.headers['Range'])
    expect(ranges).toEqual([
      'bytes=0-3',
      'bytes=4-7',
      'bytes=4-7',
      'bytes=8-10',
    ])
  })

  it('retries a 503 on a chunk, then gives up after repeated failures', async () => {
    const down = (): Response => new Response('', { status: 503 })
    const { fetchFn, gets } = fakeWorld({
      source: { data: BYTES },
      failGet: { 1: down(), 2: down(), 3: down(), 4: down(), 5: down() },
    })
    await expect(uploadObject(copyOpts(fetchFn))).rejects.toThrow('503')
    expect(gets()).toBe(5)
  })

  it('does not retry a 403', async () => {
    const { fetchFn, gets } = fakeWorld({
      source: { data: BYTES },
      failGet: { 1: new Response('', { status: 403 }) },
    })
    await expect(uploadObject(copyOpts(fetchFn))).rejects.toThrow('403')
    expect(gets()).toBe(1)
  })
})
