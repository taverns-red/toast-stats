/**
 * Landing row filter (#2249, review B2): the "Filter districts" input is a
 * touch target and must be ≥ 44px tall (WCAG 2.5.5; the preview tripwire
 * `touch-targets.smoke.ts` measured 42px). jsdom has no layout (Lesson
 * 66), so this pins the CSS contract; the smoke proves the geometry live.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(here, '../styles/components/landing-search.css'),
  'utf8'
)

describe('landing row filter touch target (#2249 B2)', () => {
  it('floors the filter input at 44px', () => {
    expect(css).toMatch(
      /\.districts-toolbar__row--filter\s+\.districts-toolbar__search-input\s*\{[^}]*min-height:\s*44px/
    )
  })
})
