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

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (name === 'node_modules' || name === '__tests__') return []
    if (statSync(p).isDirectory()) return sourceFiles(p)
    return /\.(tsx|ts)$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : []
  })
}

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

// A raw z-index number, with or without `!important`.
const RAW_Z_INDEX = /z-index:\s*(-?\d+)\s*(?:!important\s*)?[;}]/
const RAW_Z_INDEX_ALL = new RegExp(RAW_Z_INDEX.source, 'g')
// Tailwind `z-50` / `md:z-[60]`, not the negative `-z-10` or `z-(--token)`.
const TAILWIND_Z = /(?<![\w-])z-(?:(\d+)|\[(\d+)\])(?![\w-])/
const TAILWIND_Z_ALL = new RegExp(TAILWIND_Z.source, 'g')

describe('z-index tokens (#2674)', () => {
  it('no raw z-index above the local range outside the token file', () => {
    const offenders: string[] = []
    for (const file of cssFiles(SRC)) {
      if (file === TOKENS) continue
      for (const m of strip(readFileSync(file, 'utf-8')).matchAll(
        RAW_Z_INDEX_ALL
      )) {
        if (Number(m[1]) > LOCAL_MAX)
          offenders.push(`${relative(SRC, file)}: z-index ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /* #2719: the first guard missed `z-index: 60 !important` (the `!` broke the
     `;` match) and Tailwind classes such as `z-50`, which skip the token
     file entirely. */
  it('the raw-number pattern also catches !important values', () => {
    expect(RAW_Z_INDEX.test('z-index: 60 !important;')).toBe(true)
    expect(RAW_Z_INDEX.test('z-index: 60;')).toBe(true)
    expect(RAW_Z_INDEX.test('z-index: var(--z-banner) !important;')).toBe(false)
  })

  it('no Tailwind z-N or z-[N] class above the local range in components', () => {
    expect(TAILWIND_Z.test('className="absolute z-50 px-4"')).toBe(true)
    expect(TAILWIND_Z.test('className="md:z-[60]"')).toBe(true)
    expect(TAILWIND_Z.test('className="-z-10 z-(--z-tooltip)"')).toBe(false)
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      for (const m of readFileSync(file, 'utf-8').matchAll(TAILWIND_Z_ALL)) {
        const n = Number(m[1] ?? m[2])
        if (n > LOCAL_MAX) offenders.push(`${relative(SRC, file)}: ${m[0]}`)
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

  /* The #2674 migration moved no layer: each rule keeps the number it had.
     Resolved through the token file, so a token cannot quietly change a
     rule's layer (the tab fade was 10, not --z-sticky-search's 5). */
  it('keeps migrated rules at their original layer', () => {
    const tokens = readFileSync(TOKENS, 'utf-8')
    const value = (token: string) =>
      Number(tokens.match(new RegExp(`${token}:\\s*(\\d+)`))?.[1])
    const resolved = (file: string, selector: string) => {
      const css = strip(readFileSync(join(SRC, file), 'utf-8'))
      const body = css.match(
        new RegExp(
          `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`
        )
      )?.[1]
      const z = body?.match(/z-index:\s*(?:var\((--z-[\w-]+)\)|(\d+))/)
      return z?.[1] ? value(z[1]) : Number(z?.[2])
    }
    expect(
      resolved(
        'index.css',
        ".tab-scroll-fade[data-scrollable-right='true']::after"
      )
    ).toBe(10)
    expect(resolved('styles/components/section-bar.css', '.section-bar')).toBe(
      45
    )
    expect(resolved('styles/components/consent.css', '.consent-banner')).toBe(
      60
    )
    expect(resolved('styles/components/context-bar.css', '.context-bar')).toBe(
      35
    )
  })

  it('keeps the scale ordered: section bar under the banner, banner under overlays', () => {
    const css = readFileSync(TOKENS, 'utf-8')
    const n = (name: string) =>
      Number(css.match(new RegExp(`${name}:\\s*(\\d+)`))?.[1])
    expect(n('--z-header')).toBeLessThan(n('--z-bottom-bar'))
    expect(n('--z-bottom-bar')).toBeLessThan(n('--z-banner'))
    expect(n('--z-banner')).toBeLessThan(n('--z-overlay'))
    // #2719: the filter panel and the banner no longer tie. The banner wins,
    // so the consent choice stays reachable over an open panel.
    expect(n('--z-fullscreen')).toBeLessThan(n('--z-panel'))
    expect(n('--z-panel')).toBeLessThan(n('--z-banner'))
    expect(n('--z-overlay')).toBeLessThan(n('--z-modal'))
  })
})
