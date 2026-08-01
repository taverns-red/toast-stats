/**
 * Divider dark-mode parity audit (#1370).
 *
 * In dark mode the divider under the FIRST row of any `divide-y` table
 * rendered bright near-white while every later divider was correctly subtle.
 * Cause: the overrides in dark-mode.css matched `> * + *` (adjacent sibling),
 * which excludes the first child — but Tailwind v4's divider utility paints a
 * border on `> :not(:last-child)`, i.e. INCLUDING the first child. Measured
 * live on /district/61/divisions: row 0 was `rgb(229, 231, 235)` (light
 * gray-200) while rows 1-2 were `rgba(255, 255, 255, 0.06)`.
 *
 * An audit that merely asserts "a divider is dark in dark mode" passes on the
 * buggy CSS and proves nothing — the defect is specifically the first child.
 * So this audit compares SETS OF CHILDREN, not colours:
 *
 *   painted    = the children Tailwind's divider utility gives a border to
 *   overridden = the children the dark-mode.css override recolours
 *   assertion  = painted ⊆ overridden   (with index 0 called out by name)
 *
 * Both sides are derived, never hardcoded:
 *   - `painted` comes from compiling the real `tailwindcss` package in-process
 *     (~10ms) and reading the emitted selector. Hardcoding "border-bottom on
 *     :not(:last-child)" is exactly the assumption that broke here, and it
 *     changed between Tailwind v3 and v4.
 *   - `overridden` comes from running dark-mode.css's own selector through
 *     jsdom's selector engine (`querySelectorAll`), not a regex. `> * + *` and
 *     `> *` look equivalent until a real matcher tells you otherwise.
 *
 * Because the comparison is over children rather than border edges, it stays
 * correct whether the utility paints `border-top` or `border-bottom`.
 *
 * Falsifiable: the `__falsifiability__` block replays the old `> * + *`
 * selector through the same checker and asserts it is reported as leaving
 * child 0 unprotected — proving the audit can go red for the defect it guards
 * (lesson 107).
 *
 * Lives in `__tests__/accessibility/` → integration project (lesson 090). No
 * page mount (R22); pure CSS + selector computation, so it's fast.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { compile } from 'tailwindcss'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')
const srcDir = resolve(here, '../..')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const darkModeCss = stripComments(
  readFileSync(resolve(stylesDir, 'dark-mode.css'), 'utf8')
)

/** The divider colour utilities used in markup that need a dark override. */
const DIVIDE_COLOR_CLASSES = ['divide-gray-100', 'divide-gray-200'] as const

/** Flat `selector { decls }` pairs. Nested at-rules (`@media`, `@layer`) are
 *  skipped rather than mis-parsed: the inner rule still matches on its own. */
function cssRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim()
    if (selector.startsWith('@')) continue
    rules.push({ selector, body: m[2] })
  }
  return rules
}

/** Ask the real Tailwind which children its divider utilities decorate.
 *  The token VALUES are irrelevant here — only the emitted selector shape is
 *  under test — but the colour utilities don't generate without them. */
let paintSelector = ''
const tailwindColorSelectors = new Map<string, string>()

beforeAll(async () => {
  const compiled = await compile(
    `@theme {
       --color-gray-100: #f3f4f6;
       --color-gray-200: #e5e7eb;
       --color-gray-800: #1f2937;
     }
     @tailwind utilities;`,
    { base: srcDir }
  )
  const generated = compiled.build([
    'divide-y',
    'divide-gray-800',
    ...DIVIDE_COLOR_CLASSES,
  ])

  for (const { selector, body } of cssRules(generated)) {
    if (selector.includes('.divide-y') && /border-[a-z]+-width\s*:/.test(body))
      paintSelector = selector
    for (const cls of [...DIVIDE_COLOR_CLASSES, 'divide-gray-800'])
      if (selector.includes(`.${cls}`) && /border-color\s*:/.test(body))
        tailwindColorSelectors.set(cls, selector)
  }
})

/** Build `<div data-theme="dark"><ul class="divide-y {cls}">…4 children…</ul>`
 *  and return the 0-based indices of the children matching `selector`. */
function matchedChildIndices(cls: string, selector: string): number[] {
  const host = document.createElement('div')
  host.setAttribute('data-theme', 'dark')
  const list = document.createElement('ul')
  list.className = `divide-y ${cls}`
  for (let i = 0; i < 4; i++) list.appendChild(document.createElement('li'))
  host.appendChild(list)
  document.body.appendChild(host)
  try {
    const children = Array.from(list.children)
    const matched = new Set(Array.from(host.querySelectorAll(selector)))
    return children.flatMap((c, i) => (matched.has(c) ? [i] : []))
  } finally {
    host.remove()
  }
}

