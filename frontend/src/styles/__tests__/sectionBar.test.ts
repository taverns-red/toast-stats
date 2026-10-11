import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1832 — CSS contract for the phone bottom section bar. Geometry,
   safe-area and the page's bottom clearance are CSS-only behaviours jsdom
   cannot see; the preview smoke (e2e/section-bar.smoke.ts) measures them in
   real pixels by bounding box. These regexes pin the rules it depends on. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8')
const css = read('../components/section-bar.css')
const indexCss = read('../../index.css')

const rule = (selector: string): string => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${esc}\\s*\\{[^}]*\\}`))?.[0] ?? ''
}

describe('section-bar.css (#1832)', () => {
  it('is imported by index.css after the context bar', () => {
    const at = indexCss.indexOf("@import './styles/components/section-bar.css'")
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeGreaterThan(
      indexCss.indexOf("@import './styles/components/context-bar.css'")
    )
  })

  it('is a fixed bar on the bottom edge: 56px plus the safe-area inset', () => {
    const bar = rule('\n  .section-bar')
    expect(bar).toMatch(/position:\s*fixed/)
    expect(bar).toMatch(/bottom:\s*0/)
    expect(bar).toMatch(/left:\s*0/)
    expect(bar).toMatch(/right:\s*0/)
    expect(bar).toMatch(
      /height:\s*calc\(\s*56px\s*\+\s*env\(safe-area-inset-bottom/
    )
    expect(bar).toMatch(/padding-bottom:\s*env\(safe-area-inset-bottom/)
    expect(bar).toMatch(/box-sizing:\s*border-box/)
  })

  it('stacks above sticky page chrome (≤40) and below overlays and sheets (≥60)', () => {
    const z = Number(rule('\n  .section-bar').match(/z-index:\s*(\d+)/)?.[1])
    expect(z).toBeGreaterThan(40)
    expect(z).toBeLessThan(60)
  })

  it('reserves its height at the bottom of the page so nothing is covered', () => {
    const pad = rule('body:has(.section-bar)')
    expect(pad).toMatch(
      /padding-bottom:\s*calc\(\s*56px\s*\+\s*env\(safe-area-inset-bottom/
    )
  })

  it('items are ≥44px targets with a ≥12px label under the icon', () => {
    const link = rule('.section-bar__link')
    expect(link).toMatch(/min-height:\s*44px/)
    expect(link).toMatch(/flex-direction:\s*column/)
    const label = rule('.section-bar__label')
    const px = Number(label.match(/font-size:\s*(\d+)px/)?.[1])
    expect(px).toBeGreaterThanOrEqual(12)
  })

  it('marks the active item with a filled indicator and weight, not colour alone', () => {
    expect(css).toMatch(
      /\.section-bar__link\[aria-current='page'\][^{]*\.section-bar__icon[^{]*\{[^}]*background-color:/
    )
    expect(css).toMatch(
      /\.section-bar__link\[data-active='true'\][^{]*\.section-bar__icon/
    )
    expect(css).toMatch(
      /\.section-bar__link\[aria-current='page'\][^{]*\{[^}]*font-weight:\s*700/
    )
    // Inside the More sheet too.
    expect(css).toMatch(
      /\.section-sheet__link\[aria-current='page'\]\s*\{[^}]*font-weight:\s*700/
    )
  })

  it('sheet links are 44px rows at 16px', () => {
    const link = rule('.section-sheet__link')
    expect(link).toMatch(/min-height:\s*44px/)
    expect(link).toMatch(/font-size:\s*16px/)
  })

  it('has a visible keyboard focus ring', () => {
    expect(css).toMatch(/\.section-bar__link:focus-visible[^{]*\{[^}]*outline:/)
  })

  it('uses theme tokens only, so dark mode follows [data-theme] (R10)', () => {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(noComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(noComments).toMatch(/var\(--surface\)/)
  })
})
