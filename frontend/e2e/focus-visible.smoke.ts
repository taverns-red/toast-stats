import { test, expect, type Locator, type Page } from './fixtures/test'

/* Keyboard focus is visible (WCAG 2.4.7 / 1.4.11), measured from what the
 * cascade paints: the ring (outline, or the widest box-shadow for Tailwind
 * rings) is at least 2px and clears 3:1 against the background behind it,
 * every stop of a gradient included. OutlineRemovalSweep.test.ts pins the
 * source; this proves the rendered result. */

type Theme = 'light' | 'dark'

/** Tabbing through the header focuses its search box, which fetches the club
 *  and division indexes. They have no recorded CDN fixture (#2545), and these
 *  tests never search, so empty indexes keep the fetch off the network. */
async function stubSearchIndexes(page: Page): Promise<void> {
  await page.route('**/config/club-index.json', route =>
    route.fulfill({ json: { clubs: {} } })
  )
  await page.route('**/config/divisions-areas-index.json', route =>
    route.fulfill({
      json: {
        generatedAt: '2026-11-12T00:00:00Z',
        snapshotDate: '2026-11-12',
        totalDivisions: 0,
        totalAreas: 0,
        districts: {},
      },
    })
  )
}

async function open(page: Page, path: string, theme: Theme, width = 1280) {
  await stubSearchIndexes(page)
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript(t => {
    try {
      localStorage.setItem('theme', t)
    } catch {
      /* storage blocked: colorScheme still drives the theme */
    }
  }, theme)
  await page.setViewportSize({ width, height: 900 })
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

/** Press Tab until `target` has focus. WebKit can skip links on Tab (a
 *  platform setting), so after the cap the target is focused from script
 *  straight after a key press, which still counts as keyboard focus. */
async function tabTo(page: Page, target: Locator, cap = 80): Promise<void> {
  await target.waitFor({ timeout: 30_000 })
  for (let i = 0; i < cap; i++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate(el => el === document.activeElement)) return
  }
  await page.keyboard.press('Shift')
  await target.focus()
}

interface Ring {
  focusVisible: boolean
  kind: string
  width: number
  ratio: number
}

async function ringOfFocused(page: Page): Promise<Ring> {
  return page.evaluate(async () => {
    // .tm-btn-primary has `transition: all 0.2s`: read the settled ring, not
    // the outline colour halfway from white.
    await Promise.all(
      (document.activeElement?.getAnimations() ?? []).map(a =>
        a.finished.catch(() => undefined)
      )
    )
    type C = [number, number, number, number]
    const parse = (c: string): C | null => {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1]!
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map(parseFloat)
      return [p[0]!, p[1]!, p[2]!, p.length > 3 ? p[3]! : 1]
    }
    const lum = (c: C) => {
      const f = (v: number) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const contrast = (a: C, b: C) =>
      (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
    /** Opaque colours behind `from`: a solid fill, or every gradient stop. */
    const backdrop = (from: Element | null): C[] => {
      for (let p = from; p; p = p.parentElement) {
        const cs = getComputedStyle(p)
        const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(
          m => parse(m[0])!
        )
        if (stops.length && stops.every(s => s[3] > 0.9)) return stops
        const fill = parse(cs.backgroundColor)
        if (fill && fill[3] > 0.9) return [fill]
      }
      return [[255, 255, 255, 1]]
    }
    const el = document.activeElement as HTMLElement
    const cs = getComputedStyle(el)
    let color: C | null = null
    let width = 0
    let inset = false
    let kind = 'none'
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) {
      color = parse(cs.outlineColor)
      width = parseFloat(cs.outlineWidth)
      kind = 'outline'
    } else if (cs.boxShadow && cs.boxShadow !== 'none') {
      // "rgb(…) 0px 0px 0px 2px, rgb(…) 0px 0px 0px 4px": the widest spread
      // is the ring; with ring-offset the narrower one is the gap.
      for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
        const c = parse(part)
        const lengths = part.replace(/rgba?\([^)]+\)/, '').match(/-?[\d.]+px/g)
        const spread = lengths && lengths[3] ? parseFloat(lengths[3]) : 0
        if (c && c[3] > 0.9 && spread > width) {
          color = c
          width = spread
          inset = /inset/.test(part)
          kind = inset ? 'inset box-shadow' : 'box-shadow'
        }
      }
    }
    const behind = inset ? backdrop(el) : backdrop(el.parentElement)
    const ratio = color ? Math.min(...behind.map(b => contrast(color!, b))) : 0
    return {
      focusVisible: el.matches(':focus-visible'),
      kind,
      width,
      ratio: Math.round(ratio * 100) / 100,
    }
  })
}

async function expectVisibleRing(page: Page, what: string): Promise<void> {
  const ring = await ringOfFocused(page)
  const line = `${what}: ${ring.kind} ${ring.width}px, ${ring.ratio}:1`
  test.info().annotations.push({ type: 'ring', description: line })
  console.log(`[focus-ring] ${test.info().project.name} ${line}`)
  expect(ring.focusVisible, `${what} matches :focus-visible`).toBe(true)
  expect(
    ring.width,
    `${what} ring width (${ring.kind})`
  ).toBeGreaterThanOrEqual(2)
  expect(ring.ratio, `${what} ring contrast`).toBeGreaterThanOrEqual(3)
}

for (const theme of ['light', 'dark'] as const) {
  test(`404 "Go home" button shows a ring (${theme})`, async ({ page }) => {
    test.setTimeout(90_000)
    await open(page, '/no-such-page-2667', theme)
    await tabTo(page, page.getByRole('link', { name: 'Go to all districts' }))
    await expectVisibleRing(page, `Go home (${theme})`)
  })

  test(`KPI info button shows a ring (${theme})`, async ({ page }) => {
    test.setTimeout(90_000)
    await open(page, '/district/61', theme)
    await tabTo(
      page,
      page
        .locator(
          '[data-testid="kpi-bullet-card"] button[aria-label="More info"]'
        )
        .first()
    )
    await expectVisibleRing(page, `KPI info (${theme})`)
  })

  test(`club hero history link shows a ring (${theme})`, async ({ page }) => {
    test.setTimeout(90_000)
    await open(page, '/district/61/club/7238597', theme)
    await tabTo(page, page.locator('.club-hero__history-link').first())
    await expectVisibleRing(page, `club hero history link (${theme})`)
  })
}

test('club name link shows a ring (dark)', async ({ page }) => {
  test.setTimeout(90_000)
  await open(page, '/district/61/clubs', 'dark')
  await tabTo(
    page,
    page.locator('#clubs-table tbody tr .clubs-name-link').first()
  )
  await expectVisibleRing(page, 'club name link (dark)')
})

test('the skip link moves focus to <main>', async ({ page }) => {
  test.setTimeout(90_000)
  await open(page, '/', 'light')
  await tabTo(page, page.locator('.tm-skip-link'), 5)
  await page.keyboard.press('Enter')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('main-content')
})
