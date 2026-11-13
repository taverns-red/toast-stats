/**
 * #2644 — the InfoTooltip trigger must not make its line taller.
 *
 * styles/layers/base.css floors every <button> at 44px, so a 14px icon used to
 * inflate a 17px KPI label to 49px (and the Awards Race heading to 50px). The
 * trigger now opts out of that floor and keeps its 44px hit area as an
 * invisible ::after that overflows the line box. jsdom has no layout, so this
 * reads the CSS the browser would use; the PR preview smoke measures it live.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const srcDir = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(srcDir, p), 'utf8')

/** The declaration block of the first rule whose selector is exactly `sel`. */
function ruleBody(css: string, sel: string): string | null {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
  const m = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  return m ? m[1]! : null
}

describe('InfoTooltip trigger does not inflate its line (#2644)', () => {
  const css = read('styles/components/tooltip.css')

  it('drops the 44px button floor on the trigger itself', () => {
    const body = ruleBody(css, '.info-tooltip__trigger')
    expect(body, '.info-tooltip__trigger rule missing').not.toBeNull()
    expect(body).toMatch(/min-height:\s*0/)
    expect(body).toMatch(/min-width:\s*0/)
  })

  it('keeps a 44px hit area outside the line box via ::after', () => {
    const body = ruleBody(css, '.info-tooltip__trigger::after')
    expect(body, '::after hit area missing').not.toBeNull()
    expect(body).toMatch(/position:\s*absolute/)
    expect(body).toMatch(/inset:\s*-15px/)
  })

  it('the component uses that class and the panel text is at least 14px', () => {
    const src = read('components/InfoTooltip.tsx')
    expect(src).toContain('info-tooltip__trigger')
    expect(src).toMatch(/text-sm/)
    expect(src).not.toMatch(/\btext-xs\b/)
  })

  it('has no .tooltip-reserve workaround left to maintain', () => {
    const shell = read('styles/components/app-shell.css')
    expect(shell).not.toMatch(/\.tooltip-reserve\s*\{/)
  })

  // Review: --line is ~1.3:1 on the dark surfaces, so the panel edge was
  // invisible. Any existing token will do, but it must reach 3:1 (WCAG 1.4.11)
  // against both the dark panel (--bg) and the dark card (--surface).
  it('draws the panel edge with a token that clears 3:1 in dark mode', () => {
    const body = ruleBody(css, '.tooltip-panel--bordered')
    expect(body, '.tooltip-panel--bordered rule missing').not.toBeNull()
    const token = /border:\s*1px solid var\((--[\w-]+)\)/.exec(body!)?.[1]
    expect(token, 'border must use a var(--token)').toBeDefined()
    expect(token).not.toBe('--line')

    const redesign = read('styles/tokens/redesign.css')
    const dark = redesign.slice(redesign.indexOf("[data-theme='dark'] {"))
    const hex = (name: string) =>
      new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(dark)?.[1]
    const edge = hex(token!)
    expect(edge, `${token} must be a hex token in the dark block`).toBeDefined()
    for (const against of ['--bg', '--surface']) {
      expect(
        contrast(edge!, hex(against)!),
        `${token} on ${against}`
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('the rankings methodology tooltip reads "Paid Clubs = clubs"', () => {
    const page = read('pages/DistrictsPage.tsx')
    expect(page).toContain('text="Paid Clubs = clubs that have met')
  })

  // Review: the ::after hit-area allowance in the touch gates must not let any
  // decorative ::after count as tappable.
  it('the touch gates only credit the ::after of an info-tooltip trigger', () => {
    const helper = readFileSync(
      resolve(srcDir, '../e2e/helpers/mobile-measure.ts'),
      'utf8'
    )
    const smoke = readFileSync(
      resolve(srcDir, '../e2e/tooltip-viewport-clip.smoke.ts'),
      'utf8'
    )
    for (const src of [helper, smoke]) {
      expect(src).toMatch(/matches\('\.info-tooltip__trigger'\)/)
      expect(src).toMatch(/elementFromPoint/)
    }
  })
})

function luminance(h: string): number {
  const c = [1, 3, 5].map(i => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
