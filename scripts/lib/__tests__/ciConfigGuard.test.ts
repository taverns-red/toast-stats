import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  findDevelopBranchRefs,
  findLiteralNodeVersions,
  parseLintMaxWarnings,
  nvmrcMajor,
} from '../ciConfigGuard'

// Resolve the repo root from this file, not process.cwd() (Lesson 082) — the
// suite passes whether vitest launches from the repo root or a workspace.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const workflowsDir = join(repoRoot, '.github', 'workflows')

const workflowFiles = readdirSync(workflowsDir).filter(f => f.endsWith('.yml'))
const readWorkflow = (f: string) => readFileSync(join(workflowsDir, f), 'utf8')
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'))

const WORKSPACE_PKGS = [
  'frontend/package.json',
  'packages/collector-cli/package.json',
  'packages/analytics-core/package.json',
  'packages/shared-contracts/package.json',
  'packages/mcp-server/package.json',
]

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

describe('.nvmrc is the single Node pin (AC4)', () => {
  it('exists and its major matches root engines.node', () => {
    const nvmrcPath = join(repoRoot, '.nvmrc')
    expect(existsSync(nvmrcPath)).toBe(true)
    const major = nvmrcMajor(readFileSync(nvmrcPath, 'utf8'))
    const engines: string = readJson('package.json').engines?.node ?? ''
    expect(engines).not.toBe('')
    expect(engines).toContain(major)
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
    expect(ci).toMatch(/typecheck.*@toastmasters\/collector-cli/)
  })
})
