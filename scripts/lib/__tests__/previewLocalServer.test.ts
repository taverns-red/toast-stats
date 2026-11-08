/**
 * `scripts/preview-local-server.mjs` — compress like Firebase Hosting (#2544).
 *
 * PR Preview's Playwright shards and Lighthouse routes run against a local
 * build served by the Firebase Hosting emulator. The emulator applies
 * firebase.json's headers and rewrites, but its brotli is quality ~4, while
 * Hosting serves brotli quality 11 (an index chunk measured 44,748 bytes from
 * ts.taverns.red; quality 11 gives 44,746, quality 4 gives 52,724). The
 * Lighthouse mobile gate asserts transfer sizes, so ~18% more script bytes
 * would fail budgets for a reason no user sees. The proxy re-encodes
 * compressible 200 responses at quality 11 and passes everything else
 * through untouched.
 *
 * One header edit: it drops `upgrade-insecure-requests` from the CSP. The
 * local origin is plain http://127.0.0.1, and WebKit (unlike Chromium, which
 * treats loopback as trustworthy) upgrades every same-origin request to
 * https://127.0.0.1, where nothing listens, so no page would load. On the
 * https channel the directive has nothing to upgrade; the real-preview smoke
 * still runs under the full header.
 *
 * Runs the real script on a free port against a stub upstream. No network.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import * as http from 'node:http'
import * as net from 'node:net'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'

const SERVER = resolve(process.cwd(), 'scripts/preview-local-server.mjs')
const JS = Buffer.from(
  Array.from({ length: 4000 }, (_, i) => `export const v${i} = ${i * 7};`).join(
    '\n'
  )
)
const PNG = Buffer.from('not really a png, but not compressible either')
let page = '<!doctype html><title>build one</title>'.repeat(50)
const CSP = "default-src 'self'; object-src 'none'"
const CSP_UPGRADE = `${CSP}; upgrade-insecure-requests`

let upstream: http.Server
let child: ChildProcess | undefined
let port = 0
const seen: Array<{ path: string; acceptEncoding?: string; range?: string }> =
  []

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = net.createServer()
    s.once('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as AddressInfo).port
      s.close(() => ok(p))
    })
  })
}

interface Got {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

function get(path: string, headers: Record<string, string> = {}): Promise<Got> {
  return new Promise((ok, fail) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c as Buffer))
        res.on('end', () =>
          ok({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        )
      }
    )
    req.on('error', fail)
    req.end()
  })
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    seen.push({
      path: req.url ?? '',
      acceptEncoding: req.headers['accept-encoding'],
      range: req.headers['range'],
    })
    if (req.url === '/assets/app.js') {
      res.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
        'content-length': String(JS.length),
        'cache-control': 'public, max-age=31536000, immutable',
        'content-security-policy': CSP_UPGRADE,
      })
      res.end(JS)
    } else if (req.url === '/') {
      // The emulator's ETag does not change when a rebuild changes the file.
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        etag: 'same-etag-every-build',
      })
      res.end(page)
    } else if (req.url === '/icon.png') {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(PNG)
    } else if (req.url === '/basemap/world.pmtiles') {
      res.writeHead(206, {
        'content-type': 'application/octet-stream',
        'content-range': `bytes 0-3/100`,
      })
      res.end(Buffer.from('abcd'))
    } else {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end('<h1>nope</h1>')
    }
  })
  await new Promise<void>(ok => upstream.listen(0, '127.0.0.1', ok))
  const up = (upstream.address() as AddressInfo).port
  port = await freePort()
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      UPSTREAM: `http://127.0.0.1:${up}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise<void>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('server not ready')), 5000)
    const onData = (d: Buffer) => {
      if (/ready/.test(String(d))) {
        clearTimeout(timer)
        ok()
      }
    }
    child?.stdout?.on('data', onData)
    child?.stderr?.on('data', onData)
    child?.on('exit', code => fail(new Error(`server exited ${code}`)))
  })
})

afterAll(async () => {
  child?.kill()
  await new Promise(ok => upstream.close(ok))
})

describe('preview-local-server.mjs (#2544)', () => {
  it('brotli-encodes compressible 200s at quality 11, like Hosting', async () => {
    seen.length = 0
    const r = await get('/assets/app.js', {
      'accept-encoding': 'gzip, deflate, br',
    })
    expect(r.status).toBe(200)
    expect(r.headers['content-encoding']).toBe('br')
    expect(r.headers['vary']).toMatch(/accept-encoding/i)
    const q11 = brotliCompressSync(JS, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    })
    expect(r.body.length).toBe(q11.length)
    expect(Number(r.headers['content-length'])).toBe(q11.length)
    expect(brotliDecompressSync(r.body).equals(JS)).toBe(true)
    // It asked the emulator for the raw bytes, not its own quality-4 brotli.
    expect(seen[0]?.acceptEncoding).toBe('identity')
  })

  it("keeps firebase.json's headers, less upgrade-insecure-requests", async () => {
    const r = await get('/assets/app.js', { 'accept-encoding': 'br' })
    expect(r.headers['content-security-policy']).toBe(CSP)
    expect(r.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable'
    )
  })

  it("leaves a client without br to the emulator's own encoding", async () => {
    seen.length = 0
    const r = await get('/assets/app.js', { 'accept-encoding': 'gzip' })
    expect(seen[0]?.acceptEncoding).toBe('gzip')
    expect(r.headers['content-encoding']).toBeUndefined()
    expect(r.body.equals(JS)).toBe(true)
  })

  it('passes a range request through untouched', async () => {
    seen.length = 0
    const r = await get('/basemap/world.pmtiles', {
      'accept-encoding': 'br',
      range: 'bytes=0-3',
    })
    expect(seen[0]?.range).toBe('bytes=0-3')
    expect(r.status).toBe(206)
    expect(r.headers['content-range']).toBe('bytes 0-3/100')
    expect(r.headers['content-encoding']).toBeUndefined()
    expect(r.body.toString()).toBe('abcd')
  })

  it('does not compress an image', async () => {
    const r = await get('/icon.png', { 'accept-encoding': 'br' })
    expect(r.headers['content-encoding']).toBeUndefined()
    expect(r.body.equals(PNG)).toBe(true)
  })

  it('serves a rebuilt file, not the last build from its cache', async () => {
    const decode = async () =>
      brotliDecompressSync(
        (await get('/', { 'accept-encoding': 'br' })).body
      ).toString()
    expect(await decode()).toContain('build one')
    page = '<!doctype html><title>build two</title>'.repeat(50)
    expect(await decode()).toContain('build two')
  })

  it("passes the emulator's 404 through", async () => {
    const r = await get('/assets/missing.js', { 'accept-encoding': 'br' })
    expect(r.status).toBe(404)
  })
})
