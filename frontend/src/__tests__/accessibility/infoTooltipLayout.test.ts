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
})
