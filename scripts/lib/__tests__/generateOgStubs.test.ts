/**
 * The build step that writes the per-district stubs (#2304), run for real
 * against a temp dist/ and a recorded rankings file, plus the Hosting and
 * build wiring that makes `/district/<id>` serve the stub.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/generate-og-stubs.ts')
const RANKINGS = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/og-cards/rankings.json'
)

let tmp: string
let dist: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-stubs-'))
  dist = path.join(tmp, 'dist')
  fs.mkdirSync(dist)
  fs.copyFileSync(
    path.join(REPO, 'frontend/index.html'),
    path.join(dist, 'index.html')
  )
})
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

function run(env: Record<string, string>) {
  return spawnSync('npx', ['tsx', SCRIPT], {
    cwd: REPO,
    encoding: 'utf-8',
    env: { ...process.env, CI: '', OG_STUBS_DIST: dist, ...env },
  })
}

describe('generate-og-stubs', () => {
  it('writes district/<id>.html per district in the rankings, tagged with the build CDN', () => {
    const r = run({
      OG_STUBS_RANKINGS_FILE: RANKINGS,
      VITE_CDN_BASE_URL: 'https://cdn-staging.taverns.red',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(fs.readdirSync(path.join(dist, 'district')).sort()).toEqual([
      '10.html',
      '11.html',
      '17.html',
      '27.html',
      '59.html',
      '61.html',
    ])
    const stub = fs.readFileSync(path.join(dist, 'district/61.html'), 'utf8')
    expect(stub).toContain(
      'content="https://cdn-staging.taverns.red/og/v1/district/61.png"'
    )
    // index.html itself is left alone.
    expect(fs.readFileSync(path.join(dist, 'index.html'), 'utf8')).toBe(
      fs.readFileSync(path.join(REPO, 'frontend/index.html'), 'utf8')
    )
    // Logs go to stderr; stdout stays empty (R4).
    expect(r.stdout).toBe('')
  })

  it('a local build with no target says so and uses the prod CDN (#2982)', () => {
    const env = { OG_STUBS_RANKINGS_FILE: RANKINGS, VITE_CDN_BASE_URL: '' }
    const r = run(env)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/VITE_CDN_BASE_URL is not set/)
    expect(
      fs.readFileSync(path.join(dist, 'district/61.html'), 'utf8')
    ).toContain('content="https://cdn.taverns.red/og/v1/district/61.png"')
  })

  it('a CI build with no target fails with exit 2 and writes no stubs (#2982)', () => {
    const r = run({
      CI: 'true',
      OG_STUBS_RANKINGS_FILE: RANKINGS,
      VITE_CDN_BASE_URL: '',
    })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/VITE_CDN_BASE_URL/)
    expect(r.stdout).toBe('')
    expect(fs.existsSync(path.join(dist, 'district'))).toBe(false)
  })

  it('a malformed target exits 2 in CI and locally, writing no stubs (#2987)', () => {
    for (const CI of ['true', '']) {
      const r = run({
        CI,
        OG_STUBS_RANKINGS_FILE: RANKINGS,
        VITE_CDN_BASE_URL: 'cdn-staging.taverns.red',
      })
      expect(r.status).toBe(2)
      expect(r.stderr).toMatch(/absolute http\(s\) URL/)
      expect(fs.existsSync(path.join(dist, 'district'))).toBe(false)
    }
  })

  it('a CI build with an explicit target still works (#2982)', () => {
    const r = run({
      CI: 'true',
      OG_STUBS_RANKINGS_FILE: RANKINGS,
      VITE_CDN_BASE_URL: 'https://cdn-staging.taverns.red',
    })
    expect(r.status, r.stderr).toBe(0)
  })

  it('an unreadable district list is a warning and no stubs, never a failed build', () => {
    const r = run({ OG_STUBS_RANKINGS_FILE: path.join(tmp, 'missing.json') })
    expect(r.status).toBe(0)
    expect(r.stderr).toMatch(/::warning/)
    expect(fs.existsSync(path.join(dist, 'district'))).toBe(false)
  })

  it('a missing dist/index.html fails (the build did not run)', () => {
    fs.rmSync(path.join(dist, 'index.html'))
    expect(run({ OG_STUBS_RANKINGS_FILE: RANKINGS }).status).not.toBe(0)
  })
})

describe('wiring', () => {
  it('build:frontend writes the stubs after the vite build', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')
    )
    expect(pkg.scripts['build:frontend']).toMatch(
      /npm run build --workspace=frontend && npx tsx scripts\/generate-og-stubs\.ts$/
    )
  })

  it('both Hosting targets serve district/<id>.html at /district/<id> (cleanUrls)', () => {
    const fb = JSON.parse(
      fs.readFileSync(path.join(REPO, 'firebase.json'), 'utf8')
    )
    const targets = fb.hosting as Array<{ target: string; cleanUrls?: boolean }>
    expect(targets.map(t => [t.target, t.cleanUrls])).toEqual([
      ['production', true],
      ['staging', true],
    ])
  })
})
