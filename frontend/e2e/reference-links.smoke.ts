import { test, expect, type Page } from './fixtures/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

/* Links in running text must not rely on colour alone (#2657 REF-07, WCAG
   1.4.1). jsdom applies no stylesheet, so axe's link-in-text-block rule only
   means something in a real browser. The engine is the axe-core that jest-axe
   already runs for the unit a11y tests. */

const require = createRequire(import.meta.url)
const AXE_SOURCE = readFileSync(
  createRequire(require.resolve('jest-axe')).resolve('axe-core/axe.min.js'),
  'utf-8'
)

const ROUTES = [
  { path: '/clubs', ready: '[data-testid="race-basis"]' },
  { path: '/clubs/race/distinguished', ready: '[data-testid="race-basis"]' },
]

interface Violation {
  id: string
  nodes: { target: string[]; html: string }[]
}

async function linkInTextBlock(page: Page): Promise<Violation[]> {
  await page.addScriptTag({ content: AXE_SOURCE })
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: string,
            options: object
          ) => Promise<{ violations: Violation[] }>
        }
      }
    ).axe
    const result = await axe.run('.clubs-page', {
      runOnly: { type: 'rule', values: ['link-in-text-block'] },
    })
    return result.violations.map(v => ({
      id: v.id,
      nodes: v.nodes.map(n => ({ target: n.target, html: n.html })),
    }))
  })
}

for (const { path, ready } of ROUTES) {
  test(`links in text on ${path} are not told apart by colour alone`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
    await expect(page.locator(ready)).toBeVisible({ timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready)

    expect(await linkInTextBlock(page)).toEqual([])
  })
}
