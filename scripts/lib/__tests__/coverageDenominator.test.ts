/**
 * Unit tests for the coverage-denominator exhaustiveness guard (#1536).
 *
 * R20 applied to coverage inclusion: a git-tracked source file that is absent
 * from the coverage provider's own report (coverage/coverage-final.json) has
 * 0% coverage that silently counts as 100%. The guard compares the tracked
 * source set — minus the exclusions DECLARED in the workspace's vitest config,
 * read through vitest's own config resolution — against the provider's file
 * list, and names every file that fell out of the denominator.
 *
 * RED phase: written before scripts/lib/coverageDenominator.ts exists.
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  isSourceCandidate,
  isInDeclaredDenominator,
  hasRuntimeCode,
  reportedFiles,
  findMissingFromDenominator,
  resolveCoverageGlobs,
  formatDenominatorReport,
} from '../coverageDenominator'

const FIXTURE_ROOT = join(
  fileURLToPath(new URL('.', import.meta.url)),
  'fixtures',
  'coverage-denominator'
)

describe('isSourceCandidate', () => {
  it('accepts JS/TS source files under src/', () => {
    for (const f of [
      'src/a.ts',
      'src/b/c.tsx',
      'src/d.js',
      'src/e.mjs',
      'src/f.cts',
      'src/g.jsx',
    ]) {
      expect(isSourceCandidate(f)).toBe(true)
    }
  })

  it('rejects files outside src/, declaration files and non-code files', () => {
    for (const f of [
      'scripts/a.ts',
      'vitest.config.ts',
      'src/types.d.ts',
      'src/env.d.mts',
      'src/styles.css',
      'src/data.json',
      'src/README.md',
    ]) {
      expect(isSourceCandidate(f)).toBe(false)
    }
  })
})

describe('isInDeclaredDenominator (mirrors vitest BaseCoverageProvider.isIncluded)', () => {
  it('includes every file when coverage.include is unset and nothing excludes it', () => {
    expect(isInDeclaredDenominator('src/a.ts', { exclude: [] })).toBe(true)
  })

  it('drops a file matched by a declared exclude glob', () => {
    const globs = { exclude: ['**/*.test.ts', 'src/__fixtures__/**'] }
    expect(isInDeclaredDenominator('src/a.test.ts', globs)).toBe(false)
    expect(isInDeclaredDenominator('src/__fixtures__/x.ts', globs)).toBe(false)
    expect(isInDeclaredDenominator('src/x.ts', globs)).toBe(true)
  })

  it('matches dotfiles like vitest does (dot: true)', () => {
    expect(
      isInDeclaredDenominator('src/.hidden/a.ts', { exclude: ['src/**'] })
    ).toBe(false)
  })

  it('honours coverage.include when set', () => {
    const globs = { include: ['src/lib/**'], exclude: [] }
    expect(isInDeclaredDenominator('src/lib/a.ts', globs)).toBe(true)
    expect(isInDeclaredDenominator('src/other/a.ts', globs)).toBe(false)
  })
})

describe('hasRuntimeCode', async () => {
  it('is false for a type-only module (its types are erased entirely)', async () => {
    const src = `import type { X } from './x'\nexport interface A { a: X }\nexport type B = string\n`
    expect(await hasRuntimeCode(src, 'src/types/a.ts')).toBe(false)
  })

  it('is true for a module with a runtime statement', async () => {
    expect(await hasRuntimeCode('export const A = 1\n', 'src/a.ts')).toBe(true)
  })

  it('is true for a pure re-export barrel (it is loaded at runtime)', async () => {
    expect(await hasRuntimeCode(`export * from './a'\n`, 'src/index.ts')).toBe(
      true
    )
  })

  it('handles TSX', async () => {
    const src = `export const C = () => <div>hi</div>\n`
    expect(await hasRuntimeCode(src, 'src/C.tsx')).toBe(true)
  })
})

describe('reportedFiles', () => {
  it('converts the provider keys to workspace-relative posix paths', () => {
    const final = {
      '/repo/ws/src/a.ts': {},
      '/repo/ws/src/b/c.ts': {},
    }
    expect([...reportedFiles(final, '/repo/ws')].sort()).toEqual([
      'src/a.ts',
      'src/b/c.ts',
    ])
  })
})

describe('findMissingFromDenominator', () => {
  const runtime = () => true

  it('returns nothing when every tracked source file is reported', () => {
    expect(
      findMissingFromDenominator({
        tracked: ['src/a.ts', 'src/b.ts'],
        reported: new Set(['src/a.ts', 'src/b.ts']),
        globs: { exclude: [] },
        hasRuntimeCode: runtime,
      })
    ).toEqual([])
  })

  it('names a tracked source file absent from the coverage report', () => {
    expect(
      findMissingFromDenominator({
        tracked: ['src/a.ts', 'src/untested.ts'],
        reported: new Set(['src/a.ts']),
        globs: { exclude: [] },
        hasRuntimeCode: runtime,
      })
    ).toEqual(['src/untested.ts'])
  })

  it('honours a declared coverage.exclude without any script change', () => {
    expect(
      findMissingFromDenominator({
        tracked: ['src/a.ts', 'src/generated/x.ts'],
        reported: new Set(['src/a.ts']),
        globs: { exclude: ['src/generated/**'] },
        hasRuntimeCode: runtime,
      })
    ).toEqual([])
  })

  it('ignores non-source files and files outside src/', () => {
    expect(
      findMissingFromDenominator({
        tracked: ['src/a.ts', 'src/a.css', 'scripts/x.ts', 'src/env.d.ts'],
        reported: new Set(['src/a.ts']),
        globs: { exclude: [] },
        hasRuntimeCode: runtime,
      })
    ).toEqual([])
  })

  it('does not flag a type-only file: it has no executable code to count', () => {
    expect(
      findMissingFromDenominator({
        tracked: ['src/a.ts', 'src/types.ts'],
        reported: new Set(['src/a.ts']),
        globs: { exclude: [] },
        hasRuntimeCode: f => f !== 'src/types.ts',
      })
    ).toEqual([])
  })
})

describe('resolveCoverageGlobs (vitest config resolution, not restated globs)', () => {
  it('reads coverage.exclude declared in the workspace vitest config', async () => {
    const globs = await resolveCoverageGlobs(FIXTURE_ROOT)
    expect(globs.exclude).toContain('src/excluded/**')
    expect(isInDeclaredDenominator('src/excluded/skip.ts', globs)).toBe(false)
  })

  it('includes the test files vitest itself excludes from coverage', async () => {
    const globs = await resolveCoverageGlobs(FIXTURE_ROOT)
    expect(isInDeclaredDenominator('src/a.test.ts', globs)).toBe(false)
    expect(isInDeclaredDenominator('src/kept.ts', globs)).toBe(true)
  })

  it('flags an untested file in a synthetic workspace end to end', async () => {
    const globs = await resolveCoverageGlobs(FIXTURE_ROOT)
    const missing = findMissingFromDenominator({
      tracked: [
        'src/kept.ts',
        'src/untested.ts',
        'src/excluded/skip.ts',
        'src/a.test.ts',
      ],
      reported: new Set(['src/kept.ts']),
      globs,
      hasRuntimeCode: () => true,
    })
    expect(missing).toEqual(['src/untested.ts'])
  })
})

describe('formatDenominatorReport', () => {
  it('names each missing file under its workspace', () => {
    const out = formatDenominatorReport([
      { workspace: 'frontend', expected: 3, missing: ['src/x.ts'] },
      { workspace: 'packages/a', expected: 2, missing: [] },
    ])
    expect(out).toContain('frontend')
    expect(out).toContain('src/x.ts')
    expect(out).toContain('packages/a')
  })
})
