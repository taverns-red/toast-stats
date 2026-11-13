/**
 * One heading ramp (#2650): page 28/800, section 18/700, sub-section 16/700,
 * card title 14/700. Source scans, because jsdom has no layout engine
 * (lesson 075). The routed-page order and inversion check is the Playwright
 * smoke e2e/heading-order.smoke.ts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../..')
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8')

const tokens = read('styles/tokens/typography.css')

describe('heading ramp tokens', () => {
  it.each([
    ['--heading-page-size', '28px'],
    ['--heading-page-weight', '800'],
    ['--heading-section-size', '18px'],
    ['--heading-section-weight', '700'],
    ['--heading-sub-size', '16px'],
    ['--heading-sub-weight', '700'],
    ['--heading-card-size', '14px'],
    ['--heading-card-weight', '700'],
  ])('%s is %s', (name, value) => {
    expect(tokens).toMatch(new RegExp(`${name}:\\s*${value}\\s*;`))
  })

  it('defines the four role classes from the tokens', () => {
    const css = read('styles/components/typography.css')
    for (const role of ['page', 'section', 'sub', 'card'])
      expect(css).toMatch(
        new RegExp(
          `\\.heading-${role}\\s*\\{[^}]*font-size:\\s*var\\(--heading-${role}-size\\)`
        )
      )
  })
})

describe('heading rules use the ramp, not literal sizes', () => {
  const FAMILIES: [string, string][] = [
    ['styles/components/education.css', '.education-page__title'],
    ['styles/components/education.css', '.education-section__title'],
    ['components/rollups/rollups.css', '.rollup-section__title'],
    ['components/map/districtMap.css', '.map-panel__heading'],
    ['styles/components/district-hub.css', '.district-hub__block-title'],
    ['styles/components/action-list.css', '.action-list-page__title'],
    ['styles/components/action-list.css', '.action-list-section__heading'],
    ['styles/components/app-shell.css', '.placeholder-page__title'],
    ['styles/components/app-shell.css', '.error-page__heading'],
    ['styles/components/app-shell.css', '.awards-page-card__title'],
    ['styles/components/app-shell.css', '.rule-change-year__title'],
    ['styles/components/club-history.css', '.club-history-page__title'],
    ['styles/components/council-pack.css', '.council-pack__title'],
    ['styles/components/council-pack.css', '.council-pack__section h2'],
    ['styles/components/council.css', '.council-group__heading'],
    ['styles/components/council.css', '.council-division__heading'],
  ]

  it.each(FAMILIES)('%s %s sizes itself with a heading token', (file, sel) => {
    const css = read(file)
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
    expect(m, `${sel} rule`).not.toBeNull()
    expect(m![1]).toMatch(/font-size:\s*var\(--heading-/)
  })
})
