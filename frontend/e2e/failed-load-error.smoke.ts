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
      await expect(body).not.toContainText(/No Clubs Found|No clubs recorded/i)
      await expect(body).not.toContainText(/not been cached|not cached/i)
      await expect(body).not.toContainText(/not available for this date/i)
    })
  }
}

// One failure, one alert: on a phone the hub renders its own error state and
// the page-level panel used to render too.
test('district hub at 375: a failed load shows exactly one alert (10s)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.route(
    url => url.origin === CDN_STAGING_ORIGIN,
    r => r.abort()
  )
  await page.goto('/district/61', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert').first()).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByRole('alert')).toHaveCount(1)
})

// Try again recovers once the CDN is reachable. Dropping the aborting route
// lets the fixture route serve the retry (route.continue() is banned by the
// smokes-use-CDN-fixtures lint, and would reach the live CDN).
test('district clubs: Try again recovers once the CDN is reachable (10s)', async ({
  page,
}) => {
  const isCdn = (url: URL): boolean => url.origin === CDN_STAGING_ORIGIN
  const abort = (r: { abort: () => Promise<void> }): Promise<void> => r.abort()
  await page.route(isCdn, abort)
  await page.goto('/district/61/clubs', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert').first()).toBeVisible({
    timeout: 10_000,
  })

  await page.unroute(isCdn, abort)
  await page
    .getByRole('button', { name: /try again/i })
    .first()
    .click()
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 10_000 })
})
