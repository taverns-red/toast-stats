import { test, expect } from './fixtures/test'

/* /methodology#glossary must survive a reload on desktop (#2656, REF-05).
 *
 * On main, loading a section link rewrote the URL to ?openSections=glossary
 * and dropped the hash, so a reloaded or shared link landed at the top. On
 * desktop every section is already open, so the page must leave the URL
 * alone and scroll the heading into view.
 */

const HASH = '#glossary'

test('methodology section link keeps its hash and scrolls to the heading at 1280 — reload included', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })

  const heading = page.locator('#glossary h2')

  for (const step of ['first load', 'after reload'] as const) {
    if (step === 'first load') {
      await page.goto(`/methodology${HASH}`, { waitUntil: 'networkidle' })
    } else {
      await page.reload({ waitUntil: 'networkidle' })
    }
    await heading.waitFor({ state: 'visible', timeout: 30_000 })
    // Display-font reflow settles before we measure (L134).
    await page.evaluate(() => document.fonts.ready)

    const url = new URL(page.url())
    expect(url.hash, `${step}: hash was dropped`).toBe(HASH)
    expect(
      url.search,
      `${step}: desktop must not write ?openSections`
    ).not.toContain('openSections')

    // The heading is on screen (scrolled to, not left at the page top).
    await expect(async () => {
      const box = await heading.boundingBox()
      expect(box, `${step}: heading has no box`).not.toBeNull()
      const top = box?.y ?? -1
      expect(top, `${step}: heading above the viewport`).toBeGreaterThanOrEqual(
        0
      )
      expect(top, `${step}: heading below the fold`).toBeLessThan(800)
    }).toPass({ timeout: 10_000 })
  }
})
