/**
 * `scripts/dev/cdn-cors-proxy.mjs` — behavioural tests (#2106).
 *
 * On 2026-10-13 a hand-rolled local CORS proxy did `fetch(cdn + req.url)` with
 * no headers and then `arrayBuffer()`. It dropped `Range`, so every PMTiles
 * read became a full 200 GET of the 3.52 GiB basemap: 8 GETs, 28 GiB of prod
 * CDN egress. The checked-in proxy must forward Range, stream, and refuse a
 * whole-archive read.
 *
 * Runs the real script against an in-process upstream. No network.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const PROXY = resolve(process.cwd(), 'scripts/dev/cdn-cors-proxy.mjs')
const PMTILES = '/basemap/world.pmtiles'
const DATA = randomBytes(256 * 1024)
const GZ = gzipSync(Buffer.from(JSON.stringify({ districtId: '61' })))

interface Seen {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
}

interface Upstream {
  server: http.Server
  base: string
  seen: Seen[]
  /** Set by the streaming route; resolves when the upstream may finish. */
  release?: () => void
  /** Resolves when an upstream request's socket closes before it ended. */
  aborted: Promise<void>
}

async function startUpstream(): Promise<Upstream> {
  let markAborted: () => void = () => {}
  const up: Upstream = {
    server: undefined as unknown as http.Server,
    base: '',
    seen: [],
    aborted: new Promise<void>(r => (markAborted = r)),
  }
  up.server = http.createServer((req, res) => {
    up.seen.push({
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
    })
    if (req.url === PMTILES) {
      if (req.headers['if-none-match'] === '"v1"') {
        res.writeHead(304, { ETag: '"v1"' }).end()
        return
      }
      const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
      if (!m) {
        res.writeHead(200, {
          'Content-Length': DATA.length,
          'Accept-Ranges': 'bytes',
          ETag: '"v1"',
        })
        res.end(DATA)
        return
      }
      const a = Number(m[1])
      const b = Math.min(Number(m[2]), DATA.length - 1)
      const body = DATA.subarray(a, b + 1)
      res.writeHead(206, {
        'Content-Range': `bytes ${a}-${b}/${DATA.length}`,
        'Content-Length': body.length,
        'Accept-Ranges': 'bytes',
        ETag: '"v1"',
      })
      res.end(body)
      return
    }
    if (req.url === '/v1/latest.json') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Content-Length': GZ.length,
      })
      res.end(GZ)
      return
    }
    if (req.url === '/slow.json') {
      // First chunk now; the rest only once the test has seen the first chunk
      // arrive through the proxy. A buffering proxy deadlocks here.
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{"part":1,')
      up.release = () => res.end('"done":true}')
      return
    }
    if (req.url === '/hang.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{')
      res.on('close', () => {
        if (!res.writableFinished) markAborted()
      })
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>(r => up.server.listen(0, '127.0.0.1', () => r()))
  up.base = `http://127.0.0.1:${(up.server.address() as AddressInfo).port}`
  return up
}

let upstream: Upstream | undefined
let proxy: ChildProcess | undefined

