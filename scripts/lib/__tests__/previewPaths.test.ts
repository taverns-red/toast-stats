/**
 * The preview path list and its classifier (#2865).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import picomatch from 'picomatch'
import { PREVIEW_PATHS, isPreviewPath, needsPreview } from '../previewPaths'

describe('PREVIEW_PATHS', () => {
  it('is the list pr-preview.yml carried as `paths:`, unchanged (20 entries)', () => {
    expect([...PREVIEW_PATHS]).toEqual([
      'frontend/**',
      'packages/shared-contracts/**',
      'packages/analytics-core/**',
      'firebase.json',
      '.firebaserc',
      '.github/workflows/pr-preview.yml',
      'scripts/check-hosting-site.sh',
      'lighthouserc.mobile.js',
      '.nvmrc',
      'tools/firebase-tools/**',
      'scripts/unlisted-smoke-specs.ts',
      'scripts/lib/smokeSpecCoverage.ts',
      'scripts/serve-preview-locally.sh',
      'scripts/preview-local-server.mjs',
      'scripts/check-deployed-files.mjs',
      'scripts/refresh-smoke-fixtures.ts',
      'scripts/lib/smokeFixtures.ts',
      'scripts/lib/cdnSchemaCanary.ts',
      'scripts/lib/zodIssueSummary.ts',
      'scripts/smoke-fixtures.manifest.json',
    ])
  })

  it('counts workflow edits of pr-preview.yml itself as preview paths', () => {
    expect(isPreviewPath('.github/workflows/pr-preview.yml')).toBe(true)
    expect(isPreviewPath('.github/workflows/ci.yml')).toBe(false)
  })
})

describe('isPreviewPath agrees with GitHub path semantics (picomatch)', () => {
  const files = [
    ...PREVIEW_PATHS.map(g => g.replace('/**', '/deep/new/file.ts')),
    'frontendish/x.ts',
    'packages/collector-cli/src/a.ts',
    'packages/shared-contracts-extra/a.ts',
    'docs/product-spec.md',
    'README.md',
    'nested/.nvmrc',
    'frontend/.gitignore',
    'scripts/ci-changes.ts',
    'scripts/lib/previewPaths.ts',
    '.github/workflows/pr-preview-cleanup.yml',
  ]
  it.each(files)('%s', file => {
    const expected = PREVIEW_PATHS.some(g => picomatch(g, { dot: true })(file))
    expect(isPreviewPath(file)).toBe(expected)
  })
})

describe('needsPreview', () => {
  it('is false for a docs-only or collector-only change', () => {
    expect(needsPreview(['docs/x.md', 'tasks/lessons/a.md'])).toBe(false)
    expect(needsPreview(['packages/collector-cli/src/a.ts'])).toBe(false)
  })
  it('is true when ANY file is a preview path', () => {
    expect(needsPreview(['docs/x.md', 'frontend/src/App.tsx'])).toBe(true)
  })
  it('is true for an empty diff, never a free pass', () => {
    expect(needsPreview([])).toBe(true)
  })
})

describe('the workflow no longer carries the list (#2865)', () => {
  it('has no `paths:` key under pull_request', () => {
    const raw = readFileSync(
      join(process.cwd(), '.github/workflows/pr-preview.yml'),
      'utf8'
    )
    expect(raw).not.toMatch(/^\s+paths:\s*$/m)
  })
})
