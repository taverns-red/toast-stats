import type { Page } from '@playwright/test'
import { fixtureFetch, fixtureRequestGet } from './cdnFixtures'

/* Force the month-end reconciliation state on the deployed preview (#2472).
 *
 * The freshness pill reconciles when the dashboard's as-of date has moved
 * into the month after the latest (pinned) snapshot — the first days of every
 * month. Live data is only in that state a few days a month, so a smoke that
 * relied on it would guard the layout by the calendar. This rewrites the
 * as-of date on the two reads that carry it, leaving everything else real:
 *
 *  - `v1/rankings.json` `date` (the global as-of: club, district, region
 *    pages via useLatestAsOfDate), moved to the 1st of the month after
 *    `v1/latest.json`'s `latestSnapshotDate`;
 *  - `snapshots/<date>/all-districts-rankings.json` `metadata.sourceCsvDate`
 *    (the landing page's as-of), moved to the 1st of the month after <date>.
 *
 * The reads go through `fixtureFetch` / `fixtureGet`: the PR Preview shards
 * answer the CDN from recorded fixtures, and a bare `route.fetch()` or
 * `page.request.get()` would read live staging past them (#2545).
 *
 * Register before `page.goto`. Callers should assert the pill rendered
 * `data-reconciling="true"`, or a change in the read path makes them vacuous.
 */

const firstOfNextMonth = (isoDate: string): string => {
  const [y, m] = isoDate.split('-').map(Number)
  const next = new Date(Date.UTC(y!, m!, 1))
  return next.toISOString().slice(0, 10)
}

// A page route answers a cross-origin fetch itself, so it carries CORS.
const CORS = { 'access-control-allow-origin': '*' }

export async function forceReconciliation(page: Page): Promise<void> {
  await page.route('**/v1/rankings.json', async route => {
    const res = await fixtureFetch(route)
    const body = (await res.json()) as { date: string }
    const latestUrl = new URL('latest.json', route.request().url()).toString()
    const latest = (await (
      await fixtureRequestGet(page, latestUrl)
    ).json()) as {
      latestSnapshotDate: string
    }
    body.date = firstOfNextMonth(latest.latestSnapshotDate)
    await route.fulfill({ status: res.status(), json: body, headers: CORS })
  })
  await page.route(
    '**/snapshots/*/all-districts-rankings.json',
    async route => {
      const res = await fixtureFetch(route)
      const body = (await res.json()) as {
        metadata?: { sourceCsvDate?: string }
      }
      const date = /snapshots\/(\d{4}-\d{2}-\d{2})\//.exec(
        route.request().url()
      )?.[1]
      if (body.metadata && date) {
        body.metadata.sourceCsvDate = firstOfNextMonth(date)
      }
      await route.fulfill({ status: res.status(), json: body, headers: CORS })
    }
  )
}
