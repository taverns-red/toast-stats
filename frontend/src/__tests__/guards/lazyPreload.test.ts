/* Every test-local React.lazy page is preloaded in a beforeAll (#2248).

   The synthetic cases prove the scanner fires; the census holds the repo to
   it. See lazyPreloadScan.ts for why the preload matters. */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  lazyImportTargets,
  missingPreloads,
  preloadedModules,
} from './lazyPreloadScan'

const lazyPage = [
  "const Page = React.lazy(() => import('../SomePage'))",
  '',
].join('\n')

describe('lazyPreloadScan — fires on a lazy page with no preload', () => {
  it('finds the module behind a test-local React.lazy', () => {
    expect(lazyImportTargets(lazyPage)).toEqual(['../SomePage'])
  })

  it('reads a lazy declaration split across lines', () => {
    const src = 'const Page = React.lazy(\n  () => import("../SomePage")\n)\n'
    expect(lazyImportTargets(src)).toEqual(['../SomePage'])
  })

  it('reports a lazy page with no beforeAll', () => {
    expect(missingPreloads(lazyPage)).toEqual(['../SomePage'])
  })

  it('reports a beforeAll that preloads something else', () => {
    const src = [
      lazyPage,
      'beforeAll(async () => {',
      "  await import('../OtherPage')",
      '})',
    ].join('\n')
    expect(missingPreloads(src)).toEqual(['../SomePage'])
  })

  it('does not count an import() after the hook has closed', () => {
    const src = [
      lazyPage,
      'beforeAll(() => {',
      '  setup()',
      '})',
      "it('x', async () => { await import('../SomePage') })",
    ].join('\n')
    expect(preloadedModules(src).has('../SomePage')).toBe(false)
    expect(missingPreloads(src)).toEqual(['../SomePage'])
  })

  it('passes a lazy page preloaded in a beforeAll', () => {
    const src = [
      lazyPage,
      'beforeAll(async () => {',
      '  await Promise.all([',
      "    import('../SomePage'),",
      "    import('../../components/Chunk'),",
      '  ])',
      '}, 30_000)',
    ].join('\n')
    expect(missingPreloads(src)).toEqual([])
  })
})

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('census: test-local lazy pages are preloaded', () => {
  it('every *.test.tsx that wraps a module in React.lazy preloads it', () => {
    const offenders = readdirSync(srcDir, { recursive: true })
      .map(String)
      .filter(f => f.endsWith('.test.tsx'))
      .flatMap(f => {
        const missing = missingPreloads(readFileSync(join(srcDir, f), 'utf8'))
        return missing.map(m => `${relative(srcDir, join(srcDir, f))}: ${m}`)
      })
    expect(offenders).toEqual([])
  })
})
