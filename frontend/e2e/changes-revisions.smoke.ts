import { test, expect } from './fixtures/test'

/* What Changed lists month-end reconciliation revisions (#2475, phase 1).
 *
 * An `@asOf` the district's revision index does not hold must fall back to the
 * default pair instead of a blank or error page. Deliberately free of any
 * pinned date: the shards answer from fixtures, and the default pair reads
 * only the dates every What Changed smoke already loads. The label and the
 * deep link to a real revision are covered by the page unit tests.
 */

test.describe('What Changed revisions (#2475)', () => {
  test('an unknown @asOf falls back to the default pair', async ({ page }) => {
    await page.goto('/district/61/changes?to=2026-10-31@2099-01-01')
    await expect(page.getByTestId('changes-headline')).toBeVisible()
    await expect(page.getByTestId('changes-reversed')).toHaveCount(0)
    await expect(page.getByTestId('changes-error')).toHaveCount(0)
  })
})
