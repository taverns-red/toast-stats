/**
 * fetchCdnObject — HTTP decoding parity with a browser (#1710).
 *
 * Serves real HTTP from a local server with `Content-Encoding: gzip`, the way
 * GCS serves `-Z` uploads, so the test exercises the actual fetch decoding
 * rather than a model of it. A browser peels exactly one layer; so must the
 * canary, or a nested-gzip object (#1702) would be "helpfully" double-decoded
 * and pass.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import { fetchCdnObject } from '../cdnFetch.js'
import { decodeCdnJson } from '../cdnSchemaCanary.js'

const JSON_BODY = JSON.stringify({ districtId: '61', ok: true })

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const gz = (layers: number) => {
      let body: Buffer = Buffer.from(JSON_BODY)
      for (let i = 0; i < layers; i++) body = gzipSync(body)
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      })
      res.end(body)
    }
    if (req.url === '/single.json') return gz(1)
    if (req.url === '/double.json') return gz(2)
    if (req.url === '/plain.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON_BODY)
    }
    res.writeHead(404)
    res.end('not found')
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise(r => server.close(r))
})

describe('fetchCdnObject', () => {
  it('peels a single Content-Encoding gzip layer, like a browser', async () => {
    const f = await fetchCdnObject(baseUrl, 'single.json')
    expect(f.path).toBe('single.json')
    const r = decodeCdnJson(f)
    expect(r.ok).toBe(true)
  })

  it('serves an identity-encoded object as-is', async () => {
    const r = decodeCdnJson(await fetchCdnObject(baseUrl, 'plain.json'))
    expect(r.ok).toBe(true)
  })

  it('leaves the inner layer of a double-gzipped object, which then fails (#1702)', async () => {
    const r = decodeCdnJson(await fetchCdnObject(baseUrl, 'double.json'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/gzip/i)
  })

  it('reports a non-2xx status without throwing', async () => {
    const f = await fetchCdnObject(baseUrl, 'missing.json')
    expect(f.ok).toBe(false)
    expect(f.status).toBe(404)
  })

  it('reports a transport error without throwing', async () => {
    const f = await fetchCdnObject('http://127.0.0.1:1', 'x.json')
    expect(f.ok).toBe(false)
    expect(f.error).toBeTruthy()
  })
})
