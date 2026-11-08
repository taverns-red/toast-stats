/**
 * `scripts/check-deployed-files.mjs` — every built file is on the channel
 * (#2544).
 *
 * PR Preview's smoke shards test the build served inside the runner, so the
 * deployed channel is checked only by the real-preview job. staging.smoke.ts
 * loads a few routes: a font, a glyph or a lazy chunk missing from the
 * deploy would pass it, and Hosting's SPA rewrite answers a missing file
 * with index.html (200, text/html). The check HEADs every file of the build
 * on BASE_URL: 200, and an HTML type only for HTML pages (cleanUrls: a page
 * `x.html` is checked at `/x`, `index.html` at its directory).
 *
 * Runs the real script against a stub server. No network.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(process.cwd(), 'scripts/check-deployed-files.mjs')

let dist = ''
let server: http.Server
let base = ''
const seen: string[] = []
/** path -> [status, content-type]; anything else is the SPA rewrite. */
let served: Record<string, [number, string]> = {}

function run(): Promise<{ code: number; out: string }> {
  return new Promise(ok => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, BASE_URL: base, DIST_DIR: dist },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (out += d))
    child.on('exit', code => ok({ code: code ?? -1, out }))
  })
}

const ALL_GOOD: Record<string, [number, string]> = {
  '/': [200, 'text/html; charset=utf-8'],
  '/district/61': [200, 'text/html; charset=utf-8'],
  '/assets/app-abc.js': [200, 'text/javascript; charset=utf-8'],
  '/assets/inter-latin.woff2': [200, 'font/woff2'],
  '/robots.txt': [200, 'text/plain; charset=utf-8'],
  '/basemap/glyphs/0-255.pbf': [200, 'application/octet-stream'],
}

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'deployed-files-'))
  mkdirSync(join(dist, 'assets'))
  mkdirSync(join(dist, 'district'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html>')
  writeFileSync(join(dist, 'district', '61.html'), '<!doctype html>')
  writeFileSync(join(dist, 'assets', 'app-abc.js'), 'export {}')
  writeFileSync(join(dist, 'assets', 'inter-latin.woff2'), 'font')
  writeFileSync(join(dist, 'robots.txt'), 'User-agent: *')
  mkdirSync(join(dist, 'basemap', 'glyphs'), { recursive: true })
  writeFileSync(join(dist, 'basemap', 'glyphs', '0-255.pbf'), 'glyph')
  writeFileSync(join(dist, '.DS_Store'), 'not deployed (firebase ignore)')
  server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`)
    const hit = served[req.url ?? '']
    let [status, type] = hit ?? [200, 'text/html; charset=utf-8']
    // Hosting labels a gzipped .pbf glyph text/html (seen on ts.taverns.red
    // and the channel, 2026-11-08); uncompressed it is octet-stream.
    if (
      req.url?.endsWith('.pbf') &&
      /gzip|br/.test(String(req.headers['accept-encoding']))
    )
      type = 'text/html; charset=UTF-8'
    res.writeHead(status, { 'content-type': type })
    res.end()
  })
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise(ok => server.close(ok))
  rmSync(dist, { recursive: true, force: true })
})

describe('check-deployed-files.mjs (#2544)', () => {
  it('passes when every file is served with its own type', async () => {
    served = { ...ALL_GOOD }
    seen.length = 0
    const r = await run()
    expect(r.out).toMatch(/6 files/)
    expect(r.code).toBe(0)
    expect(seen.sort()).toEqual(
      Object.keys(ALL_GOOD)
        .map(p => `HEAD ${p}`)
        .sort()
    )
  })

  it('fails a file the SPA rewrite answers with HTML', async () => {
    served = { ...ALL_GOOD }
    delete served['/assets/inter-latin.woff2']
    const r = await run()
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/assets\/inter-latin\.woff2.*text\/html/)
  })

  it('fails a file that is not 200', async () => {
    served = { ...ALL_GOOD, '/assets/app-abc.js': [404, 'text/html'] }
    const r = await run()
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/assets\/app-abc\.js.*404/)
  })

  it('fails a page that is not HTML', async () => {
    served = { ...ALL_GOOD, '/district/61': [200, 'application/json'] }
    const r = await run()
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/district\/61/)
  })

  it('fails with no BASE_URL rather than checking nothing', async () => {
    const saved = base
    base = ''
    const r = await run()
    base = saved
    expect(r.code).not.toBe(0)
  })
})
