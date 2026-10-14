/**
 * The contact strip's GCS adapter, end to end through the REAL SDK (#2026).
 *
 * Lesson #1726: don't mock an SDK shape you haven't observed. So these run
 * `@google-cloud/storage` 8.2.0 and its transport unmodified against a local
 * server speaking the JSON API: an object listing, `?alt=media` reads served
 * as stored (gzip layer intact, recorded staging headers), and the
 * multipart simple upload the SDK sends for `save({ resumable: false })`.
 * The server enforces `ifGenerationMatch` as GCS does (412 on mismatch).
 *
 * What it proves: the read is of the listed generation and returns stored
 * bytes; the upload carries `ifGenerationMatch`, the original headers and
 * custom metadata, and the bytes exactly as given (no second gzip); and a
 * full runStrip over the adapter strips, post-checks and is idempotent.
 * Nothing leaves the machine.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CRC32C, Storage } from '@google-cloud/storage'
import { OAuth2Client } from 'google-auth-library'
import { stripBucket } from '../gcsMedia.js'
import { countContactKeys, runStrip } from '../stripClubContact.js'

const RECORDED = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, 'fixtures/gcs-media/response-headers.json'),
    'utf-8'
  )
) as { gzipStored: { headers: Record<string, string> } }

const BUCKET = 'strip-test-bucket'
const DATE = '2026-10-13'
const HEADERS = {
  contentType: 'application/json',
  contentEncoding: 'gzip',
  cacheControl: 'public, max-age=3600, must-revalidate, no-transform',
}

interface Obj {
  bytes: Buffer
  generation: number
  contentType?: string
  contentEncoding?: string
  cacheControl?: string
  metadata?: Record<string, string>
}

const objects = new Map<string, Obj>()
let nextGeneration = 1_791_968_779_530_000
const uploads: Array<{
  query: Record<string, string>
  metadata: Record<string, unknown>
  media: Buffer
}> = []
const mediaReads: Array<{ name: string; generation: string | null }> = []

const md5 = (b: Buffer) => createHash('md5').update(b).digest('base64')
const crc = (b: Buffer) => {
  const c = new CRC32C()
  c.update(b)
  return c.toString()
}

function resource(name: string, o: Obj): Record<string, unknown> {
  return {
    kind: 'storage#object',
    name,
    bucket: BUCKET,
    generation: String(o.generation),
    metageneration: '1',
    size: String(o.bytes.length),
    md5Hash: md5(o.bytes),
    crc32c: crc(o.bytes),
    ...(o.contentType ? { contentType: o.contentType } : {}),
    ...(o.contentEncoding ? { contentEncoding: o.contentEncoding } : {}),
    ...(o.cacheControl ? { cacheControl: o.cacheControl } : {}),
    ...(o.metadata ? { metadata: o.metadata } : {}),
  }
}

/** Split a multipart/related body into its parts' bodies. */
function multipartParts(body: Buffer, boundary: string): Buffer[] {
  const delim = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let at = body.indexOf(delim)
  while (at !== -1) {
    const start = at + delim.length
    if (body.subarray(start, start + 2).toString() === '--') break
    const next = body.indexOf(delim, start)
    const part = body.subarray(start, next === -1 ? body.length : next)
    const headerEnd = part.indexOf('\r\n\r\n')
    let content = part.subarray(headerEnd + 4)
    if (content.subarray(-2).toString() === '\r\n') {
      content = content.subarray(0, -2)
    }
    parts.push(content)
    at = next
  }
  return parts
}

