/**
 * `scripts/lighthouse-cdn-server.mjs` — request-path containment (#2289).
 *
 * CodeQL js/path-injection (alerts 104/105) flags the request path flowing
 * into `stat`/`readFile`. The server must only ever serve files under its
 * fixture and dist roots, and a malformed percent-encoding must not take it
 * down (`decodeURIComponent` throws URIError inside the async handler).
 *
 * Runs the real script on a free port against temp roots. No network.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import * as http from 'node:http'
import * as net from 'node:net'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SERVER = resolve(process.cwd(), 'scripts/lighthouse-cdn-server.mjs')
const SECRET = 'top-secret-outside-the-roots'

let tmp = ''
let port = 0
let child: ChildProcess | undefined

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

/** A raw GET: `path` goes on the wire as-is (no `..` normalisation). */
function get(path: string): Promise<{ status: number; body: string }> {
  return new Promise((ok, fail) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET' },
      res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', c => (body += c))
        res.on('end', () => ok({ status: res.statusCode ?? 0, body }))
      }
    )
    req.on('error', fail)
    req.end()
  })
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'lh-cdn-server-'))
  const dist = join(tmp, 'dist')
  const fixtures = join(tmp, 'fixtures')
  mkdirSync(join(fixtures, 'v1'), { recursive: true })
  mkdirSync(dist)
  writeFileSync(join(dist, 'index.html'), '<!doctype html><p>spa</p>')
  writeFileSync(join(fixtures, 'v1', 'latest.json'), '{"ok":true}')
  writeFileSync(join(tmp, 'secret.txt'), SECRET)

  port = await freePort()
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      DIST_DIR: dist,
      FIXTURE_DIR: fixtures,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise<void>((ok, fail) => {
    child!.stdout!.on('data', d => {
      if (String(d).includes('ready')) ok()
    })
    child!.once('exit', code => fail(new Error(`server exited ${code}`)))
  })
})

afterAll(() => {
  child?.kill()
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})

describe('lighthouse-cdn-server path containment (#2289)', () => {
  it('serves a fixture and the SPA from their roots', async () => {
    expect(await get('/v1/latest.json')).toMatchObject({
      status: 200,
      body: '{"ok":true}',
    })
    expect((await get('/')).body).toContain('spa')
  })

  it.each([
    '/../secret.txt',
    '/..%2Fsecret.txt',
    '/v1/..%2F..%2Fsecret.txt',
    '/%2E%2E/secret.txt',
  ])('never serves a file outside the roots: %s', async path => {
    const res = await get(path)
    expect(res.body).not.toContain(SECRET)
  })

  it('answers a malformed percent-encoding and keeps serving', async () => {
    const res = await get('/%E0%A4%A')
    expect(res.status).toBe(400)
    expect((await get('/v1/latest.json')).status).toBe(200)
  })
})
