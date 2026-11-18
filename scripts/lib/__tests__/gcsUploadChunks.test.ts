/**
 * #2972: the basemap archive is ~69 GB, so one PUT that dies at 60 GB would
 * restart from zero. The helper uploads in chunks (resumable protocol: PUT
 * with Content-Range, 308 until the last chunk) and, after a failed chunk,
 * asks the session how much it holds (PUT Content-Range: bytes STAR/total)
 * and resends only the rest. Every failure that is not recoverable throws.
 *
 * Docs: https://docs.cloud.google.com/storage/docs/resumable-uploads
 *       (chunked upload, "Resume an interrupted upload")
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  uploadObject,
  ObjectExistsError,
  type UploadOptions,
} from '../gcsUpload'

const SESSION =
  'https://storage.googleapis.com/upload/storage/v1/b/b/o?upload_id=U'
const BYTES = 'hello-bytes' // 11 bytes
let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gcs-chunks-'))
  file = join(dir, 'a.bin')
  writeFileSync(file, BYTES)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

interface Put {
  range: string
  body: string
}

type Script = (put: Put, n: number) => Response | Error

/** A fake session. `script` answers each PUT (status queries have no body). */
const fake = (
  script: Script
): { fetchFn: typeof fetch; puts: Put[]; held: () => string } => {
  const puts: Put[] = []
  let accepted = ''
  const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'POST')
      return new Response('{}', { status: 200, headers: { Location: SESSION } })
    const h = init.headers as Record<string, string>
    const body = init.body
      ? Buffer.from(
          await new Response(init.body as BodyInit).arrayBuffer()
        ).toString()
      : ''
    const put = { range: h['Content-Range'] ?? '', body }
    puts.push(put)
    const out = script(put, puts.length)
    if (out instanceof Error) throw out
    if (out.status === 200 || out.status === 201) accepted += body
    return out
  }) as unknown as typeof fetch
  return { fetchFn, puts, held: () => accepted }
}

const cont = (upTo: number): Response =>
  new Response('', {
    status: 308,
    headers: upTo >= 0 ? { Range: `bytes=0-${upTo}` } : {},
  })
const done = (): Response => new Response('{}', { status: 200 })

const opts = (over: Partial<UploadOptions>): UploadOptions => ({
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

describe('chunked resumable upload (#2972)', () => {
  it('sends Content-Range chunks, 308 between them, and the bytes in order', async () => {
    const { fetchFn, puts } = fake((_p, n) =>
      n === 1 ? cont(3) : n === 2 ? cont(7) : done()
    )
    expect(await uploadObject(opts({ fetch: fetchFn }))).toBe('created')
    expect(puts.map(p => p.range)).toEqual([
      'bytes 0-3/11',
      'bytes 4-7/11',
      'bytes 8-10/11',
    ])
    expect(puts.map(p => p.body).join('')).toBe(BYTES)
  })

  it('after a dropped connection asks the session what it holds, then resends only the rest', async () => {
    const { fetchFn, puts } = fake((p, n) => {
      if (n === 1) return new Error('socket hang up')
      if (p.range === 'bytes */11') return cont(-1) // nothing persisted yet
      return p.range === 'bytes 0-3/11'
        ? cont(3)
        : p.range === 'bytes 4-7/11'
          ? cont(7)
          : done()
    })
    expect(await uploadObject(opts({ fetch: fetchFn }))).toBe('created')
    expect(puts.map(p => p.range)).toEqual([
      'bytes 0-3/11',
      'bytes */11',
      'bytes 0-3/11',
      'bytes 4-7/11',
      'bytes 8-10/11',
    ])
  })

  it('resumes from the persisted offset reported by the status query', async () => {
    const { fetchFn, puts } = fake((p, n) => {
      if (n === 1) return new Response('', { status: 503 })
      if (p.range === 'bytes */11') return cont(1) // 2 of 4 persisted
      if (p.range === 'bytes 2-3/11') return cont(3)
      return p.range === 'bytes 4-7/11' ? cont(7) : done()
    })
    expect(await uploadObject(opts({ fetch: fetchFn }))).toBe('created')
    expect(puts.map(p => p.range).slice(0, 4)).toEqual([
      'bytes 0-3/11',
      'bytes */11',
      'bytes 2-3/11',
      'bytes 4-7/11',
    ])
    expect(puts[2]?.body).toBe('ll')
  })

  it('a 4xx other than 412 is not retried', async () => {
    const { fetchFn, puts } = fake(() => new Response('', { status: 403 }))
    await expect(uploadObject(opts({ fetch: fetchFn }))).rejects.toThrow('403')
    expect(puts).toHaveLength(1)
  })

  it('gives up after repeated failures and throws', async () => {
    const { fetchFn } = fake(p =>
      p.range === 'bytes */11' ? cont(-1) : new Response('', { status: 503 })
    )
    await expect(uploadObject(opts({ fetch: fetchFn }))).rejects.toThrow('503')
  })

  it('a 412 on the last chunk is "exists"', async () => {
    const { fetchFn } = fake((_p, n) =>
      n < 3 ? (n === 1 ? cont(3) : cont(7)) : new Response('', { status: 412 })
    )
    await expect(uploadObject(opts({ fetch: fetchFn }))).rejects.toBeInstanceOf(
      ObjectExistsError
    )
  })

  it('a 200 before the last byte is an error, not success', async () => {
    const { fetchFn } = fake(() => done())
    await expect(uploadObject(opts({ fetch: fetchFn }))).rejects.toThrow(
      /before/
    )
  })

  it('chunks a storage source across arbitrary response pieces', async () => {
    const puts: Put[] = []
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      if (init.method === 'POST')
        return new Response('{}', {
          status: 200,
          headers: { Location: SESSION },
        })
      if (init.method === 'GET') {
        const enc = new TextEncoder()
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            for (const piece of ['hel', 'lo-b', 'y', 'tes'])
              c.enqueue(enc.encode(piece))
            c.close()
          },
        })
        return new Response(body, {
          status: 200,
          headers: { 'Content-Length': '11' },
        })
      }
      const h = init.headers as Record<string, string>
      puts.push({
        range: h['Content-Range'] ?? '',
        body: Buffer.from(
          await new Response(init.body as BodyInit).arrayBuffer()
        ).toString(),
      })
      return puts.length === 1 ? cont(3) : puts.length === 2 ? cont(7) : done()
    }) as unknown as typeof fetch
    await uploadObject(
      opts({
        fetch: fetchFn,
        source: { kind: 'gcs', bucket: 'stg', object: 'basemap/x.pmtiles' },
      })
    )
    expect(puts.map(p => p.body)).toEqual(['hell', 'o-by', 'tes'])
  })
})
