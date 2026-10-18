import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1852 option C — the club hero's first paint must not pull in a web font
   that nothing else on that paint uses. Lighthouse's Lantern charges every
   request that finishes before the LCP paint. On the mobile gate the
   where-it-meets line was the hero's only Inter text, so its 48 KB woff2
   landed in the same frame as the h1 in about half the runs and added
   ~300 ms of simulated LCP. The line now uses the hero's own body font
   (--sans, Source Sans 3, which the sub-line already loads and which has a
   metric-matched fallback, so the swap does not move layout). */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(__dirname, '../components/app-shell.css'),
  'utf-8'
)

/** A literal string as a RegExp source (every metacharacter escaped). */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every rule body whose selector list starts with `selector`. */
const rulesFor = (selector: string): string[] =>
  Array.from(
    css.matchAll(
      new RegExp(
        `(?:^|\\n)\\s*${escapeRe(selector)}(?![\\w-])[^{]*\\{([^}]*)\\}`,
        'g'
      )
    ),
    m => m[1] ?? ''
  )

describe('club hero fonts (#1852)', () => {
  const heroSelectors = [
    '.club-hero',
    '.club-hero__eyebrow',
    '.club-hero__title',
    '.club-hero__sub',
    '.club-meets',
  ]

  it('the where-it-meets line uses the hero body font', () => {
    const rules = rulesFor('.club-meets')
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.join('\n')).toMatch(/font-family:\s*var\(--sans\)/)
  })

  it.each(heroSelectors)(
    '%s does not use the Phase-2 brand fonts (Inter / Space Grotesk)',
    selector => {
      for (const body of rulesFor(selector)) {
        expect(body).not.toMatch(/--rt-font-(body|display)/)
      }
    }
  )
})
