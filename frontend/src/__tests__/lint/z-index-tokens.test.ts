/**
 * Guard: stacking layers come from the named `--z-*` scale (#2674, CHR-35).
 *
 * A raw `z-index: 45` in one file and a raw `z-index: 60` in another is how
 * the consent banner (60) ended up over the phone section bar (45) without
 * anyone choosing it. Every layer above a component's own local stacking
 * (0 to 3: a badge over its card, a gradient over its scroller) must be a
 * token defined in tokens/redesign.css, or a calc() of one.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TOKENS = join(SRC, 'styles/tokens/redesign.css')
const LOCAL_MAX = 3

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (name === 'node_modules' || name === '__tests__') return []
    return statSync(p).isDirectory()
      ? cssFiles(p)
      : p.endsWith('.css')
        ? [p]
        : []
  })
}

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

describe('z-index tokens (#2674)', () => {
  it('no raw z-index above the local range outside the token file', () => {
    const offenders: string[] = []
    for (const file of cssFiles(SRC)) {
      if (file === TOKENS) continue
      for (const m of strip(readFileSync(file, 'utf-8')).matchAll(
        /z-index:\s*(-?\d+)\s*[;}]/g
      )) {
        if (Number(m[1]) > LOCAL_MAX)
          offenders.push(`${relative(SRC, file)}: z-index ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('every var(--z-*) a rule uses is defined in the token file', () => {
    const defined = new Set(
      [
        ...strip(readFileSync(TOKENS, 'utf-8')).matchAll(/(--z-[\w-]+)\s*:/g),
      ].map(m => m[1])
    )
    const missing: string[] = []
    for (const file of cssFiles(SRC)) {
      for (const m of strip(readFileSync(file, 'utf-8')).matchAll(
        /var\((--z-[\w-]+)\)/g
      )) {
        if (!defined.has(m[1]!)) missing.push(`${relative(SRC, file)}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('keeps the scale ordered: section bar under the banner, banner under overlays', () => {
    const css = readFileSync(TOKENS, 'utf-8')
    const n = (name: string) =>
      Number(css.match(new RegExp(`${name}:\\s*(\\d+)`))?.[1])
    expect(n('--z-header')).toBeLessThan(n('--z-bottom-bar'))
    expect(n('--z-bottom-bar')).toBeLessThan(n('--z-banner'))
    expect(n('--z-banner')).toBeLessThan(n('--z-overlay'))
    expect(n('--z-overlay')).toBeLessThan(n('--z-modal'))
  })
})
