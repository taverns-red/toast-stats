import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  findDevelopBranchRefs,
  findLiteralNodeVersions,
  parseLintMaxWarnings,
  nvmrcMajor,
  findNonPrivateTooling,
  engineFloorMajor,
} from '../ciConfigGuard'

// Resolve the repo root from this file, not process.cwd() (Lesson 082) — the
// suite passes whether vitest launches from the repo root or a workspace.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const workflowsDir = join(repoRoot, '.github', 'workflows')

const workflowFiles = readdirSync(workflowsDir).filter(f => f.endsWith('.yml'))
const readWorkflow = (f: string) => readFileSync(join(workflowsDir, f), 'utf8')
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'))

// Source the workspace package.json list from root `workspaces`, not a
// hardcoded array — a new workspace then auto-falls into the lint-cap and
// engines-pin guards instead of silently escaping them (R20/R21, L150).
const WORKSPACE_PKGS: string[] = readJson('package.json').workspaces.map(
  (ws: string) => `${ws}/package.json`
)

describe('findDevelopBranchRefs', () => {
  it('fires on a known-bad develop trigger (sentinel)', () => {
    expect(findDevelopBranchRefs('  branches: [main, develop]')).toHaveLength(1)
    expect(findDevelopBranchRefs('    - develop')).toHaveLength(1)
  })

  it('does not false-positive on development/developer', () => {
    expect(findDevelopBranchRefs('# developer notes for development')).toEqual(
      []
    )
  })

  it.each(workflowFiles)('no workflow triggers off develop: %s', file => {
    expect(findDevelopBranchRefs(readWorkflow(file))).toEqual([])
  })
})

describe('findLiteralNodeVersions', () => {
  it('fires on a literal and an env-expression node-version (sentinel)', () => {
    expect(
      findLiteralNodeVersions("          node-version: '22'")
    ).toHaveLength(1)
    expect(
      findLiteralNodeVersions('          node-version: ${{ env.NODE_VERSION }}')
    ).toHaveLength(1)
  })

  it('accepts the single-pin node-version-file form', () => {
    expect(
      findLiteralNodeVersions("          node-version-file: '.nvmrc'")
    ).toEqual([])
  })

  it.each(workflowFiles)('node is pinned via .nvmrc only: %s', file => {
    expect(findLiteralNodeVersions(readWorkflow(file))).toEqual([])
  })
})

describe('findNonPrivateTooling (#2853)', () => {
  it('flags a non-private, non-published workspace (sentinel)', () => {
    expect(
      findNonPrivateTooling(
        {
          'a/package.json': {},
          'b/package.json': { private: true },
          'pub/package.json': {},
        },
        ['pub/package.json']
      )
    ).toEqual(['a/package.json'])
  })

  it('exempts a published package and accepts all-private', () => {
    expect(
      findNonPrivateTooling({ 'pub/package.json': {} }, ['pub/package.json'])
    ).toEqual([])
    expect(
      findNonPrivateTooling({ 'b/package.json': { private: true } }, [])
    ).toEqual([])
  })
})

describe('engineFloorMajor (#2853)', () => {
  it('parses the floor as a number, so >=126 is not 26 (sentinel)', () => {
    expect(engineFloorMajor('>=26')).toBe(26)
    expect(engineFloorMajor('>=126')).toBe(126)
    expect(engineFloorMajor('>=126')).not.toBe(26)
    expect(engineFloorMajor('>= 22.1.0')).toBe(22)
  })

  it('returns null for a non-floor range', () => {
    expect(engineFloorMajor('^26')).toBeNull()
    expect(engineFloorMajor('')).toBeNull()
  })
})

describe('.nvmrc is the single Node pin (AC4)', () => {
  const nvmrcPath = join(repoRoot, '.nvmrc')

  it('exists', () => {
    expect(existsSync(nvmrcPath)).toBe(true)
  })

  // Every engines.node declaration (root + each private workspace) must agree
  // with .nvmrc's major, or a workspace can silently pin a divergent Node.
  // Published packages are exempt (#2853): `engines` there is what consumers
  // need, not what tooling runs on, so mcp-server keeps its own floor
  // (pinned by nodeVersionPolicy.test.ts).
  // The exemption is an explicit list, so a new workspace that forgets
  // `private: true` is held to the .nvmrc major instead of escaping.
  const PUBLISHED = ['packages/mcp-server/package.json']
  const all = ['package.json', ...WORKSPACE_PKGS]
  const tooling = all.filter(rel => !PUBLISHED.includes(rel))

  it('every workspace but PUBLISHED is private', () => {
    expect(
      findNonPrivateTooling(
        Object.fromEntries(all.map(rel => [rel, readJson(rel)])),
        PUBLISHED
      )
    ).toEqual([])
  })

  it.each(tooling)('%s engines.node floor equals the .nvmrc major', rel => {
    const major = Number(nvmrcMajor(readFileSync(nvmrcPath, 'utf8')))
    expect(engineFloorMajor(readJson(rel).engines?.node ?? '')).toBe(major)
  })
})

describe('lint caps (AC5)', () => {
  it('parses and rejects the cap from a lint script (sentinel)', () => {
    expect(parseLintMaxWarnings('eslint . --max-warnings 60')).toBe(60)
    expect(parseLintMaxWarnings('eslint . --ext .ts')).toBeNull()
  })

  it.each(WORKSPACE_PKGS)('%s lint carries a --max-warnings cap', rel => {
    const lint: string = readJson(rel).scripts?.lint ?? ''
    expect(parseLintMaxWarnings(lint)).not.toBeNull()
  })

  it('frontend cap is ratcheted to <= 60', () => {
    const lint: string = readJson('frontend/package.json').scripts.lint
    expect(parseLintMaxWarnings(lint)).toBeLessThanOrEqual(60)
  })
})

describe('collector-cli is in the PR gate (AC2)', () => {
  const ci = readFileSync(join(workflowsDir, 'ci.yml'), 'utf8')

  it('ci.yml builds collector-cli', () => {
    expect(ci).toMatch(/npm run build:collector-cli/)
  })

  it('ci.yml typechecks collector-cli', () => {
    expect(ci).toMatch(/typecheck.*@taverns-red\/collector-cli/)
  })
})
