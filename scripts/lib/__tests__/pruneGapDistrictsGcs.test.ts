/**
 * The gap-district prune's GCS adapter through the REAL SDK (#2038).
 *
 * Lesson #1726: don't mock an SDK shape you haven't observed. So this runs
 * `@google-cloud/storage` 8.2.0 unmodified against a local server speaking
 * the JSON API: object listing, `?alt=media` reads, and the object DELETE
 * `file.delete({ ifGenerationMatch })` sends. The server enforces the
 * precondition as GCS does (412 on mismatch, 204 on success).
 *
 * What it proves: the delete names the object and carries the listed
 * generation as `ifGenerationMatch`; a stale generation is rejected with
 * code 412 and the object stays; a full runPrune over the adapter removes
 * only the gap district's objects. Nothing leaves the machine.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { OAuth2Client } from 'google-auth-library'
import { pruneBucket } from '../gcsMedia.js'
import { runPrune } from '../pruneGapDistricts.js'

const BUCKET = 'prune-test-bucket'
const DATE = '2018-03-31'
const dir = `snapshots/${DATE}/`
const junkU = JSON.parse(
  fs.readFileSync(
    path.resolve(
      __dirname,
      'fixtures/date-completeness/prod-district_U-gap-junk.json'
    ),
    'utf-8'
  )
)

interface Obj {
  bytes: Buffer
  generation: number
}
const objects = new Map<string, Obj>()
const deletes: Array<{ name: string; query: Record<string, string> }> = []
let nextGeneration = 1_791_968_779_530_000

const md5 = (b: Buffer) => createHash('md5').update(b).digest('base64')

function resource(name: string, o: Obj): Record<string, unknown> {
  return {
    kind: 'storage#object',
    name,
    bucket: BUCKET,
    generation: String(o.generation),
    metageneration: '1',
    size: String(o.bytes.length),
    md5Hash: md5(o.bytes),
    contentType: 'application/json',
    contentEncoding: 'gzip',
  }
}

function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  req.resume()
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const json = (status: number, body?: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(body === undefined ? '' : JSON.stringify(body))
    }
    if (req.method === 'GET' && url.pathname === `/storage/v1/b/${BUCKET}/o`) {
      const prefix = url.searchParams.get('prefix') ?? ''
      const items = [...objects.entries()]
        .filter(([n]) => n.startsWith(prefix))
        .map(([n, o]) => resource(n, o))
      json(200, { kind: 'storage#objects', items })
      return
    }
    const one = new RegExp(`^/storage/v1/b/${BUCKET}/o/(.+)$`).exec(
      url.pathname
    )
    if (!one) {
      json(404, { error: { code: 404, message: 'Not Found' } })
      return
    }
    const name = decodeURIComponent(one[1]!)
    const o = objects.get(name)
    if (req.method === 'GET') {
      const generation = url.searchParams.get('generation')
      if (
        url.searchParams.get('alt') !== 'media' ||
        !o ||
        (generation !== null && generation !== String(o.generation))
      ) {
        json(404, { error: { code: 404, message: 'No such object' } })
        return
      }
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'content-length': String(o.bytes.length),
      })
      res.end(o.bytes)
      return
    }
    if (req.method === 'DELETE') {
      const query = Object.fromEntries(url.searchParams.entries())
      deletes.push({ name, query })
      if (!o) {
        json(404, { error: { code: 404, message: 'No such object' } })
        return
      }
      const want = query.ifGenerationMatch
      if (want !== undefined && want !== String(o.generation)) {
        json(412, {
          error: {
            code: 412,
            message:
              'At least one of the pre-conditions you specified did not hold.',
          },
        })
        return
      }
      objects.delete(name)
      res.writeHead(204)
      res.end()
      return
    }
    json(404, { error: { code: 404, message: 'Not Found' } })
  })
}

const put = (name: string, value: unknown) =>
  objects.set(name, {
    bytes: gzipSync(Buffer.from(JSON.stringify(value, null, 2))),
    generation: nextGeneration++,
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
    retryOptions: { autoRetry: false },
  })
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

beforeEach(() => {
  objects.clear()
  deletes.length = 0
  put(`${dir}metadata.json`, {
    successfulDistricts: ['02'],
    failedDistricts: ['U'],
    errors: [
      'U: Skipped: club-performance.csv for district U on 2018-04-18 is not a CSV (body is HTML) — a gap, not zero clubs (#1671)',
    ],
  })
  put(`${dir}district_02.json`, { data: { clubs: [{ clubId: '1' }] } })
  put(`${dir}district_U.json`, junkU)
  put(`${dir}analytics/district_U_analytics.json`, { data: {} })
})

describe('pruneBucket (real SDK, local JSON API)', () => {
  it('deletes with ifGenerationMatch set to the listed generation', async () => {
    const io = pruneBucket(storage, BUCKET)
    const name = `${dir}district_U.json`
    const gen = String(objects.get(name)!.generation)
    await io.delete(name, gen)
    expect(deletes).toEqual([
      { name, query: expect.objectContaining({ ifGenerationMatch: gen }) },
    ])
    expect(objects.has(name)).toBe(false)
  })

  it('rejects a stale generation with code 412 and keeps the object', async () => {
    const io = pruneBucket(storage, BUCKET)
    const name = `${dir}district_U.json`
    await expect(io.delete(name, '1')).rejects.toMatchObject({ code: 412 })
    expect(objects.has(name)).toBe(true)
  })

  it('runPrune over the adapter removes only the gap district', async () => {
    const io = pruneBucket(storage, BUCKET)
    const { summary } = await runPrune(io, {
      bucket: BUCKET,
      dates: [DATE],
      dryRun: false,
    })
    expect(summary).toMatchObject({ deleted: 2, errors: 0 })
    expect([...objects.keys()].sort()).toEqual([
      `${dir}district_02.json`,
      `${dir}metadata.json`,
    ])
  })

  it('a dry run over the adapter deletes nothing', async () => {
    const io = pruneBucket(storage, BUCKET)
    const { summary } = await runPrune(io, {
      bucket: BUCKET,
      dates: [DATE],
      dryRun: true,
    })
    expect(deletes).toEqual([])
    expect(summary).toMatchObject({ planned: 2 })
  })
})
