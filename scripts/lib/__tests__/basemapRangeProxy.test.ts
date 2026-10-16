/**
 * `scripts/basemap/range-proxy.mjs` — behavioural tests (#2084).
 *
 * `pmtiles extract` of world z0-14 reads the whole 64 GB tile section in ONE
 * HTTP range request ("fetching 58786221 tiles, 1 chunks, 1 requests", run
 * 38826110491), and go-pmtiles 1.31.2 has no retry or resume: its HTTPBucket
 * is a bare `http.DefaultClient.Do`. One dropped connection (attempt 1: an
 * HTTP/2 INTERNAL_ERROR at 42 GB; attempt 2: a TCP reset at 4 GB) restarts
 * the whole download.
 *
 * The proxy sits between extract and build.protomaps.com. It answers each
 * range request by fetching it upstream in bounded segments, and resumes a
 * segment from the last byte it received when the upstream connection drops.
 *
 * Runs the real script against an in-process flaky upstream. No network.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

const PROXY = resolve(process.cwd(), 'scripts/basemap/range-proxy.mjs')
const KEY = '/20261015.pmtiles'
const DATA = randomBytes(256 * 1024)

interface Upstream {
  server: http.Server
  base: string
  requests: string[]
  /** Called per request; return how to misbehave, if at all. */
  fault: (n: number) => 'drop' | '500' | '404' | 'etag' | 'ignore-range' | null
}

async function startUpstream(fault: Upstream['fault']): Promise<Upstream> {
  const up: Upstream = {
    server: undefined as unknown as http.Server,
    base: '',
    requests: [],
    fault,
  }
  up.server = http.createServer((req, res) => {
    const n = up.requests.push(req.headers.range ?? '') - 1
    const f = up.fault(n)
    if (req.url !== KEY || f === '404') {
      res.writeHead(404).end()
      return
    }
    if (f === '500') {
      res.writeHead(500).end()
      return
    }
    const etag = f === 'etag' ? '"other"' : '"v1"'
    if (f === 'ignore-range') {
      res.writeHead(200, { 'Content-Length': DATA.length, ETag: etag })
      res.end(DATA)
      return
    }
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
    if (!m) {
      res.writeHead(400).end()
      return
    }
    const a = Number(m[1])
    const b = Math.min(Number(m[2]), DATA.length - 1)
    const body = DATA.subarray(a, b + 1)
    res.writeHead(206, {
      'Content-Range': `bytes ${a}-${b}/${DATA.length}`,
      'Content-Length': body.length,
      ETag: etag,
    })
    if (f === 'drop') {
      // Send part of the body, then kill the socket: a TCP reset mid-stream.
      res.write(body.subarray(0, Math.floor(body.length / 3)), () =>
        req.socket.destroy()
      )
      return
    }
    res.end(body)
  })
  await new Promise<void>(r => up.server.listen(0, '127.0.0.1', () => r()))
  up.base = `http://127.0.0.1:${(up.server.address() as AddressInfo).port}`
  return up
}

let upstream: Upstream | undefined
let proxy: ChildProcess | undefined

