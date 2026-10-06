import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  findLockfileVersionDrift,
  findMissingLockExtraFiles,
  lockVersionJsonPath,
} from '../lockfileVersionSync'

// Resolve the repo root from this file, not process.cwd() (Lesson 082).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'))

// Source the workspace list from root `workspaces` (R20/R21) so a new
// workspace auto-falls into the guard instead of silently escaping it.
const WORKSPACES: { path: string; version: string }[] = readJson(
  'package.json'
).workspaces.map((path: string) => ({
  path,
  version: readJson(`${path}/package.json`).version,
}))

describe('findLockfileVersionDrift', () => {
  it('fires on a lock entry one release behind (sentinel, #1574)', () => {
    const lock = { packages: { frontend: { version: '3.25.1' } } }
    expect(
      findLockfileVersionDrift(lock, [{ path: 'frontend', version: '3.25.2' }])
    ).toEqual([
      { path: 'frontend', packageJsonVersion: '3.25.2', lockVersion: '3.25.1' },
    ])
  })

  it('fires on a workspace missing from the lock', () => {
    expect(
      findLockfileVersionDrift({ packages: {} }, [
        { path: 'packages/x', version: '1.0.0' },
      ])
    ).toHaveLength(1)
  })

  it('passes when versions agree', () => {
    const lock = { packages: { frontend: { version: '3.25.2' } } }
    expect(
      findLockfileVersionDrift(lock, [{ path: 'frontend', version: '3.25.2' }])
    ).toEqual([])
  })

  it('repo: package-lock.json agrees with every workspace package.json', () => {
    expect(
      findLockfileVersionDrift(readJson('package-lock.json'), WORKSPACES)
    ).toEqual([])
  })
})

describe('findMissingLockExtraFiles', () => {
  const good = (path: string) => ({
    'extra-files': [
      {
        type: 'json',
        path: '/package-lock.json',
        jsonpath: lockVersionJsonPath(path),
      },
    ],
  })

  it('fires on a workspace package with no lock extra-file (sentinel)', () => {
    expect(
      findMissingLockExtraFiles({ packages: { '.': {}, frontend: {} } })
    ).toEqual(['frontend'])
  })

  it('fires on a package-relative lock path (no leading slash)', () => {
    expect(
      findMissingLockExtraFiles({
        packages: {
          frontend: {
            'extra-files': [
              {
                type: 'json',
                path: 'package-lock.json',
                jsonpath: lockVersionJsonPath('frontend'),
              },
            ],
          },
        },
      })
    ).toEqual(['frontend'])
  })

  it('fires on a jsonpath targeting a different workspace', () => {
    expect(
      findMissingLockExtraFiles({
        packages: { frontend: good('packages/mcp-server') },
      })
    ).toEqual(['frontend'])
  })

  it('exempts the root package and passes a correct entry', () => {
    expect(
      findMissingLockExtraFiles({
        packages: { '.': {}, frontend: good('frontend') },
      })
    ).toEqual([])
  })

  it('repo: every release-please workspace package syncs the root lock', () => {
    expect(
      findMissingLockExtraFiles(readJson('release-please-config.json'))
    ).toEqual([])
  })

  it('repo: release-please packages cover every npm workspace', () => {
    const rpPaths = Object.keys(readJson('release-please-config.json').packages)
    for (const ws of WORKSPACES) expect(rpPaths).toContain(ws.path)
  })
})