/** The dark-mode.css rules that recolour a divider, keyed by utility class. */
function darkOverrideSelectors(css: string): Map<string, string[]> {
  const byClass = new Map<string, string[]>()
  for (const { selector, body } of cssRules(css)) {
    const cls = selector.match(/\.divide-gray-\d+/)?.[0]?.slice(1)
    if (!cls || !/border-color\s*:/.test(body)) continue
    byClass.set(cls, [...(byClass.get(cls) ?? []), selector])
  }
  return byClass
}

const overrides = darkOverrideSelectors(darkModeCss)

describe('divide-y dark-mode divider parity (#1370)', () => {
  it('resolves the divider-painting selector from the real Tailwind', () => {
    expect(paintSelector, 'no .divide-y border-width rule emitted').not.toBe('')
    // Sanity: the utility decorates more than one child, and specifically the
    // first — otherwise the whole premise of this audit is wrong.
    const painted = matchedChildIndices('divide-gray-200', paintSelector)
    expect(painted.length).toBeGreaterThan(1)
    expect(painted).toContain(0)

    // Tailwind colours exactly the children it paints — so "the set of painted
    // children" is the right yardstick for the dark override too.
    for (const [cls, selector] of tailwindColorSelectors)
      expect(matchedChildIndices(cls, selector), cls).toEqual(
        matchedChildIndices(cls, paintSelector)
      )
  })

  it.each(DIVIDE_COLOR_CLASSES)(
    '%s: the dark override recolours every child the utility paints',
    cls => {
      const selectors = overrides.get(cls)
      expect(selectors, `no dark override found for .${cls}`).toBeDefined()

      const painted = matchedChildIndices(cls, paintSelector)
      const overridden = new Set(
        selectors!.flatMap(s => matchedChildIndices(cls, s))
      )
      const unprotected = painted.filter(i => !overridden.has(i))

      expect(
        unprotected,
        `.${cls}: child index ${unprotected.join(', ')} gets a divider from ` +
          `\`${paintSelector}\` but is not matched by the dark override ` +
          `\`${selectors!.join(' , ')}\` — it keeps Tailwind's light border ` +
          `colour against a dark surface.`
      ).toEqual([])
    }
  )

  it.each(DIVIDE_COLOR_CLASSES)(
    '%s: the override stays scoped to dark mode, so light mode is unchanged',
    cls => {
      for (const selector of overrides.get(cls) ?? [])
        expect(
          selector.startsWith("[data-theme='dark']"),
          `${selector} must be scoped under [data-theme='dark']`
        ).toBe(true)
    }
  )

  // divide-gray-800 deliberately has NO dark override: every usage in markup
  // is behind the `theme-dark:` variant, so the class only ever applies in
  // dark mode and is already a dark colour. Overriding it would be a no-op at
  // best. This pins that premise — a bare (unprefixed) usage would make the
  // missing override a real bug.
  it('divide-gray-800 is only ever applied via the theme-dark: variant', () => {
    const sources = readdirSync(srcDir, {
      recursive: true,
      encoding: 'utf8',
    }).filter(f => /\.tsx?$/.test(f) && !f.includes('__tests__'))

    const bare: string[] = []
    for (const rel of sources) {
      const text = readFileSync(resolve(srcDir, rel), 'utf8')
      for (const m of text.matchAll(/([\w-]*:)?divide-gray-800/g))
        if (m[1] !== 'theme-dark:') bare.push(`${rel}: ${m[0]}`)
    }

    expect(
      bare,
      'a bare `divide-gray-800` applies in LIGHT mode too, which would make ' +
        'the deliberately-absent dark override a real gap — see the comment ' +
        'in dark-mode.css.'
    ).toEqual([])
    expect(overrides.has('divide-gray-800')).toBe(false)
  })

  it('__falsifiability__ the old `> * + *` selector is reported as buggy', () => {
    const buggy = "[data-theme='dark'] .divide-gray-200 > * + *"
    const painted = matchedChildIndices('divide-gray-200', paintSelector)
    const overridden = new Set(matchedChildIndices('divide-gray-200', buggy))
    const unprotected = painted.filter(i => !overridden.has(i))
    expect(
      unprotected,
      'the adjacent-sibling selector must be detected as skipping child 0'
    ).toEqual([0])
  })
})