function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  const chunks: Buffer[] = []
  req.on('data', c => chunks.push(c as Buffer))
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'GET' && url.pathname === `/storage/v1/b/${BUCKET}/o`) {
      const prefix = url.searchParams.get('prefix') ?? ''
      const items = [...objects.entries()]
        .filter(([n]) => n.startsWith(prefix))
        .map(([n, o]) => resource(n, o))
      json(200, { kind: 'storage#objects', items })
      return
    }
    const media = new RegExp(`^/storage/v1/b/${BUCKET}/o/(.+)$`).exec(
      url.pathname
    )
    if (req.method === 'GET' && media) {
      const name = decodeURIComponent(media[1]!)
      const generation = url.searchParams.get('generation')
      mediaReads.push({ name, generation })
      const o = objects.get(name)
      if (
        url.searchParams.get('alt') !== 'media' ||
        !o ||
        (generation !== null && generation !== String(o.generation))
      ) {
        json(404, { error: { code: 404, message: 'No such object' } })
        return
      }
      res.writeHead(200, {
        ...RECORDED.gzipStored.headers,
        'x-goog-hash': `crc32c=${crc(o.bytes)},md5=${md5(o.bytes)}`,
        'x-goog-stored-content-length': String(o.bytes.length),
        'content-length': String(o.bytes.length),
        'x-goog-generation': String(o.generation),
      })
      res.end(o.bytes)
      return
    }
    if (
      req.method === 'POST' &&
      url.pathname === `/upload/storage/v1/b/${BUCKET}/o`
    ) {
      const query = Object.fromEntries(url.searchParams.entries())
      const boundary = /boundary=([^;]+)/
        .exec(req.headers['content-type'] ?? '')![1]!
        .replace(/"/g, '')
      const [metaPart, mediaPart] = multipartParts(
        Buffer.concat(chunks),
        boundary
      )
      const metadata = JSON.parse(metaPart!.toString('utf-8'))
      uploads.push({ query, metadata, media: mediaPart! })
      const name = query.name!
      const current = objects.get(name)
      const want = query.ifGenerationMatch
      if (
        want !== undefined &&
        (want === '0'
          ? current !== undefined
          : current?.generation !== Number(want))
      ) {
        json(412, {
          error: {
            code: 412,
            message:
              'At least one of the pre-conditions you specified did not hold.',
          },
        })
        return
      }
      const o: Obj = {
        bytes: mediaPart!,
        generation: nextGeneration++,
        contentType: metadata.contentType,
        contentEncoding: metadata.contentEncoding,
        cacheControl: metadata.cacheControl,
        metadata: metadata.metadata,
      }
      objects.set(name, o)
      json(200, resource(name, o))
      return
    }
    json(404, { error: { code: 404, message: 'Not Found' } })
  })
}

const SECRET_EMAIL = 'synthetic.secret@example.invalid'

const fixture = () => ({
  districtId: '61',
  status: 'success',
  data: {
    clubs: [
      {
        clubId: '100',
        coordinates: { lat: 45.5, lng: -73.56 },
        email: SECRET_EMAIL,
        phone: '+1 555 0100',
        website: 'https://club.example.invalid',
        meetingDay: 'Tuesday',
      },
    ],
  },
})

let server: http.Server
let storage: Storage

