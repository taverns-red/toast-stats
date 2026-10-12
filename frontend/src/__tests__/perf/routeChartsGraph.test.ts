/**
 * Recharts stays off the first-screen route graphs (#1901, mobile epic #1827).
 *
 * The Recharts chunk is the largest lazy chunk in the app (~116 KB gzip). A
 * route chunk waits for every module in its STATIC import closure before it
 * can render, so a single static import that reaches Recharts makes the whole
 * route wait for that download.
 *
 * Measured on prod 2.50.0 (`/district/61`, 375 px, applied throttling: 150 ms
 * RTT, 1.6 Mbps, 4× CPU): the route chunk landed at ~2.25 s, but the hub (and
 * its LCP caption) mounted only at ~2.82 s, right after `charts-*.js`. The
 * only path to Recharts was `GlobalRankingsTab` → `FullYearRankingChart`,
 * which the page renders solely in its "limited data" branch for untracked
 * districts. Loading that tab lazily took district LCP from 2.79 s to 2.14 s
 * on the same profile (Lighthouse simulated: 3.49 s → 3.04 s).
 *
 * This walks each first-screen page's static closure from source (relative
 * imports, `export … from` included; `import type` and dynamic `import()`
 * excluded, since neither is part of the chunk's static graph) and fails if
 * any module in it imports `recharts`. Charts belong behind `React.lazy`.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'fs'
import { dirname, relative, resolve } from 'path'

const SRC = resolve(__dirname, '../..')

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Static (value) import specifiers of a module: `import … from 'x'`,
 *  `import 'x'`, `export … from 'x'`. Type-only forms are dropped. */
function staticSpecifiers(source: string): string[] {
  const src = stripComments(source)
  const out: string[] = []
  const re =
    /(?:^|[;\n])\s*(import|export)\s+(type\s+)?([^'";]*?\bfrom\s+)?['"]([^'"]+)['"]/g
  for (const m of src.matchAll(re)) {
    const [, kind, typeOnly, clause, spec] = m
    if (typeOnly) continue
    if (kind === 'export' && !clause) continue
    out.push(spec!)
  }
  return out
}

function resolveLocal(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ]
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile() && /\.tsx?$/.test(c)) return c
  }
  return null
}

/** Modules in the static closure of `entry` that import `pkg` directly. */
function staticImportersOf(entry: string, pkg: string): string[] {
  const seen = new Set<string>()
  const hits: string[] = []
  const stack = [entry]
  while (stack.length) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of staticSpecifiers(readFileSync(file, 'utf-8'))) {
      if (spec === pkg || spec.startsWith(`${pkg}/`)) {
        hits.push(relative(SRC, file))
      } else if (spec.startsWith('.')) {
        const next = resolveLocal(file, spec)
        if (next) stack.push(next)
      }
    }
  }
  return hits
}

describe('static import scanner', () => {
  it('keeps value imports and re-exports, drops type-only and dynamic ones', () => {
    const src = [
      "import React from 'react'",
      "import { a, type B } from './a'",
      "import type { C } from './c'",
      "import './side-effect.css'",
      "export { d } from './d'",
      "export type { E } from './e'",
      "export * from './f'",
      "const G = React.lazy(() => import('./g'))",
      "// import { h } from './h'",
    ].join('\n')
    expect(staticSpecifiers(src)).toEqual([
      'react',
      './a',
      './side-effect.css',
      './d',
      './f',
    ])
  })

  it('finds a recharts import reached through a relative chain', () => {
    // Sanity check against the real tree: the chart component itself
    // imports Recharts, so the walker must report it.
    const hits = staticImportersOf(
      resolve(SRC, 'components/FullYearRankingChart.tsx'),
      'recharts'
    )
    expect(hits).toContain('components/FullYearRankingChart.tsx')
  })
})

describe('first-screen routes do not statically import Recharts (#1901)', () => {
  it.each([
    ['/district/:id', 'pages/DistrictDetailPage.tsx'],
    ['/district/:id/club/:clubId', 'pages/ClubDetailPage.tsx'],
  ])('%s (%s)', (_route, page) => {
    expect(staticImportersOf(resolve(SRC, page), 'recharts')).toEqual([])
  })
})
