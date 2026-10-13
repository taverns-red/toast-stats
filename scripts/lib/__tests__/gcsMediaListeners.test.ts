/**
 * GCS object reads must not trip MaxListenersExceededWarning (#1729).
 *
 * Daily run 38057299072 logged 1,788 `MaxListenersExceededWarning ... 11
 * error/close listeners added to [PassThrough]` lines across the content gate
 * and both closing-registry steps. Root cause, traced with --trace-warnings
 * and a pipeline() call counter against staging (read-only):
 *
 *   `@google-cloud/storage` 8.2.0 `file.download()` → `createReadStream`.
 *   teeny-request 11 (stream mode) hands back node-fetch's response body
 *   *as* the response object (`Object.assign(res.body, …)`). The SDK pipes
 *   that body into its validator/throughStream (file.js `pipeline(
 *   rawResponseStream, …)`), and its `.resume()` of the request duplex fires
 *   teeny's `once('reading')`, which pipes the *same* body into teeny's
 *   requestStream (teeny-request index.ts:284). Two pipelines plus node-fetch's
 *   own listeners put 11 `error` and 11 `close` listeners on every response
 *   body — at concurrency 1 as well as 16. It is per-object (2 warnings per
 *   download, N=3 C=1 → 6), not a shared emitter and not growth: each body is
 *   collected with its request. Unchanged in storage 8.4.0 / teeny 11.1.0.
 *
 * The fix reads media in one non-streaming request through the client's own
 * authenticated transport (gaxios), so no response body is double-piped.
 *
 * These tests run the REAL SDK and transport (no mocks of either) against a
 * local server that answers `?alt=media` with headers recorded from staging
 * (fixtures/gcs-media/response-headers.json), streaming each body in two
 * packets. The Storage client uses a
 * custom endpoint and a pre-set token, so nothing leaves the machine.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CRC32C, Storage } from '@google-cloud/storage'
import { OAuth2Client } from 'google-auth-library'
import { gateBucket } from '../gcsMedia.js'
import { readMetadataForDates } from '../gcsHelpers.js'
import { CONCURRENCY, mapLimit } from '../promotionContentGateIo.js'

const RECORDED = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, 'fixtures/gcs-media/response-headers.json'),
    'utf-8'
  )
) as Record<
  'gzipStored' | 'identityStored',
  { headers: Record<string, string> }
>

const OBJECTS = 40
const BUCKET = 'media-test-bucket'

interface Stored {
  bytes: Buffer
  gzip: boolean
}

const objects = new Map<string, Stored>()

function hashHeader(bytes: Buffer): string {
  const crc = new CRC32C()
  crc.update(bytes)
  const md5 = createHash('md5').update(bytes).digest('base64')
  return `crc32c=${crc.toString()},md5=${md5}`
}

/**
 * `?alt=media` as GCS answers it with Accept-Encoding: gzip: a gzip-stored
 * object is served as stored with `content-encoding: gzip`; an identity
 * object without it. Only the recorded header names are sent.
 */
function serveMedia(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const match = /\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname)
  const name = match ? decodeURIComponent(match[2]!) : ''
  const stored = objects.get(name)
  if (!match || url.searchParams.get('alt') !== 'media' || !stored) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 404, message: 'Not Found' } }))
    return
  }
  const recorded = stored.gzip
    ? RECORDED.gzipStored.headers
    : RECORDED.identityStored.headers
  const headers: Record<string, string> = {
    ...recorded,
    'x-goog-hash': hashHeader(stored.bytes),
    'x-goog-stored-content-length': String(stored.bytes.length),
    'content-length': String(stored.bytes.length),
  }
  res.writeHead(200, headers)
  // Deliver the body in two packets, as a real network does. Sent in one
  // write, the SDK's first pipeline finishes before teeny's attaches and the
  // listeners never coexist (measured: 0 warnings vs 2 per object).
  res.write(stored.bytes.subarray(0, 8))
  setTimeout(() => res.end(stored.bytes.subarray(8)), 10)
}

