/**
 * Guard (#2998): a test makes an executable only through the shared helper.
 *
 * A stub with no `#!` line makes bash fall back to interpreting it after
 * ENOEXEC, and under parallel load that child sometimes dies (rc 139,
 * #2996). The helper always writes the shebang, so any test that writes a
 * file with an executable mode by hand is a way back to that flake.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitEnv } from './gitEnv'

const ROOT = resolve(__dirname, '../../..')

/** The only files allowed to set an executable mode (this file holds fixtures). */
const ALLOWED = new Set([
  'scripts/lib/__tests__/stubExecutable.ts',
  'scripts/lib/__tests__/stubExecutableGuard.test.ts',
])

const TEST_FILE = /\.test\.(?:[cm]?[jt]sx?)$/

function hasExecBit(literal: string): boolean {
  const digits = literal.replace(/^0o/i, '').replace(/^0+(?=\d)/, '')
  const mode = parseInt(digits, 8)
  return Number.isNaN(mode) ? true : (mode & 0o111) !== 0
}

/**
 * Every place the source sets an executable mode: a `mode:` option with an
 * exec bit, a `chmod`/`chmodSync` call (unless its mode is a literal with no
 * exec bit), or a `chmod +x` shell string. Whitespace and line breaks are
 * ignored, so reformatting can't hide a call.
 */
export function findExecutableWrites(source: string): string[] {
  const hits: string[] = []
  for (const m of source.matchAll(/\bmode\s*:\s*(0o?[0-7]+|\d+)/gi)) {
    const lit = m[1]
    const value = /^0o/i.test(lit) || /^0\d/.test(lit) ? lit : `0o${lit}`
    // A bare decimal such as 493 is 0o755: convert before testing.
    const mode = /^0o?[0-7]+$/i.test(lit)
      ? hasExecBit(value)
      : (parseInt(lit, 10) & 0o111) !== 0
    if (mode) hits.push(m[0])
  }
  for (const m of source.matchAll(/\bchmod(?:Sync)?\s*\(([^)]*)\)/g)) {
    const args = m[1]
    const last = args.split(',').pop()!.trim()
    const lit = /^0o?[0-7]+$/i.test(last) ? last : null
    if (lit === null || hasExecBit(lit)) hits.push(m[0])
  }
  for (const m of source.matchAll(/\bchmod\s+[-+\w,=]*x\b/g)) hits.push(m[0])
  for (const m of source.matchAll(/['"`]chmod['"`]/g)) hits.push(m[0])
  return hits
}

function trackedTestFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], {
    cwd: ROOT,
    env: gitEnv(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\n').filter(f => TEST_FILE.test(f) && !ALLOWED.has(f))
}

describe('findExecutableWrites (matcher)', () => {
  it('flags a mode option with an exec bit', () => {
    expect(
      findExecutableWrites('writeFileSync(f, b, { mode: 0o755 })')
    ).toHaveLength(1)
    expect(
      findExecutableWrites('writeFileSync(f, b, { mode:0o700 })')
    ).toHaveLength(1)
    expect(findExecutableWrites('{\n  mode\n    : 0o755,\n}')).toHaveLength(1)
    expect(findExecutableWrites('{ mode: 0755 }')).toHaveLength(1)
    expect(findExecutableWrites('{ mode: 493 }')).toHaveLength(1)
  })

  it('flags chmodSync however it is spelled or split across lines', () => {
    expect(findExecutableWrites('chmodSync(f, 0o755)')).toHaveLength(1)
    expect(
      findExecutableWrites('fs.chmodSync(\n  f,\n  0o755\n)')
    ).toHaveLength(1)
    expect(findExecutableWrites('await chmod(f, 0o777)')).toHaveLength(1)
    expect(findExecutableWrites('chmodSync(f, MODE)')).toHaveLength(1)
  })

  it('flags a shell chmod', () => {
    expect(
      findExecutableWrites("spawnSync('chmod', ['+x', f])")
    ).not.toHaveLength(0)
    expect(findExecutableWrites('run(`chmod +x ${f}`)')).not.toHaveLength(0)
  })

  it('leaves non-executable modes and unrelated code alone', () => {
    expect(
      findExecutableWrites('writeFileSync(f, b, { mode: 0o644 })')
    ).toEqual([])
    expect(findExecutableWrites('chmodSync(f, 0o600)')).toEqual([])
    expect(
      findExecutableWrites("const mode = 'dark'\nconst x = { model: 1 }")
    ).toEqual([])
    expect(findExecutableWrites('writeFileSync(f, body)')).toEqual([])
  })
})

describe('tests make executables only through stubExecutable (#2998)', () => {
  it('no test file sets an executable mode by hand', () => {
    const offenders = trackedTestFiles()
      .map(f => ({
        f,
        hits: findExecutableWrites(readFileSync(resolve(ROOT, f), 'utf8')),
      }))
      .filter(o => o.hits.length > 0)
      .map(o => `${o.f} (${o.hits.length})`)
    expect(
      offenders,
      'use writeStubExecutable / makeExecutable from scripts/lib/__tests__/stubExecutable.ts'
    ).toEqual([])
  })
})
