import { test, expect } from './fixtures/test'
import { fixtureFetch } from './helpers/cdnFixtures'

/* Printing an unscrolled district page (#2616, from #2571/#2610).
 *
 * The trophy case and the growth card hold their reads until they near the
 * viewport (#2513). Printing releases them, but a read takes time, so a first
 * print can still hold placeholders: print.css collapses each placeholder to
 * its "Still loading. Print again..." note, and a second print has both cards.
 * This runs the real print stylesheet (emulated print media) in the browser:
 * the first print is kept alive by holding the awards read, then released.
 */

const HELD_NOTE_TEXT = /still loading\. print again in a moment/i

test('an unscrolled first print notes the held cards; a second print has both (D61)', async ({
  page,
}) => {
  let release: () => void = () => undefined
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route('**/competitive-awards.json', async route => {
    await released
    const res = await fixtureFetch(route)
    await route.fulfill({
      status: res.status(),
      json: await res.json(),
      headers: { 'access-control-allow-origin': '*' },
    })
  })

  await page.setViewportSize({ width: 375, height: 700 })
  await page.goto('/district/61', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  const trophy = page.locator('[data-testid="trophy-case-slot"]')
  const growth = page.locator('[data-testid="growth-slot"]')
  await expect(trophy.locator('[data-testid$="-held"]')).toHaveCount(1)

  // First print: nothing scrolled, the awards read still out.
  await page.emulateMedia({ media: 'print' })
  const note = trophy.getByText(HELD_NOTE_TEXT)
  await expect(note).toBeVisible()
  // The skeleton collapses to its note: no title, no bars.
  await expect(
    trophy.getByRole('heading', { name: /distinguished district status/i })
  ).toHaveCount(0)
  const noteHeight = await note.evaluate(
    el => el.getBoundingClientRect().height
  )
  const slotHeight = await trophy.evaluate(
    el => el.getBoundingClientRect().height
  )
  expect(slotHeight, 'collapsed to about its note').toBeLessThan(
    noteHeight + 80
  )

  // Second print: the read lands, both cards are in the printout.
  release()
  await expect(trophy.getByText(HELD_NOTE_TEXT)).toHaveCount(0, {
    timeout: 30_000,
  })
  await expect(
    trophy.getByRole('heading', { name: /distinguished district status/i })
  ).toBeVisible()
  await expect(growth.getByText(HELD_NOTE_TEXT)).toHaveCount(0, {
    timeout: 30_000,
  })
  await expect(growth.locator('[data-testid$="-held"]')).toHaveCount(0)
  await expect(
    growth.locator('[data-testid="club-growth-achievement-skeleton"]')
  ).toHaveCount(0)
})
