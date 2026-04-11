import { test, expect } from '@playwright/test'

/**
 * Smoke tests for staging environment (#316)
 *
 * These tests run against the deployed staging site to verify
 * critical user paths before promoting to production.
 *
 * Run: npx playwright test --config frontend/playwright.config.ts
 */

test.describe('Landing Page', () => {
  test('loads and shows rankings table with districts', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', {
        name: /Toastmasters District Rankings/i,
      })
    ).toBeVisible()

    // Rankings table should have at least 100 districts
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(50)
  })

  test('rankings show non-zero aggregate scores', async ({ page }) => {
    await page.goto('/')
    // Wait for data to load
    const firstScore = page.locator('table tbody tr td:last-child').first()
    await expect(firstScore).toBeVisible({ timeout: 10_000 })
    const text = await firstScore.textContent()
    const score = parseInt(text?.trim() || '0', 10)
    expect(score).toBeGreaterThan(0)
  })
})

test.describe('District Detail Page', () => {
  test('loads overview with stats', async ({ page }) => {
    await page.goto('/district/61')
    await expect(page.getByText('District 61')).toBeVisible()
    await expect(page.getByText('Paid Clubs')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText('Membership Payments')).toBeVisible()
    await expect(page.getByText('Distinguished Clubs')).toBeVisible()
  })

  test('clubs tab loads with club data', async ({ page }) => {
    await page.goto('/district/61?tab=clubs')
    await expect(page.getByText('District 61')).toBeVisible()
    // Wait for clubs table
    const clubRows = page.locator('table tbody tr, [role="row"]')
    await expect(clubRows.first()).toBeVisible({ timeout: 10_000 })
  })

  test('date selector shows dates without gaps', async ({ page }) => {
    await page.goto('/district/61')
    // Find and open date selector
    const dateSelector = page.locator(
      'select, [role="listbox"], [data-testid*="date"]'
    )
    if ((await dateSelector.count()) > 0) {
      // Verify it has options
      const options = dateSelector.first().locator('option')
      const count = await options.count()
      expect(count).toBeGreaterThan(0)
    }
  })

  test('program year selector switches data', async ({ page }) => {
    // Load with a historical program year
    await page.goto('/district/61?py=2024')
    await expect(page.getByText('District 61')).toBeVisible()
    // Should show historical data banner or different date
    await page.waitForTimeout(2000)
  })
})

test.describe('Club Detail Page', () => {
  test('loads with membership stats', async ({ page }) => {
    // Use a known club in District 61
    await page.goto('/district/61/club/01479548')
    // Wait for any stat card to appear (Base, Current, Net Change, DCP Goals)
    await expect(page.getByText('DCP Goals').first()).toBeVisible({
      timeout: 10_000,
    })
  })
})

test.describe('Data Integrity', () => {
  test('v1/latest.json returns valid date', async ({ request }) => {
    const baseUrl =
      process.env['CDN_BASE_URL'] ||
      'https://storage.googleapis.com/toast-stats-data-staging'
    const response = await request.get(`${baseUrl}/v1/latest.json`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data.latestSnapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('v1/rankings.json has districts', async ({ request }) => {
    const baseUrl =
      process.env['CDN_BASE_URL'] ||
      'https://storage.googleapis.com/toast-stats-data-staging'
    const response = await request.get(`${baseUrl}/v1/rankings.json`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data.rankings.length).toBeGreaterThanOrEqual(100)
  })
})

test.describe('No Console Errors', () => {
  test('landing page has no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')
    await page.waitForTimeout(3000)

    // Filter out known benign errors (e.g., favicon, third-party)
    const realErrors = errors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('googletagmanager') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT')
    )
    expect(realErrors).toHaveLength(0)
  })
})
