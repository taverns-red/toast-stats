import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* A `ch` width is the current font's "0", and the Arial fallback's "0" is
   wider than Source Sans 3's: 60ch is 438.8px before the swap, 417.5px after.
   Text measured in ch re-wraps at the swap and moves what follows it (#2685,
   #2922). So these measures are N x 0.497em, Source Sans 3's "0" at 400.
   The live check is the font-swap test in district-subpages-cls.smoke.ts. */

const SOURCE_SANS_3_ZERO_EM = 0.497
const TOLERANCE_EM = 0.05

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (file: string) =>
  readFileSync(resolve(__dirname, '../components', file), 'utf-8')

const MEASURES = [
  { file: 'council.css', selector: '.council-note', chars: 70 },
  {
    file: 'action-list.css',
    selector: '.action-list-page__subtitle',
    chars: 60,
  },
  { file: 'clubs-race.css', selector: '.race-basis p', chars: 70 },
] as const

/* app-shell.css still has older ch measures elsewhere, so only these rules
   are held to em here. */
const RULE_MEASURES = [
  { file: 'training.css', selector: '.training-page__subtitle', chars: 70 },
  { file: 'training.css', selector: '.training-context', chars: 75 },
  { file: 'training.css', selector: '.training-note', chars: 75 },
  { file: 'growth.css', selector: '.growth-page__subtitle', chars: 65 },
  { file: 'growth.css', selector: '.growth-stage__note', chars: 70 },
  {
    file: 'education.css',
    selector: '.education-note',
    chars: 70,
  },
  { file: 'education.css', selector: '.education-page__subtitle', chars: 65 },
  {
    file: 'meetings.css',
    selector: '.meetings-note',
    chars: 70,
  },
  {
    file: 'survival.css',
    selector: '.survival-note',
    chars: 70,
  },
  {
    file: 'worldwide-scoreboard.css',
    selector: '.wws__methodology',
    chars: 70,
  },
  {
    file: 'worldwide-scoreboard.css',
    selector: '.wws__group-note',
    chars: 68,
  },
  { file: 'app-shell.css', selector: '.long-text-lede', chars: 60 },
  {
    file: 'app-shell.css',
    selector: '.districts-page-header__lede',
    chars: 60,
  },
  {
    file: 'app-shell.css',
    selector: '.districts-page-header__orientation',
    chars: 70,
  },
  { file: 'app-shell.css', selector: '.placeholder-page__body', chars: 70 },
  { file: 'app-shell.css', selector: '.methodology-section', chars: 70 },
  {
    file: 'club-history.css',
    selector: '.club-history-page__sub',
    chars: 52,
  },
] as const

const ruleOf = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`)
  expect(start, `no ${selector} rule`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe.each(RULE_MEASURES)(
  '$file $selector does not depend on the loaded font',
  ({ file, selector, chars }) => {
    const rule = ruleOf(read(file), selector)

    it('uses no ch unit', () => {
      expect(rule.match(/[\d.]+ch\b/g)).toBeNull()
    })

    it(`keeps the ${chars}-character measure of Source Sans 3, in em`, () => {
      const em = Number(rule.match(/max-width:\s*([\d.]+)em/)?.[1])
      expect(Math.abs(em - chars * SOURCE_SANS_3_ZERO_EM)).toBeLessThanOrEqual(
        TOLERANCE_EM
      )
    })
  }
)

describe.each(MEASURES)(
  '$file widths do not depend on the loaded font',
  ({ file, selector, chars }) => {
    const css = read(file)

    it('uses no ch unit, which is the width of the current font’s "0"', () => {
      expect(css.match(/[\d.]+ch\b/g)).toBeNull()
    })

    it(`keeps ${selector} at the ${chars}-character measure of Source Sans 3, in em`, () => {
      const start = css.indexOf(`${selector} {`)
      expect(start, `no ${selector} rule`).toBeGreaterThanOrEqual(0)
      const rule = css.slice(start, css.indexOf('}', start))
      const em = Number(rule.match(/max-width:\s*([\d.]+)em/)?.[1])
      expect(Math.abs(em - chars * SOURCE_SANS_3_ZERO_EM)).toBeLessThanOrEqual(
        TOLERANCE_EM
      )
    })
  }
)
