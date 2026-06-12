/**
 * Packaging manifest guard (#1163, epic #1162 Sprint 1).
 *
 * Pins the publishable shape of this package under the Red Taverns-controlled
 * name `@taverns-red/toast-stats-mcp` (operator ruling on #1162 — the
 * `@toastmasters/*` scope is not ours and carries trademark exposure):
 *
 * - the npm name, public publishConfig, and bin entry;
 * - the tarball whitelist ships ONLY the self-contained bin + README — the
 *   tsc-emitted module tree imports the unpublished workspace package
 *   `@toastmasters/shared-contracts` and must never reach the registry;
 * - `dependencies` contains only registry-resolvable packages (the workspace
 *   contracts dep is build-time only, inlined into `dist/bin.js` by esbuild);
 * - release-please owns the version (manifest entry matches package.json);
 * - no stale references to the old name in the root scripts or CI gates.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..', '..')
const repoRoot = join(packageRoot, '..', '..')

interface PackageManifest {
  name: string
  version: string
  private?: boolean
  license?: string
  homepage?: string
  publishConfig?: { access?: string }
  files?: string[]
  bin?: Record<string, string>
  repository?: { type?: string; url?: string; directory?: string }
  dependencies?: Record<string, string>
}

const pkg = JSON.parse(
  readFileSync(join(packageRoot, 'package.json'), 'utf8')
) as PackageManifest

describe('publishable manifest (@taverns-red/toast-stats-mcp)', () => {
  it('is named under the Red Taverns scope', () => {
    expect(pkg.name).toBe('@taverns-red/toast-stats-mcp')
  })

  it('is publishable: not private, public access', () => {
    expect(pkg.private ?? false).toBe(false)
    expect(pkg.publishConfig?.access).toBe('public')
  })

  it('ships only the self-contained bin and README', () => {
    // npm auto-includes package.json, README.md and LICENSE; the whitelist
    // must NOT pull in the unbundled tsc module tree (broken imports of the
    // unpublished workspace contracts package) nor src/fixtures.
    expect(pkg.files).toEqual(['dist/bin.js', 'README.md'])
  })

  it('exposes the toast-stats-mcp bin at the bundled entry', () => {
    expect(pkg.bin).toEqual({ 'toast-stats-mcp': './dist/bin.js' })
  })

  it('carries repository/homepage/license metadata', () => {
    expect(pkg.license).toBe('MIT')
    expect(pkg.homepage).toBeTruthy()
    expect(pkg.repository?.type).toBe('git')
    expect(pkg.repository?.url).toContain('github.com/taverns-red/toast-stats')
    expect(pkg.repository?.directory).toBe('packages/mcp-server')
  })

  it('declares only registry-resolvable runtime dependencies', () => {
    // The publishable invariant: a clean `npm install` of the tarball must
    // resolve every runtime dep from the public registry. The workspace
    // contracts package is build-time only (inlined into the bin bundle).
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      '@modelcontextprotocol/sdk',
      'zod',
    ])
  })
})

describe('release flow (release-please owns the version)', () => {
  const config = JSON.parse(
    readFileSync(join(repoRoot, 'release-please-config.json'), 'utf8')
  ) as { packages: Record<string, { component?: string }> }
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, '.release-please-manifest.json'), 'utf8')
  ) as Record<string, string>

  it('registers the package in release-please-config.json', () => {
    expect(config.packages['packages/mcp-server']?.component).toBe(
      'toast-stats-mcp'
    )
  })

  it('tracks the current version in the release-please manifest', () => {
    expect(manifest['packages/mcp-server']).toBe(pkg.version)
  })
})

describe('no stale references to the old name (R8 grep-proof)', () => {
  const OLD_NAME = '@toastmasters/mcp-server'

  it.each(['package.json', join('.github', 'workflows', 'ci.yml')])(
    '%s does not reference the old package name',
    relPath => {
      const text = readFileSync(join(repoRoot, relPath), 'utf8')
      expect(text).not.toContain(OLD_NAME)
    }
  )
})