async function startProxy(
  base: string,
  env: Record<string, string> = {}
): Promise<string> {
  proxy = spawn(process.execPath, [PROXY, base], {
    env: {
      ...process.env,
      RANGE_PROXY_SEGMENT_BYTES: String(64 * 1024),
      RANGE_PROXY_BACKOFF_MS: '1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const p = proxy
  return await new Promise<string>((ok, fail) => {
    let out = ''
    p.stdout!.on('data', d => {
      out += String(d)
      const line = out.split('\n')[0]
      if (out.includes('\n')) ok((JSON.parse(line) as { url: string }).url)
    })
    p.on('exit', code => fail(new Error(`proxy exited ${code}`)))
  })
}

async function get(
  url: string,
  range?: string
): Promise<{ status: number; headers: Headers; body: Buffer | null }> {
  const res = await fetch(url, {
    headers: range ? { Range: range } : {},
  })
  try {
    const body = Buffer.from(await res.arrayBuffer())
    return { status: res.status, headers: res.headers, body }
  } catch {
    return { status: res.status, headers: res.headers, body: null }
  }
}

beforeEach(() => {
  upstream = undefined
  proxy = undefined
})
afterEach(async () => {
  proxy?.kill()
  if (upstream) await new Promise(r => upstream!.server.close(r))
})

describe('range-proxy.mjs (#2084)', () => {
  it('prints its URL as JSON on stdout and serves a range verbatim', async () => {
    upstream = await startUpstream(() => null)
    const url = await startProxy(upstream.base)
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const r = await get(url + KEY, 'bytes=100-199999')
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe(
      `bytes 100-199999/${DATA.length}`
    )
    expect(r.body!.equals(DATA.subarray(100, 200000))).toBe(true)
  })

  it('splits a large range into bounded upstream segments', async () => {
    upstream = await startUpstream(() => null)
    const url = await startProxy(upstream.base)
    const r = await get(url + KEY, `bytes=0-${DATA.length - 1}`)
    expect(r.body!.equals(DATA)).toBe(true)
    // 256 KiB in 64 KiB segments.
    expect(upstream.requests).toEqual([
      'bytes=0-65535',
      'bytes=65536-131071',
      'bytes=131072-196607',
      'bytes=196608-262143',
    ])
  })

  it('resumes from the last byte received when the upstream drops mid-body', async () => {
    upstream = await startUpstream(n => (n % 2 === 0 ? 'drop' : null))
    const url = await startProxy(upstream.base)
    const r = await get(url + KEY, `bytes=0-${DATA.length - 1}`)
    expect(r.status).toBe(206)
    expect(r.body!.equals(DATA)).toBe(true)
    // The retry after a drop starts past the bytes already delivered.
    const resumed = upstream.requests[1]
    expect(resumed).toMatch(/^bytes=(\d+)-65535$/)
    expect(Number(/^bytes=(\d+)/.exec(resumed)![1])).toBeGreaterThan(0)
  })

  it('retries a 5xx', async () => {
    upstream = await startUpstream(n => (n < 2 ? '500' : null))
    const url = await startProxy(upstream.base)
    const r = await get(url + KEY, 'bytes=0-999')
    expect(r.status).toBe(206)
    expect(r.body!.equals(DATA.subarray(0, 1000))).toBe(true)
  })

  it('passes a 4xx through without retrying', async () => {
    upstream = await startUpstream(() => '404')
    const url = await startProxy(upstream.base)
    const r = await get(url + KEY, 'bytes=0-999')
    expect(r.status).toBe(404)
    expect(upstream.requests.length).toBe(1)
  })

  it('gives up after RANGE_PROXY_RETRIES consecutive failures', async () => {
    upstream = await startUpstream(() => '500')
    const url = await startProxy(upstream.base, { RANGE_PROXY_RETRIES: '3' })
    const r = await get(url + KEY, 'bytes=0-999')
    expect(r.status).toBe(502)
    expect(upstream.requests.length).toBe(4)
  })

  it('truncates the response (never splices) if the object changes mid-read', async () => {
    upstream = await startUpstream(n => (n === 0 ? null : 'etag'))
    const url = await startProxy(upstream.base)
    const r = await get(url + KEY, `bytes=0-${DATA.length - 1}`)
    expect(r.status).toBe(206)
    expect(r.body === null || r.body.length < DATA.length).toBe(true)
  })

  it('refuses an upstream that ignores Range', async () => {
    upstream = await startUpstream(() => 'ignore-range')
    const url = await startProxy(upstream.base)
    const r = await get(url + KEY, 'bytes=0-999')
    expect(r.status).toBe(502)
  })

  it('answers 400 to a request without a single byte range', async () => {
    upstream = await startUpstream(() => null)
    const url = await startProxy(upstream.base)
    expect((await get(url + KEY)).status).toBe(400)
    expect(upstream.requests.length).toBe(0)
  })
})
