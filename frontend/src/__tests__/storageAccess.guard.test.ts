/**
 * Browser-storage access guard (#1646).
 *
 * With storage blocked ("block all site data", some private modes, enterprise
 * policy) merely touching `window.localStorage` throws a SecurityError. One
 * unguarded read in a context provider's initial state blanked the whole app.
 *
 * This tripwire walks every non-test source file under `frontend/src` and
 * fails if a `localStorage` / `sessionStorage` access sits outside a
 * `try { … }` block. Prefer the versioned primitive
 * (`utils/localStorageStore.ts`) over a hand-rolled try/catch.
 *
 * The check is lexical: an access is guarded when the nearest preceding
 * `try {` is more recent than the nearest preceding `catch`. That is exact
 * for the flat try/catch shape every storage call site here uses.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(__dirname, '..')

/** Comments mention storage by name; they must not count as code. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(path)
    }
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)
      ? [path]
      : []
  })
}

const ACCESS = /\b(localStorage|sessionStorage)\b/g

/** Returns `file:line` for every storage access not inside a try block. */
function findUnguardedStorageAccess(src: string, file = 'source'): string[] {
  const code = stripComments(src)
  const hits: string[] = []
  for (const m of code.matchAll(ACCESS)) {
    const before = code.slice(0, m.index)
    const lastTry = before.lastIndexOf('try {')
    const lastCatch = Math.max(
      before.lastIndexOf('catch {'),
      before.lastIndexOf('catch (')
    )
    if (lastTry === -1 || lastTry < lastCatch) {
      const line = before.split('\n').length
      hits.push(`${file}:${line}`)
    }
  }
  return hits
}

describe('browser storage access is guarded (#1646)', () => {
  it('flags an unguarded read and accepts a guarded one (self-test)', () => {
    expect(
      findUnguardedStorageAccess(`const t = localStorage.getItem('theme')`)
    ).toHaveLength(1)
    expect(
      findUnguardedStorageAccess(
        `try { a() } catch { b() }\nwindow.sessionStorage.setItem('k', 'v')`
      )
    ).toHaveLength(1)
    expect(
      findUnguardedStorageAccess(
        `try {\n  return localStorage.getItem('theme')\n} catch {\n  return null\n}`
      )
    ).toEqual([])
    expect(
      findUnguardedStorageAccess(`// localStorage is persisted here`)
    ).toEqual([])
  })

  it('every localStorage/sessionStorage access in frontend/src is in a try block', () => {
    const offenders = sourceFiles(SRC).flatMap(file =>
      findUnguardedStorageAccess(
        readFileSync(file, 'utf-8'),
        relative(SRC, file)
      )
    )
    expect(offenders).toEqual([])
  })
})
