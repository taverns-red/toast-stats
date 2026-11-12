import { test, expect } from './fixtures/test'
import { CDN_STAGING_ORIGIN } from './helpers/cdnFixtures'

/* A failed data load shows one error state with Try again (#2636, from the
 * 2026-11-12 UX review).
 *
 * Before: with the CDN unreachable the district hub sat on dashes or
 * skeletons forever, and Clubs said "No Clubs Found… no data has been cached
 * yet" - blaming the data for a network failure. After: every data route
 * shows a role="alert" panel with a "Try again" button, inside the page
 * frame, and never claims the data is missing.
 *
 * Every request to the CDN origin is aborted (a page route, which takes
 * precedence over the fixture's context route). */

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
      await page.route(
        url => url.origin === CDN_STAGING_ORIGIN,
        r => r.abort()
      )
      await page.goto(route.path, { waitUntil: 'domcontentloaded' })

      await expect(page.getByRole('alert').first()).toBeVisible({
        timeout: 10_000,
      })
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