let server: http.Server
let storage: Storage

beforeAll(async () => {
  for (let i = 0; i < OBJECTS; i++) {
    const body = Buffer.from(
      JSON.stringify({ object: i, pad: 'x'.repeat(2000 + i) })
    )
    objects.set(`snapshots/2026-10-11/analytics/district_${i}.json`, {
      bytes: gzipSync(body),
      gzip: true,
    })
    const date = `2026-09-${String((i % 28) + 1).padStart(2, '0')}-${i}`
    objects.set(`raw-csv/${date}/metadata.json`, {
      bytes: Buffer.from(
        JSON.stringify({ isClosingPeriod: i % 2 === 0, dataMonth: '2026-09' })
      ),
      gzip: false,
    })
  }
  server = http.createServer(serveMedia)
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

/** Run `fn`, then let queued process warnings fire, and count ours. */
async function countListenerWarnings(fn: () => Promise<unknown>) {
  let count = 0
  const onWarning = (w: Error) => {
    if (w.name === 'MaxListenersExceededWarning') count++
  }
  process.on('warning', onWarning)
  try {
    await fn()
    await new Promise(resolve => setImmediate(resolve))
    await new Promise(resolve => setTimeout(resolve, 20))
  } finally {
    process.off('warning', onWarning)
  }
  return count
}

const gzipNames = () =>
  [...objects.entries()].filter(([, o]) => o.gzip).map(([n]) => n)

describe('GCS media reads (#1729)', () => {
  it('harness: the SDK stream download trips the warning on this server (so the checks below are not vacuous)', async () => {
    const bucket = storage.bucket(BUCKET)
    const names = gzipNames().slice(0, 3)
    const warnings = await countListenerWarnings(() =>
      mapLimit(names, 1, n => bucket.file(n).download({ decompress: false }))
    )
    // 2 per object (error + close) at concurrency 1: per-response, not shared.
    expect(warnings).toBe(names.length * 2)
  })

  it('content gate reads 40 objects at CONCURRENCY with no MaxListenersExceededWarning, returning stored gzip bytes', async () => {
    const bucket = gateBucket(storage, BUCKET)
    const names = gzipNames()
    let read: Uint8Array[] = []
    const warnings = await countListenerWarnings(async () => {
      read = await mapLimit(names, CONCURRENCY, async n => {
        const [bytes] = await bucket.file(n).download({ decompress: false })
        return bytes
      })
    })
    expect(warnings).toBe(0)
    expect(read).toHaveLength(names.length)
    names.forEach((n, i) => {
      // Stored bytes, not decoded: the gate checks the gzip layer itself.
      expect(Buffer.from(read[i]!).equals(objects.get(n)!.bytes)).toBe(true)
      expect(JSON.parse(gunzipSync(read[i]!).toString('utf-8')).object).toBe(i)
    })
  })

  it('readMetadataForDates (closing-registry steps) reads 40 dates with no MaxListenersExceededWarning', async () => {
    const dates = [...objects.keys()]
      .filter(n => n.startsWith('raw-csv/'))
      .map(n => n.split('/')[1]!)
    let entries: Awaited<ReturnType<typeof readMetadataForDates>> = []
    const warnings = await countListenerWarnings(async () => {
      entries = await readMetadataForDates(storage, BUCKET, dates)
    })
    expect(warnings).toBe(0)
    expect(entries.every(e => e.metadataFound)).toBe(true)
    expect(entries.map(e => e.isClosingPeriod)).toEqual(
      dates.map((_, i) => i % 2 === 0)
    )
  })

  it('a missing object rejects in the gate path and is metadataFound:false in readMetadataForDates', async () => {
    const bucket = gateBucket(storage, BUCKET)
    await expect(
      bucket.file('snapshots/missing.json').download({ decompress: false })
    ).rejects.toThrow()
    const [entry] = await readMetadataForDates(storage, BUCKET, ['1999-01-01'])
    expect(entry).toMatchObject({ metadataFound: false })
  })
})
