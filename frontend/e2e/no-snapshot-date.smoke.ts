import { test, expect } from './fixtures/test'

/* A `?date=` that names no snapshot (#2635, from the 2026-11-12 UX review).
 *
 * Before: a shared or hand-edited link either hung on skeletons (division,
 * area and club pages), labelled today's figures with the requested date
 * (the chip read "Jan 1"), or told visitors old data was "fresh". After: the
 * date is checked against the snapshots that exist, once, in the controls
 * hooks. The page shows data for the closest date we have, says so in one
 * dismissible line, and the date chip names the date whose data is on screen.
 *
 * The date is earlier than any snapshot the pipeline has ever written (the
 * real index reaches back to 2017), so the closest one is the selected PY's
 * latest (which the fixture CDN serves). A date inside the real history would
 * resolve to an old snapshot the fixture CDN does not hold. The freshness-pill wording and the
 * switch to another program year are covered by unit tests: the fixture CDN
 * holds only the current program year's files. */

/* A date with NO snapshot, on purpose: it is not a pinned fixture date, so it
 * is built here rather than written into the URL literal (#2595). */
const NO_SNAPSHOT = '2000-01-01'

test('a division page with a date before all data shows data and a notice (5s)', async ({
  page,
}) => {
  await page.goto(`/district/61/division/A?date=${NO_SNAPSHOT}`, {
    waitUntil: 'domcontentloaded',
  })
  const notice = page.getByTestId('date-notice')
  await expect(notice).toBeVisible({ timeout: 5_000 })
  await expect(notice).toContainText('No data for Jan 1, 2000')
  // Data, not skeletons: the page title resolves.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 5_000,
  })
  // The chip never names the requested date.
  await expect(page.getByTestId('date-chip')).not.toContainText('Jan 1, 2000')
})

test('the notice can be dismissed', async ({ page }) => {
  await page.goto(`/district/61/clubs?date=${NO_SNAPSHOT}`, {
    waitUntil: 'domcontentloaded',
  })
  const notice = page.getByTestId('date-notice')
  await expect(notice).toBeVisible({ timeout: 10_000 })
  await notice.getByRole('button', { name: /dismiss/i }).click()
  await expect(notice).toBeHidden()
})

test('/awards with a far-past date names the date on screen, not the requested one', async ({
  page,
}) => {
  await page.goto(`/awards?date=${NO_SNAPSHOT}`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByTestId('date-notice')).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByTestId('date-chip')).not.toContainText('Jan 1, 2000')
})
