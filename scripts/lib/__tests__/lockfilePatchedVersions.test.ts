import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Resolve the repo root from this file, not process.cwd() (Lesson 082).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// Floors set by the Trivy alerts in #2862 (code-scanning #152-#162). A
// lockfile entry below its floor on the same major line re-opens an alert.
// Keyed by package; each floor applies to the entries on its major.
const FLOORS: Record<string, Record<number, string>> = {
  hono: { 4: '4.13.16' },
  '@hono/node-server': { 1: '1.19.18', 2: '2.1.6' },
  'fast-xml-parser': { 5: '5.12.0' },
}

const parse = (v: string): number[] => v.split('-')[0]!.split('.').map(Number)

const lessThan = (a: string, b: string): boolean => {
  const [pa, pb] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0)
  }
  return false
}

interface LockEntry {
  version?: string
}

export const findUnpatched = (
  packages: Record<string, LockEntry>
): { path: string; version: string; floor: string }[] => {
  const out: { path: string; version: string; floor: string }[] = []
  for (const [path, entry] of Object.entries(packages)) {
    const name = path.split('node_modules/').pop() ?? ''
    const floors = FLOORS[name]
    if (!floors || !entry.version) continue
    const floor = floors[parse(entry.version)[0]!]
    if (floor && lessThan(entry.version, floor)) {
      out.push({ path, version: entry.version, floor })
    }
  }
  return out
}

describe('findUnpatched', () => {
  it('fires on a version below its floor (sentinel)', () => {
    expect(
      findUnpatched({ 'node_modules/hono': { version: '4.13.13' } })
    ).toEqual([
      { path: 'node_modules/hono', version: '4.13.13', floor: '4.13.16' },
    ])
  })

  it('applies the floor of the matching major only', () => {
    expect(
      findUnpatched({
        'node_modules/@hono/node-server': { version: '1.19.18' },
        'node_modules/a/node_modules/@hono/node-server': { version: '2.1.5' },
      })
    ).toEqual([
      {
        path: 'node_modules/a/node_modules/@hono/node-server',
        version: '2.1.5',
        floor: '2.1.6',
      },
    ])
  })

  it('passes at and above the floor', () => {
    expect(
      findUnpatched({
        'node_modules/hono': { version: '4.14.0' },
        'node_modules/fast-xml-parser': { version: '5.12.0' },
      })
    ).toEqual([])
  })
})

describe('repo lockfile (#2862)', () => {
  it('resolves hono, @hono/node-server and fast-xml-parser at or above the patched versions', () => {
    const lock = JSON.parse(
      readFileSync(join(repoRoot, 'package-lock.json'), 'utf8')
    )
    expect(findUnpatched(lock.packages)).toEqual([])
  })
})
