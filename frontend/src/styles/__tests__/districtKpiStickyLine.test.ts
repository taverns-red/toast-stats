import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #2708 (D4): the stuck KPI line's CSS contract. Geometry is measured for real
   in e2e/district-kpi-strip-mobile.smoke.ts; these guard the declarations that
   make it one opaque line of at most 64px, without CLS. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8')
const narrative = read('../components/district-narrative.css')
const code = narrative.replace(/\/\*[\s\S]*?\*\//g, '')

const block = (selector: string): string => {
  const escaped = selector.replace(/[.[\]]/g, '\\$&')
  const m = code.match(new RegExp(`\\n {2}${escaped}\\s*\\{([^}]*)\\}`))
  return m?.[1] ?? ''
}

describe('stuck KPI line CSS (#2708)', () => {
  it('is a zero-height sticky wrapper under the top bar (takes no layout, no CLS)', () => {
    const b = block('.district-kpi-stuck')
    expect(b).toMatch(/position:\s*sticky/)
    expect(b).toMatch(/top:\s*var\(--app-top-offset,\s*56px\)/)
    expect(b).toMatch(/height:\s*0/)
    expect(b).toMatch(/z-index:\s*30/)
  })

  it('clears the phone context bar below 768', () => {
    expect(code).toMatch(
      /@media\s*\(max-width:\s*767px\)\s*\{\s*\.district-kpi-stuck\s*\{[^}]*--mobile-sticky-top/
    )
  })

  it('draws one line of at most 64px', () => {
    const b = block('.district-kpi-stuck__line')
    const h = b.match(/height:\s*(\d+)px/)
    expect(h).not.toBeNull()
    expect(Number(h?.[1])).toBeLessThanOrEqual(64)
    expect(b).toMatch(/position:\s*absolute/)
    expect(b).toMatch(/flex-wrap:\s*nowrap/)
    expect(b).toMatch(/overflow:\s*hidden/)
  })

  it('is opaque: the legacy surface token, no alpha, no blur', () => {
    const b = block('.district-kpi-stuck__line')
    expect(b).toMatch(/background-color:\s*var\(--surface\)/)
    expect(b).not.toMatch(/rgba?\(/)
    expect(b).not.toMatch(/backdrop-filter/)
  })

  it('is hidden until stuck, without leaving layout', () => {
    expect(code).toMatch(
      /\.district-kpi-stuck\[data-stuck='false'\]\s*\.district-kpi-stuck__line\s*\{[^}]*visibility:\s*hidden/
    )
  })

  it('keeps values at 14px and labels at 12px or more', () => {
    const value = block('.district-kpi-stuck__item strong')
    const label = block('.district-kpi-stuck__label')
    expect(
      Number(value.match(/font-size:\s*(\d+)px/)?.[1])
    ).toBeGreaterThanOrEqual(14)
    expect(
      Number(label.match(/font-size:\s*(\d+)px/)?.[1])
    ).toBeGreaterThanOrEqual(12)
  })

  it('uses no ch units (they change when the font swaps)', () => {
    const rules = code.slice(code.indexOf('.district-kpi-stuck'))
    expect(rules).not.toMatch(/\d\s?ch\b/)
  })

  it('keeps focused elements clear of the line, and table headers below it', () => {
    expect(code).toMatch(
      /html:has\(\.district-kpi-stuck\[data-stuck='true'\]\)\s*\{[^}]*scroll-padding-top/
    )
    expect(code).toMatch(
      /\.app-shell:has\(\.district-kpi-stuck\[data-stuck='true'\]\)\s*\{[^}]*--table-sticky-top/
    )
  })

  it('no longer pins the full strip at any width', () => {
    expect(block('.district-kpi-strip')).not.toMatch(/position:\s*sticky/)
    expect(code).not.toMatch(
      /@media\s*\(min-width:\s*1024px\)\s*\{\s*\.district-kpi-strip\s*\{/
    )
  })

  it('does not blur or translucent-fill the full strip', () => {
    expect(code).not.toMatch(/\.district-kpi-strip\s*\{[^}]*backdrop-filter/)
    expect(code).not.toMatch(/\.district-kpi-strip\s*\{[^}]*rgba\(/)
  })
})
