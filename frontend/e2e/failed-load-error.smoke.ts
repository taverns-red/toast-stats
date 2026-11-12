import { test, expect } from './fixtures/test'

/* A failed data load shows one error state with Try again (#2636, from the
 * 2026-11-12 UX review).
 *
 * Before: with the CDN unreachable the district hub sat on dashes or
 * skeletons forever, and Clubs said "No Clubs Found… no data has been cached
 * yet" - blaming the data for a network failure. After: every data route
 * shows a role="alert" panel with a "Try again" button, inside the page
 * frame, and never claims the data is missing.
 *
 * Every CDN snapshot request (`/v1/**.json`) is aborted. Measured on the
 * deployed PR preview (BASE_URL). */

const CDN_JSON = /\/v1\/.*\.json(\?.*)?$/

const ROUTES = [
  { name: 'district hub', path: '/district/61' },
  { name: 'district clubs', path: '/district/61/clubs' },
  { name: 'division', path: '/district/61/division/A' },
] as const

for (const route of ROUTES) {
  for (const width of [375, 1280] as const) {
    test(`${route.name} at ${width}: aborted CDN shows an alert with Try again (10s)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.route(CDN_JSON, r => r.abort())
      await page.goto(route.path, { waitUntil: 'domcontentloaded' })

      const alert = page.getByRole('alert').first()
      await expect(alert).toBeVisible({ timeout: 10_000 })
      await expect(
        page.getByRole('button', { name: /try again/i }).first()
      ).toBeVisible()

      // A network failure is not "no data".
      const body = page.locator('main')
      await expect(body).not.toContainText(/No Clubs Found/i)
      await expect(body).not.toContainText(/not been cached|not cached/i)
      await expect(body).not.toContainText(/not available for this date/i)
    })
  }
}

test('Try again recovers once the CDN is reachable', async ({ page }) => {
  let blocked = true
  await page.route(CDN_JSON, r => (blocked ? r.abort() : r.continue()))
  await page.goto('/district/61/clubs', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert').first()).toBeVisible({
    timeout: 10_000,
  })
  blocked = false
  await page
    .getByRole('button', { name: /try again/i })
    .first()
    .click()
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 30_000 })
})
