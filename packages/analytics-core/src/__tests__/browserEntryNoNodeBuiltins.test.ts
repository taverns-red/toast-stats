/**
 * Guard (#2447): the package's main entry (`.` → `src/index.ts`) is what the
 * frontend imports, so no Node built-in may be reachable from it through a
 * runtime import. Under `vite dev` a reachable `node:fs` is replaced by a
 * browser-external proxy that throws on first property access, which crashed
 * every page importing analytics-core. Node-only code (the snapshot-directory
 * readers) lives behind the `./node` subpath (`src/node.ts`) instead.
 *
 * The walk follows static and dynamic relative imports from the entry,
 * resolving `./x.js` to `./x.ts` (or `./x/index.ts`), and ignores type-only
 * imports, which TypeScript erases.
 */
import { describe, it, expect } from 'vitest'
import { builtinModules } from 'node:module'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')
const BUILTINS = new Set(builtinModules)

function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true
  return BUILTINS.has(specifier.split('/')[0]!)
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Runtime module specifiers of one source file (type-only imports dropped). */
function runtimeSpecifiers(source: string): string[] {
  const code = stripComments(source)
  const specifiers: string[] = []
  const fromClause =
    /\b(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g
  for (const match of code.matchAll(fromClause)) {
    if (match[2]) continue // `import type …` / `export type …`
    specifiers.push(match[4]!)
  }
  for (const match of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1]!)
  }
  for (const match of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1]!)
  }
  return specifiers
}

function resolveRelative(fromFile: string, specifier: string): string {
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ''))
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`Cannot resolve ${specifier} from ${fromFile}`)
}

/** Each reachable Node built-in, with the import chain that reaches it. */
function nodeBuiltinsReachableFrom(entry: string): string[] {
  const root = dirname(entry)
  const hits: string[] = []
  const seen = new Set<string>()
  const queue: Array<{ file: string; chain: string[] }> = [
    { file: entry, chain: [relative(root, entry)] },
  ]
  while (queue.length > 0) {
    const { file, chain } = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const specifier of runtimeSpecifiers(readFileSync(file, 'utf-8'))) {
      if (specifier.startsWith('.')) {
        const next = resolveRelative(file, specifier)
        queue.push({ file: next, chain: [...chain, relative(root, next)] })
      } else if (isNodeBuiltin(specifier)) {
        hits.push([...chain, specifier].join(' -> '))
      }
    }
  }
  return hits
}

describe('browser-safe main entry (#2447)', () => {
  it('reaches no Node built-in from src/index.ts', () => {
    expect(nodeBuiltinsReachableFrom(join(SRC, 'index.ts'))).toEqual([])
  })

  it('maps the package "." export to the browser-safe index', () => {
    const pkg = JSON.parse(
      readFileSync(join(SRC, '..', 'package.json'), 'utf-8')
    ) as { exports: Record<string, { import: { default: string } }> }
    expect(pkg.exports['.']!.import.default).toBe('./dist/esm/index.js')
  })

  it('detects a built-in behind a relative import, and skips type-only ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ac-2447-'))
    try {
      writeFileSync(
        join(dir, 'entry.ts'),
        [
          "import type { Stats } from 'node:fs'",
          "export type { Dirent } from 'node:fs'",
          "export {\n  reader,\n  type Reader,\n} from './reader.js'",
        ].join('\n')
      )
      writeFileSync(
        join(dir, 'reader.ts'),
        "import { readFileSync } from 'fs'\nexport const reader = readFileSync\n"
      )
      expect(nodeBuiltinsReachableFrom(join(dir, 'entry.ts'))).toEqual([
        'entry.ts -> reader.ts -> fs',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
