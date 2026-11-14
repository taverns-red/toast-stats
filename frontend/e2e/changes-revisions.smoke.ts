import { test, expect } from './fixtures/test'

/* What Changed lists month-end reconciliation revisions (#2475, phase 1).
 *
 * October 2026 was reconciled live: the pipeline kept the 2026-11-02 revision
 * under `snapshots/2026-10-31/revisions/` and its index. That revision is the
 * newest, so it IS the plain month end, and the picker labels it and accepts
 * it spelled `2026-10-31@2026-11-02`. An @asOf the index does not hold must
 * fall back to the default pair instead of a blank or error page.
 *
 * Data-dependent on purpose: it reads the CDN the preview points at (staging
 * for a PR preview), where the October index lives.
 */

const CHIP = '[data-testid="changes-to-chip"]'

test.describe('What Changed revisions (#2475)', () => {
  test('a ?to=<monthEnd>@<asOf> deep link shows the revision label', async ({
    page,
  }) => {
    await page.goto(
      '/district/61/changes?from=2026-10-30&to=2026-10-31@2026-11-02'
    )
    await expect(page.locator(CHIP)).toContainText(
      'Oct 31, 2026 · revised Nov 2'
    )
    await expect(page.getByTestId('changes-headline')).toContainText(
      'revised Nov 2'
    )
  })

  test('an unknown @asOf falls back to the default pair', async ({ page }) => {
    await page.goto('/district/61/changes?to=2026-10-31@2099-01-01')
    await expect(page.getByTestId('changes-headline')).toBeVisible()
    await expect(page.getByTestId('changes-reversed')).toHaveCount(0)
    await expect(page.getByTestId('changes-error')).toHaveCount(0)
  })
})
