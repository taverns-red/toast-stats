/**
 * CDN checks must be told which CDN to read (#2974).
 *
 * check-cdn-schema.ts used to fall back to the production CDN when
 * CDN_BASE_URL was unset. In the #2492 staging drill a check meant for
 * staging ran against prod and could have reported "healthy" for the wrong
 * target. Each script now refuses to run without an explicit target
 * (non-zero exit, message on stderr).
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'

const REPO = process.cwd()
const UNREACHABLE = 'http://127.0.0.1:9'

function run(script: string, args: string[], env: Record<string, string>) {
  const base: NodeJS.ProcessEnv = { ...process.env }
  delete base['CDN_BASE_URL']
  delete base['GITHUB_OUTPUT']
  return spawnSync(
    'npx',
    ['tsx', path.join(REPO, 'scripts', script), ...args],
    { cwd: REPO, encoding: 'utf-8', timeout: 90_000, env: { ...base, ...env } }
  )
}

// Each case starts `npx tsx` as a child process, which alone takes seconds.
const SPAWN_TIMEOUT = 60_000
const REFUSAL = /CDN_BASE_URL/

describe('CDN scripts refuse to run without an explicit target (#2974)', () => {
  it.each([
    ['check-cdn-schema.ts', []],
    ['hosting-smoke.ts', []],
    ['cdn-compression-check.ts', ['--path', 'v1/latest.json']],
  ])(
    '%s exits non-zero with a message on stderr',
    (script, args) => {
      const r = run(script, args, {
        BASE_URL: UNREACHABLE,
        SMOKE_WINDOW_SECONDS: '1',
        SMOKE_RENDER: 'off',
      })
      expect(r.status).not.toBe(0)
      expect(r.stderr).toMatch(REFUSAL)
      expect(r.stdout).not.toMatch(REFUSAL)
    },
    SPAWN_TIMEOUT
  )

  it.each([
    ['hosting-smoke.ts', [] as string[]],
    ['cdn-compression-check.ts', ['--path', 'v1/latest.json']],
  ])(
    '%s runs when CDN_BASE_URL is set',
    (script, args) => {
      const r = run(script, args, {
        CDN_BASE_URL: UNREACHABLE,
        BASE_URL: UNREACHABLE,
        SMOKE_WINDOW_SECONDS: '1',
        SMOKE_RENDER: 'off',
      })
      expect(r.stderr).not.toMatch(/requires an explicit CDN target/)
    },
    SPAWN_TIMEOUT
  )

  it(
    'cdn-compression-check.ts runs when --base is given',
    () => {
      const r = run(
        'cdn-compression-check.ts',
        ['--base', UNREACHABLE, '--path', 'v1/latest.json'],
        {}
      )
      expect(r.stderr).not.toMatch(/requires an explicit CDN target/)
    },
    SPAWN_TIMEOUT
  )
})
