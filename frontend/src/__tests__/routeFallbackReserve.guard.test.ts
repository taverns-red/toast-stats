/**
 * Lazy-route fallback reserve (#2633).
 *
 * While a route chunk loads, `<main>` holds only `PageLoadingFallback`. It used
 * `tm-container` / `tm-loading-spinner`, which exist only in `styles/brand.css`
 * (never imported in production, #13), so it was an unstyled, ~100px div: the
 * footer painted inside the viewport and was pushed off-screen when the page
 * mounted (0.11-0.20 CLS at 768px and up).
 *
 * jsdom has no layout engine (Lesson 66); the geometry is proven by
 * `e2e/route-fallback-cls.smoke.ts`. This pins the CSS and markup contract.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const appShellCss = readFileSync(
  join(__dirname, '../styles/components/app-shell.css'),
  'utf-8'
)
const printCss = readFileSync(join(__dirname, '../styles/print.css'), 'utf-8')
const appTsx = readFileSync(join(__dirname, '../App.tsx'), 'utf-8')

/** The body of the first `.app-shell__main { ... }` rule in app-shell.css. */
const mainRule =
  appShellCss.match(/\n\s*\.app-shell__main\s*\{([^}]*)\}/)?.[1] ?? ''

/** The `PageLoadingFallback` function source. */
const fallbackSrc =
  appTsx.match(/function PageLoadingFallback\(\)[\s\S]*?\n\}\n/)?.[0] ?? ''

describe('route fallback reserve (#2633)', () => {
  it('finds the rule and the component it asserts over', () => {
    expect(mainRule.length).toBeGreaterThan(0)
    expect(fallbackSrc.length).toBeGreaterThan(0)
  })

  it('reserves the area under the 56px top bar so the footer starts below the fold', () => {
    expect(mainRule).toMatch(/min-height:\s*calc\(100d?vh - 56px\)/)
  })

  it('does not reserve that height on paper', () => {
    expect(printCss).toMatch(/\.app-shell__main\s*\{[^}]*min-height:\s*0/)
  })

  it('PageLoadingFallback uses no class that only brand.css defines', () => {
    expect(fallbackSrc).not.toMatch(/tm-container|tm-loading-spinner/)
  })

  it('PageLoadingFallback keeps an accessible "Loading" label', () => {
    expect(fallbackSrc).toMatch(/aria-label="Loading/)
  })
})
