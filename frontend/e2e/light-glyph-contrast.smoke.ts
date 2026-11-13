import { test, expect, type Page } from './fixtures/test'

/* Light-mode non-text contrast for glyphs, icons, input borders and
 * placeholders (#2643), measured from computed colours in the browser.
 *
 * The 2026-11-12 UX review found grey-300/400 glyphs (1.47-2.54:1), input
 * borders on --line (1.15-1.24:1) and --ink-4 placeholders (3.29-3.44:1).
 * Icons and input borders need 3:1 (WCAG 1.4.11); placeholder text needs
 * 4.5:1 (1.4.3). Dark already passes, so this runs light only at 1280.
 *
 * `LightModeGlyphContrast.test.ts` pins the source; this proves what the
 * cascade actually paints. */

interface Sample {
  what: string
  ratio: number
  need: number
}

async function measure(page: Page, path: string, ready: string) {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'light')
    } catch {
      /* storage blocked: colorScheme still drives the theme */
    }
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
}

/** Contrast of a computed foreground property against the opaque ancestor
 *  background, for the first element matching each [what, selector, prop]. */
async function samples(
  page: Page,
  probes: { what: string; selector: string; prop: string; need: number }[]
): Promise<Sample[]> {
  return page.evaluate(ps => {
    type C = { r: number; g: number; b: number; a: number }
    const parse = (c: string): C | null => {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1]!
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map(parseFloat)
      return { r: p[0]!, g: p[1]!, b: p[2]!, a: p.length > 3 ? p[3]! : 1 }
    }
    const lum = ({ r, g, b }: C) => {
      const f = (v: number) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const bgOf = (el: Element | null): C => {
      for (let p = el; p; p = p.parentElement) {
        const c = parse(getComputedStyle(p).backgroundColor)
        if (c && c.a > 0.9) return c
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    }
    // The page behind a control, not the control's own fill, for borders.
    const behind = (el: Element): C => bgOf(el.parentElement)
    const out: { what: string; ratio: number; need: number }[] = []
    for (const p of ps) {
      const el = document.querySelector(p.selector)
      if (!el) {
        out.push({ what: `${p.what} (missing)`, ratio: 0, need: p.need })
        continue
      }
      const isPlaceholder = p.prop === 'placeholder'
      const cs = isPlaceholder
        ? getComputedStyle(el, '::placeholder')
        : getComputedStyle(el)
      const raw = isPlaceholder
        ? cs.color
        : (cs as unknown as Record<string, string>)[p.prop]!
      const fg = parse(raw)
      if (!fg) continue
      const bg = p.prop === 'borderTopColor' ? behind(el) : bgOf(el)
      const ratio =
        (Math.max(lum(fg), lum(bg)) + 0.05) /
        (Math.min(lum(fg), lum(bg)) + 0.05)
      out.push({
        what: p.what,
        ratio: Math.round(ratio * 100) / 100,
        need: p.need,
      })
    }
    return out
  }, probes)
}

test('Landing glyphs, icons, borders and placeholders meet contrast (light, 1280)', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await measure(page, '/', '.landing-search__input')
  await page
    .locator('button[aria-label^="Set District"]')
    .first()
    .waitFor({ timeout: 30_000 })
  const got = await samples(page, [
    {
      what: 'hero search border',
      selector: '.landing-search__input',
      prop: 'borderTopColor',
      need: 3,
    },
    {
      what: 'hero search placeholder',
      selector: '.landing-search__input',
      prop: 'placeholder',
      need: 4.5,
    },
    {
      what: 'rankings filter border',
      selector:
        '.districts-toolbar__row--filter .districts-toolbar__search-input',
      prop: 'borderTopColor',
      need: 3,
    },
    {
      what: 'rankings filter placeholder',
      selector:
        '.districts-toolbar__row--filter .districts-toolbar__search-input',
      prop: 'placeholder',
      need: 4.5,
    },
    {
      what: 'header search placeholder',
      selector: '.header-search__input',
      prop: 'placeholder',
      need: 4.5,
    },
    {
      what: 'info tooltip icon',
      selector: '.info-tooltip__trigger',
      prop: 'color',
      need: 3,
    },
    {
      what: 'set-as-my-district star',
      selector: 'button[aria-label^="Set District"]',
      prop: 'color',
      need: 3,
    },
  ])
  const bad = got.filter(s => s.ratio < s.need)
  expect(
    bad,
    bad.map(s => `${s.what} ${s.ratio}:1 < ${s.need}:1`).join('; ')
  ).toEqual([])
})

test('Breadcrumb separators are hidden from assistive tech and legible (light, 1280)', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await measure(
    page,
    '/district/61/division/A',
    '[data-testid="subpage-breadcrumb"]'
  )
  const crumb = page.locator('[data-testid="subpage-breadcrumb"]')
  const seps = crumb.locator('li > span:not([aria-current])')
  expect(await seps.count()).toBeGreaterThan(0)
  for (const sep of await seps.all()) {
    await expect(sep).toHaveAttribute('aria-hidden', 'true')
  }
  const got = await samples(page, [
    {
      what: 'breadcrumb separator',
      selector:
        '[data-testid="subpage-breadcrumb"] li > span[aria-hidden="true"]',
      prop: 'color',
      need: 3,
    },
  ])
  const bad = got.filter(s => s.ratio < s.need)
  expect(
    bad,
    bad.map(s => `${s.what} ${s.ratio}:1 < ${s.need}:1`).join('; ')
  ).toEqual([])
})
