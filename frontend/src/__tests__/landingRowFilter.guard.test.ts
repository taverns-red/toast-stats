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

/* Landing H1 at tablet widths (#2249, preview smoke
   landing-header-tablet.smoke.ts): measured on the preview, the intro column
   is 394px at 1024 (the actions share the row) while "Find a district, club
   or region" needs 419px at 28px, so it wrapped. At 25px (374px) the Linux
   Chromium smoke still wrapped: its classic ~15px scrollbar narrows the
   column to ~379px and rasterisation eats the rest; 23px (~344px) leaves
   ~35px of slack. Landing-only (.districts-page-root), 900–1099px. */
describe('landing H1 fits beside the actions at 1024 (#2249)', () => {
  it('sizes the landing title down in the 900–1099px band', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*900px\)\s*and\s*\(max-width:\s*1099px\)\s*\{[^}]*\.districts-page-root\s+\.districts-page-header__title\s*\{[^}]*font-size:\s*23px/
    )
  })
})

/* Phone type floor (#1840) for the new landing sections (#2249): the preview
   smoke (type-floor.smoke.ts) found 11px uppercase labels at 375 — the Red
   Vote eyebrow and the World pulse table headers; the my-district eyebrow is
   the same size. Uppercase eyebrows/labels are 12px on phones, in ONE place
   (mobile-type-floor.css rule 3, R10), not per component sheet. */
describe('new landing eyebrows are 14px on phones, not 12 (#2249, 375 ratchet)', () => {
  const floor = readFileSync(
    resolve(here, '../styles/mobile-type-floor.css'),
    'utf8'
  )
  const rule3 = /\.uppercase:is\([^{]*\{\s*font-size:\s*12px/.exec(floor)
  // The landing's 375 ratchet is 5% of characters under 14px (the site cap
  // is 15%); at 12px these three put it at 8.3%, so on the landing they
  // take the 14px floor and leave rule 3 to the pre-existing chrome.
  it('keeps the Red Vote eyebrow, the pulse table head and the my-district eyebrow OUT of the 12px rule', () => {
    expect(rule3, 'rule 3 not found').not.toBeNull()
    for (const sel of [
      '.red-vote-block__eyebrow',
      '.world-pulse__table thead th',
      '.my-district-card__eyebrow',
    ]) {
      expect(rule3![0], sel).not.toContain(sel)
    }
  })
  it('no longer names the retired orientation paragraph', () => {
    expect(floor).not.toMatch(
      /districts-page-header__orientation|districts-orientation__count/
    )
  })
})

/* Phone type floor, share (#1840): type-floor.smoke.ts measured 22.3% of the
   landing's visible characters under 14px at 375 (max 15%) after #2249 —
   the Red Vote fine print, the pulse tile labels and captions, the KPI
   sub-line and the my-district movement line. Captions and data are 14px
   on phones (rule 4); only uppercase eyebrows stay at 12px. */
describe('new landing captions join the 14px phone floor (#2249)', () => {
  const floor = readFileSync(
    resolve(here, '../styles/mobile-type-floor.css'),
    'utf8'
  )
  it.each([
    '.red-vote-block__fine',
    '.world-pulse__tile-label',
    '.world-pulse__caption',
    '.districts-kpi-card__sub',
    '.my-district-card__move',
    '.red-vote-block__eyebrow',
    '.world-pulse__table thead th',
    '.my-district-card__eyebrow',
  ])('sets %s to 14px below 768', sel => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    expect(floor).toMatch(new RegExp(`${esc}[^{]*\\{[^}]*font-size:\\s*14px`))
  })
})
