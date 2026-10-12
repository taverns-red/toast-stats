import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #339 — guards the wiring contract for Red Taverns Brand v1.0 tokens.
   Phase 1 is purely additive: copy `tokens.css` from
   taverns-red/ops:docs/brand/tokens.css verbatim, import it from
   `index.css`, and preconnect/load the three brand fonts. Phase 2
   (chrome migration: re-skinning components with --rt-* tokens) is
   blocked on the Toast Stats / Tally rename decision (ops#37) and is
   intentionally out of scope here.

   These regexes are load-bearing — they catch a future edit that
   silently drops the import or renames a brand token. */

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const tokensPath = resolve(__dirname, '../tokens/rt-brand-v1.css')
const indexCssPath = resolve(__dirname, '../../index.css')
const indexHtmlPath = resolve(__dirname, '../../../index.html')

describe('Red Taverns Brand v1.0 tokens (#339)', () => {
  it('rt-brand-v1.css declares the canonical brand color tokens', () => {
    const css = readFileSync(tokensPath, 'utf-8')
    expect(css).toMatch(/--rt-red:\s*#E63946/)
    expect(css).toMatch(/--rt-stats:\s*#D4873F/)
    expect(css).toMatch(/--rt-ink:\s*#0F0E0D/)
    expect(css).toMatch(/--rt-paper:\s*#F4F1EB/)
  })

  it('rt-brand-v1.css declares the canonical brand typography stacks', () => {
    const css = readFileSync(tokensPath, 'utf-8')
    expect(css).toMatch(/--rt-font-display:\s*'Space Grotesk'/)
    expect(css).toMatch(/--rt-font-body:\s*'Inter'/)
    expect(css).toMatch(/--rt-font-mono:\s*'JetBrains Mono'/)
  })

  it('rt-brand-v1.css carries the provenance header pointing at the canonical source', () => {
    const css = readFileSync(tokensPath, 'utf-8')
    // Copy-on-release pattern requires every product copy to point at
    // the canonical URL so drift is detectable on inspection.
    expect(css).toMatch(/taverns-red\/ops/)
    expect(css).toMatch(/Brand Tokens/)
    expect(css).toMatch(/Version:\s*1\.0/)
  })

  it('index.css imports rt-brand-v1.css before component layers', () => {
    const css = readFileSync(indexCssPath, 'utf-8')
    expect(css).toMatch(
      /@import\s+['"]\.\/styles\/tokens\/rt-brand-v1\.css['"]/
    )
  })

  // #1905: the brand fonts are self-hosted (web-fonts.css) instead of loaded
  // from fonts.googleapis.com — same families, same weights, same origin.
  const webFontsPath = resolve(__dirname, '../tokens/web-fonts.css')
  const readWebFonts = () =>
    existsSync(webFontsPath) ? readFileSync(webFontsPath, 'utf-8') : ''

  it('declares two of the three brand v1.0 display/body fonts (JetBrains Mono deferred — see Lesson 81)', () => {
    const css = readWebFonts()
    expect(css).toMatch(/font-family:\s*'Space Grotesk'/)
    expect(css).toMatch(/font-family:\s*'Inter'/)
    // JetBrains Mono is intentionally NOT loaded in Phase 1. Live
    // `var(--mono)` consumers in app-shell.css would layout-shift on the
    // font swap (Lighthouse CLS 0.199 vs threshold 0.1, PR #595 first
    // push). See the redesign-tokens font-loading test for the matching
    // deferral assertion, and Lesson 81 for the spec-vs-CLS reasoning.
    expect(css).not.toMatch(/JetBrains Mono/)
    const html = readFileSync(indexHtmlPath, 'utf-8')
    expect(html).not.toMatch(/family=JetBrains\+Mono/)
  })

  it('index.html no longer connects to Google Fonts hosts (#1905: self-hosted)', () => {
    const html = readFileSync(indexHtmlPath, 'utf-8')
    expect(html).not.toMatch(/fonts\.googleapis\.com/)
    expect(html).not.toMatch(/fonts\.gstatic\.com/)
  })
})