beforeAll(async () => {
  server = http.createServer(handler)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const token = new OAuth2Client()
  token.setCredentials({
    access_token: 'test-token',
    expiry_date: Date.now() + 3_600_000,
  })
  storage = new Storage({
    apiEndpoint: `http://127.0.0.1:${port}`,
    projectId: 'test-project',
    authClient: token,
  })
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

beforeEach(() => {
  objects.clear()
  uploads.length = 0
  mediaReads.length = 0
  objects.set(`snapshots/${DATE}/district_61.json`, {
    bytes: gzipSync(Buffer.from(JSON.stringify(fixture(), null, 2))),
    generation: nextGeneration++,
    ...HEADERS,
    metadata: { origin: 'daily' },
  })
  objects.set(`snapshots/${DATE}/analytics/manifest.json`, {
    bytes: gzipSync(Buffer.from(JSON.stringify({ files: [] }, null, 2))),
    generation: nextGeneration++,
    ...HEADERS,
  })
})

describe('stripBucket (real SDK, local JSON API)', () => {
  it('lists generation, md5 and headers for every object under the prefix', async () => {
    const io = stripBucket(storage, BUCKET)
    const listed = await io.list(`snapshots/${DATE}/`)
    const d61 = listed.find(o => o.name.endsWith('district_61.json'))!
    const stored = objects.get(`snapshots/${DATE}/district_61.json`)!
    expect(d61).toMatchObject({
      generation: String(stored.generation),
      md5Hash: md5(stored.bytes),
      ...HEADERS,
      metadata: { origin: 'daily' },
    })
    expect(listed).toHaveLength(2)
  })

  it('reads the stored bytes of the listed generation, gzip layer intact', async () => {
    const io = stripBucket(storage, BUCKET)
    const name = `snapshots/${DATE}/district_61.json`
    const stored = objects.get(name)!
    const bytes = await io.read(name, String(stored.generation))
    expect(bytes.equals(stored.bytes)).toBe(true)
    expect(mediaReads.at(-1)).toEqual({
      name,
      generation: String(stored.generation),
    })
    await expect(io.read(name, '1')).rejects.toMatchObject({ code: 404 })
  })

  it('uploads the bytes as given, with ifGenerationMatch and the headers', async () => {
    const io = stripBucket(storage, BUCKET)
    const name = `snapshots/${DATE}/district_61.json`
    const gen = String(objects.get(name)!.generation)
    const bytes = gzipSync(Buffer.from('{"a": 1}'))
    const written = await io.write(
      name,
      bytes,
      { ...HEADERS, metadata: { origin: 'daily' } },
      gen
    )
    const upload = uploads.at(-1)!
    expect(upload.query.ifGenerationMatch).toBe(gen)
    expect(upload.media.equals(bytes)).toBe(true)
    expect(upload.metadata).toMatchObject({
      ...HEADERS,
      metadata: { origin: 'daily' },
    })
    expect(written).toMatchObject({ name, ...HEADERS })
    expect(written.generation).not.toBe(gen)
  })

  it('rejects a write whose generation is stale with code 412', async () => {
    const io = stripBucket(storage, BUCKET)
    const name = `snapshots/${DATE}/district_61.json`
    const before = objects.get(name)!.bytes
    await expect(
      io.write(name, gzipSync(Buffer.from('{}')), HEADERS, '1')
    ).rejects.toMatchObject({ code: 412 })
    expect(objects.get(name)!.bytes.equals(before)).toBe(true)
  })

  it('runStrip over the adapter strips, keeps headers, and a re-run writes nothing', async () => {
    const io = stripBucket(storage, BUCKET)
    const opts = { bucket: BUCKET, dates: [DATE], dryRun: false }
    const first = await runStrip(io, opts)
    expect(first.summary).toMatchObject({
      objects: 2,
      stripped: 1,
      unchanged: 1,
      errors: 0,
      keysRemoved: 2,
    })
    const after = objects.get(`snapshots/${DATE}/district_61.json`)!
    expect(after).toMatchObject({ ...HEADERS, metadata: { origin: 'daily' } })
    const text = gunzipSync(after.bytes).toString('utf-8')
    expect(countContactKeys(JSON.parse(text))).toBe(0)
    const { email: _e, phone: _p, ...rest } = fixture().data.clubs[0]!
    expect(text).toBe(
      JSON.stringify({ ...fixture(), data: { clubs: [rest] } }, null, 2)
    )
    expect(JSON.stringify(first.rows)).not.toContain(SECRET_EMAIL)

    uploads.length = 0
    const second = await runStrip(io, opts)
    expect(uploads).toEqual([])
    expect(second.summary).toMatchObject({ stripped: 0, unchanged: 2 })
  })

  it('a dry run over the adapter uploads nothing', async () => {
    const io = stripBucket(storage, BUCKET)
    const { summary } = await runStrip(io, {
      bucket: BUCKET,
      dates: [DATE],
      dryRun: true,
    })
    expect(uploads).toEqual([])
    expect(summary).toMatchObject({ planned: 1, unchanged: 1 })
  })
})
