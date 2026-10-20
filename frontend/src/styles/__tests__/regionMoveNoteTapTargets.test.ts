import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1821 — the moved-region banner's "Open Region N for YY-YY" links must be
   a 44px tap target on every touch viewport. A phone in landscape (844×390)
   is wider than the 479px phone breakpoint, so a width-only query left the
   links at 24px there (preview smoke, e2e/touch-targets.smoke.ts). The floor
   follows the input, as #2017 did for the header search and footer: a coarse
   pointer gets 44px at any width, and a mouse keeps the compact 24px row.
   jsdom cannot compute cascade-layer styles, so this pins the rule; the
   touch-targets smoke measures the result. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(__dirname, '../components/region-history.css'),
  'utf-8'
)

/** The declaration block of `selector` inside the first matching @media. */
const ruleInMedia = (media: RegExp, selector: RegExp): string => {
  const m = css.match(
    new RegExp(
      `@media\\s*([^{]*)\\{\\s*([^{}]*${selector.source}[^{}]*)\\{([^}]*)\\}`
    )
  )
  if (!m || !media.test(m[1] ?? '')) return ''
  return m[3] ?? ''
}

describe('region move note link tap targets (#1821)', () => {
  it('gives the links a 44px target under a coarse pointer at any width', () => {
    const body = ruleInMedia(
      /\(pointer:\s*coarse\)/,
      /\.region-move-note__link(?![\w:-])/
    )
    expect(body).toMatch(/min-height:\s*44px/)
  })

  it('keeps the 44px floor on narrow phones', () => {
    const body = ruleInMedia(
      /\(max-width:\s*479px\)/,
      /\.region-move-note__link(?![\w:-])/
    )
    expect(body).toMatch(/min-height:\s*44px/)
  })
})
