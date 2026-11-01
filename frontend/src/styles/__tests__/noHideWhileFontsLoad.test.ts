/**
 * The document must paint while web fonts load (#2444).
 *
 * A legacy `.fonts-loading { visibility: hidden }` rule hid the whole page
 * from first paint until `document.fonts.ready`, which undid `font-display:
 * swap`. On prod at 412 px under applied mobile throttling, first-paint came
 * at 1588 ms but first-contentful-paint only at 2692 ms, 47 ms after
 * `fonts.ready`. The Lighthouse mobile gate then charged every request that
 * finished in that gap (the CDN connection, the first data files, both
 * woff2) to LCP. Montserrat and Source Sans 3 have metric-matched fallbacks
 * (font-fallbacks.css, #1373), so the swap needs no cover.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const typography = readFileSync(
  resolve(here, '../tokens/typography.css'),
  'utf8'
)

/** Declarations of every rule whose selector names a fonts-loading state. */
function fontStateRules(css: string): string[] {
  const rules: string[] = []
  const re = /([^{}]+)\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    if (/\.fonts-load(ing|ed)/.test(m[1]!)) rules.push(m[2]!)
  }
  return rules
}

describe('no hiding the page while web fonts load (#2444)', () => {
  it('typography.css has no visibility rule on a fonts-loading state', () => {
    for (const body of fontStateRules(typography)) {
      expect(body).not.toMatch(/visibility\s*:/)
    }
  })
})
