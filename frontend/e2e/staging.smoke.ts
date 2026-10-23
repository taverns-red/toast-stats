import { test, expect, type Page } from './fixtures/test'

/**
 * Smoke tests for staging environment (#316)
 *
 * These tests run against the deployed staging site to verify
 * critical user paths before promoting to production. They must also pass
 * against prod (`BASE_URL=https://ts.taverns.red`) — #1920.
 *
 * Run: npx playwright test --config frontend/playwright.config.ts
 */

/* The district's H1. Since the phone context bar (#1831) and the subpage
   breadcrumb, the text "District 61" appears in several places, so match the
   one level-1 heading rather than bare text (#1920). */
const districtHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'District 61' })

/* The PY 2026–27 realignment renumbered the world into 94 districts (from
   128). The old `>= 100` floor predated it. Keep a floor that still catches a
   truncated rankings file (#1920). */
const MIN_DISTRICTS = 90

/* The data CDN the deployed site actually reads. Staging builds point at the
   staging bucket and prod builds at cdn.taverns.red (VITE_CDN_BASE_URL), so
   hardcoding the staging bucket checked the wrong data when BASE_URL was prod
   (#1920). CDN_BASE_URL still overrides. */
async function deployedCdnBase(page: Page): Promise<string> {
  const fromEnv = process.env['CDN_BASE_URL']
  if (fromEnv) return fromEnv
  const [req] = await Promise.all([
    page.waitForRequest(r => r.url().endsWith('/v1/latest.json')),
    page.goto('/'),
  ])
  return req.url().replace(/\/v1\/latest\.json$/, '')
}

test.describe('Landing Page', () => {
  test('loads and shows rankings table with districts', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /Find a district, club or region/i,
      })
    ).toBeVisible()

    // Rankings table lists the districts
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(MIN_DISTRICTS)
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
    await expect(districtHeading(page)).toBeVisible()
    // The KPI cards' headings. Bare text also matches the gap tiles and the
    // composition chart's heading (#1920).
    const kpi = (name: string) =>
      page.getByRole('heading', { name, exact: true })
    await expect(kpi('Paid Clubs')).toBeVisible({ timeout: 10_000 })
    await expect(kpi('Membership Payments')).toBeVisible()
    await expect(kpi('Distinguished Clubs')).toBeVisible()
  })

  test('clubs subpage loads with club data', async ({ page }) => {
    // Routed subpage since ADR-005; `?tab=clubs` is a legacy URL.
    await page.goto('/district/61/clubs')
    await expect(districtHeading(page)).toBeVisible()
    // Wait for clubs table
    const clubRows = page.locator('table tbody tr, [role="row"]')
    await expect(clubRows.first()).toBeVisible({ timeout: 10_000 })
  })

  test('date selector shows dates without gaps', async ({ page }) => {
    await page.goto('/district/61')
    // The snapshot-date chip (DataControlsBar). #1947: the old locator
    // (`select, [role=listbox], [data-testid*=date]`) matched whichever
    // <select> rendered first — in WebKit the PY chip, which has 0 options
    // until the program-year query resolves — and counted once, without
    // waiting. The readiness signal is the dates themselves: the chip always
    // has "Latest in PY" (value ""), and gains one option per snapshot date
    // when the dates query lands. Web-first assertions wait for that.
    const dateOptions = page.locator(
      '[data-testid="date-chip-select"] option:not([value=""])'
    )
    await expect(dateOptions.first()).toBeAttached({ timeout: 15_000 })
    const dates = await dateOptions.evaluateAll(els =>
      els.map(el => (el as HTMLOptionElement).value)
    )
    // Every option is an ISO date, newest first, with no duplicates.
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(dates).toEqual([...new Set(dates)].sort().reverse())
  })

  test('program year selector switches data', async ({ page }) => {
    // Load with a historical program year
    await page.goto('/district/61?py=2024')
    await expect(districtHeading(page)).toBeVisible()
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
  test('v1/latest.json returns valid date', async ({ page, request }) => {
    const baseUrl = await deployedCdnBase(page)
    const response = await request.get(`${baseUrl}/v1/latest.json`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data.latestSnapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('v1/rankings.json has districts', async ({ page, request }) => {
    const baseUrl = await deployedCdnBase(page)
    const response = await request.get(`${baseUrl}/v1/rankings.json`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data.rankings.length).toBeGreaterThanOrEqual(MIN_DISTRICTS)
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