async function startProxy(base: string): Promise<string> {
  proxy = spawn(process.execPath, [PROXY, base], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const p = proxy
  return await new Promise<string>((ok, fail) => {
    let out = ''
    p.stdout!.on('data', d => {
      out += String(d)
      if (out.includes('\n')) {
        ok((JSON.parse(out.split('\n')[0]!) as { url: string }).url)
      }
    })
    p.on('exit', code => fail(new Error(`proxy exited ${code}`)))
  })
}

async function setup(): Promise<{ up: Upstream; url: string }> {
  upstream = await startUpstream()
  const url = await startProxy(upstream.base)
  return { up: upstream, url }
}

afterEach(async () => {
  proxy?.kill()
  proxy = undefined
  if (upstream) {
    upstream.release?.()
    upstream.server.closeAllConnections()
    await new Promise(r => upstream!.server.close(r))
  }
  upstream = undefined
})

describe('cdn-cors-proxy.mjs (#2106)', () => {
  it('forwards Range and returns a 206 with byte-identical content', async () => {
    const { up, url } = await setup()
    const res = await fetch(url + PMTILES, {
      headers: { Range: 'bytes=1000-17383', Origin: 'http://localhost:3000' },
    })
    const body = Buffer.from(await res.arrayBuffer())

    expect(res.status).toBe(206)
    expect(body.equals(DATA.subarray(1000, 17384))).toBe(true)
    expect(res.headers.get('content-range')).toBe(
      `bytes 1000-17383/${DATA.length}`
    )
    expect(res.headers.get('content-length')).toBe('16384')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('etag')).toBe('"v1"')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const exposed = (res.headers.get('access-control-expose-headers') ?? '')
      .toLowerCase()
      .split(/\s*,\s*/)
    for (const h of [
      'content-range',
      'accept-ranges',
      'content-length',
      'content-encoding',
      'etag',
    ]) {
      expect(exposed).toContain(h)
    }
    expect(up.seen).toHaveLength(1)
    expect(up.seen[0]!.headers.range).toBe('bytes=1000-17383')
  })

  it('refuses a full GET of a .pmtiles archive without touching upstream', async () => {
    const { up, url } = await setup()
    const res = await fetch(url + PMTILES)
    const text = await res.text()

    expect(res.status).toBe(416)
    expect(text).toMatch(/Range/)
    expect(text).toMatch(/pmtiles/i)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(up.seen).toHaveLength(0)
  })

  it('refuses an open-ended range of a .pmtiles archive (a full read in disguise)', async () => {
    const { up, url } = await setup()
    const res = await fetch(url + PMTILES + '?v=2', {
      headers: { Range: 'bytes=0-' },
    })
    await res.text()

    expect(res.status).toBe(416)
    expect(up.seen).toHaveLength(0)
  })

  it('streams: the first chunk arrives before the upstream finishes', async () => {
    const { up, url } = await setup()
    const res = await fetch(url + '/slow.json')
    const reader = res.body!.getReader()
    const first = await reader.read()

    expect(new TextDecoder().decode(first.value)).toBe('{"part":1,')
    // Only now may the upstream finish; a buffering proxy never got here.
    up.release!()
    let rest = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      rest += new TextDecoder().decode(value)
    }
    expect(rest).toBe('"done":true}')
  })

  it('passes Accept-Encoding through and relays the encoded body untouched', async () => {
    const { up, url } = await setup()
    const raw = await new Promise<{
      headers: http.IncomingHttpHeaders
      body: Buffer
    }>((ok, fail) => {
      http
        .get(
          url + '/v1/latest.json',
          { headers: { 'Accept-Encoding': 'gzip' } },
          r => {
            const chunks: Buffer[] = []
            r.on('data', c => chunks.push(c as Buffer))
            r.on('end', () =>
              ok({ headers: r.headers, body: Buffer.concat(chunks) })
            )
          }
        )
        .on('error', fail)
    })

    expect(up.seen[0]!.headers['accept-encoding']).toBe('gzip')
    expect(raw.headers['content-encoding']).toBe('gzip')
    expect(raw.body.equals(GZ)).toBe(true)
  })

  it('forwards If-None-Match and passes a 304 through', async () => {
    const { up, url } = await setup()
    const res = await fetch(url + PMTILES, {
      headers: { Range: 'bytes=0-99', 'If-None-Match': '"v1"' },
    })

    expect(res.status).toBe(304)
    expect(up.seen[0]!.headers['if-none-match']).toBe('"v1"')
  })

  it('answers a CORS preflight without contacting upstream', async () => {
    const { up, url } = await setup()
    const res = await fetch(url + PMTILES, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'range',
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(
      (res.headers.get('access-control-allow-headers') ?? '').toLowerCase()
    ).toContain('range')
    expect(up.seen).toHaveLength(0)
  })

  it('aborts the upstream request when the client goes away', async () => {
    const { up, url } = await setup()
    const ac = new AbortController()
    const res = await fetch(url + '/hang.json', { signal: ac.signal })
    const reader = res.body!.getReader()
    await reader.read()
    ac.abort()

    await expect(
      Promise.race([
        up.aborted.then(() => 'aborted'),
        new Promise(r => setTimeout(() => r('timeout'), 3000)),
      ])
    ).resolves.toBe('aborted')
  })
})
