import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #2655 — club page layout contracts that need no browser. The browser-level
   proof (panel gaps, hero place, timeline wrap, history name) is
   e2e/club-panel-layout.smoke.ts. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(__dirname, '../components/app-shell.css'),
  'utf-8'
)

/** A literal string as a RegExp source (every metacharacter escaped). */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const rulesFor = (selector: string): string[] =>
  Array.from(
    css.matchAll(
      new RegExp(`(?:^|\\n)\\s*${escapeRe(selector)}\\s*\\{([^}]*)\\}`, 'g')
    ),
    m => m[1] ?? ''
  )

describe('club hero lineage rule (#2655 UNIT-44)', () => {
  it('draws its left rule in white, visible on the loyal-blue hero in both themes', () => {
    const body = rulesFor('.club-hero__lineage').join('\n')
    expect(body).toMatch(/border-left:\s*2px solid rgba\(255, 255, 255/)
    expect(body).not.toMatch(/--tm-loyal-blue/)
  })
})

describe('goal timeline dates (#2655 UNIT-34)', () => {
  it('keeps each date on one line', () => {
    const body = rulesFor('.timeline-row .date').join('\n')
    expect(body).toMatch(/white-space:\s*nowrap/)
  })

  it('sizes the date column to its content at every width', () => {
    const grids = rulesFor('.timeline-row').join('\n')
    expect(grids).toMatch(/grid-template-columns:\s*max-content/)
  })
})

describe('club panel stack (#2655 UNIT-12)', () => {
  it('spaces the panels that closed the page with the 16px token', () => {
    const body = rulesFor('.club-dcp-goals').join('\n')
    expect(body).toMatch(/margin-bottom:\s*var\(--rt-space-4\)/)
  })
})
