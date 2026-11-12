import { test, expect, type Page } from './fixtures/test'

/* A `?date=` that names no snapshot (#2635, from the 2026-11-12 UX review).
 *
 * Before: a shared or hand-edited link either hung on skeletons (division,
 * area and club pages), labelled today's figures with the requested date
 * (the chip read "Jan 1"), or told visitors old data was "fresh". After: the
 * date is checked against the snapshots that exist, once, in the controls
 * hooks. The page shows data for the closest date we have, says so in one
 * dismissible line, and the date chip and freshness pill name the date whose
 * data is on screen.
 *
 * Measured on the deployed PR preview (BASE_URL), which reads the live CDN. */

const noFreshLabel = async (page: Page): Promise<void> => {
  const pill = page.getByTestId('freshness-pill')
  await expect(pill).toBeVisible()
  await expect(pill).not.toContainText('Data fresh')
}

test('a division page with a date before all data shows data, a notice and no "Data fresh" (5s)', async ({
  page,
}) => {
  await page.goto('/district/61/division/A?py=2019&date=2020-01-01', {
    waitUntil: 'domcontentloaded',
  })
  const notice = page.getByTestId('date-notice')
  await expect(notice).toBeVisible({ timeout: 5_000 })
  await expect(notice).toContainText('No data for Jan 1, 2020')
  // Data, not skeletons: the page title resolves.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 5_000,
  })
  await noFreshLabel(page)
  // The chip never names the requested date.
  await expect(page.getByTestId('date-chip')).not.toContainText('Jan 1, 2020')
})

test('the notice can be dismissed', async ({ page }) => {
  await page.goto('/district/61/divisions?date=2019-01-01', {
    waitUntil: 'domcontentloaded',
  })
  const notice = page.getByTestId('date-notice')
  await expect(notice).toBeVisible({ timeout: 10_000 })
  await notice.getByRole('button', { name: /dismiss/i }).click()
  await expect(notice).toBeHidden()
})

test('the hub with a past-year snapshot date switches to that program year', async ({
  page,
}) => {
  // 2026-03-15 is a PY 2025-26 date; the hub used to rewrite it to today.
  await page.goto('/district/61?date=2026-03-15', {
    waitUntil: 'domcontentloaded',
  })
  const dateChip = page.getByTestId('date-chip')
  await expect(page.getByTestId('py-chip')).toContainText('PY 2025–26', {
    timeout: 10_000,
  })
  await expect(dateChip).not.toContainText('Nov')
})

test('the clubs chip names the date on screen, not the requested one', async ({
  page,
}) => {
  await page.goto('/district/61/clubs?date=2019-01-01', {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByTestId('date-notice')).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByTestId('date-chip')).not.toContainText('Jan 1')
})

test('/awards with a far-past date does not call old data fresh', async ({
  page,
}) => {
  await page.goto('/awards?date=2019-01-15', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('date-notice')).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByTestId('date-chip')).not.toContainText('Jan 15, 2019')
})
