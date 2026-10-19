import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/* #1841: the 375 mobile gate's ratchet file (e2e/mobile-375-budgets.json)
 * may only hold budgets at or under the site-wide targets, unless the entry
 * names the issue that owns the exception. This runs in the unit suite so a
 * loosened budget fails before the PR preview is even deployed.
 */

const FRONTEND = resolve(__dirname, '../../..')
const BUDGETS = resolve(FRONTEND, 'e2e/mobile-375-budgets.json')
const WORKFLOW = resolve(FRONTEND, '../.github/workflows/pr-preview.yml')
const ISSUE = /^#\d+$/

interface Route {
  path: string
  sentinel: string
  first?: string
  contextBar?: boolean
  firstContentMaxPx: number
  maxShareUnder14: number
  issue?: string
}
interface Budgets {
  targets: {
    overflowPx: number
    maxShareUnder14: number
    contextBarFirstContentMaxPx: number
  }
  routes: Route[]
  tapAllowlist: { path: string; selector: string; issue: string }[]
}

const budgets = JSON.parse(readFileSync(BUDGETS, 'utf8')) as Budgets

describe('mobile 375 gate budgets (#1841)', () => {
  it('keeps the review §7 targets', () => {
    expect(budgets.targets).toEqual({
      overflowPx: 0,
      maxShareUnder14: 0.15,
      contextBarFirstContentMaxPx: 110,
    })
  })

  // 24 since the Analytics subpage was retired (#2159): its route redirects to
  // Clubs, which is already in the list.
  it('covers the 24 review routes once each, each with a sentinel', () => {
    const paths = budgets.routes.map(r => r.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.length).toBe(24)
    expect(paths).not.toContain('/district/61/analytics')
    for (const r of budgets.routes) expect(r.sentinel.trim()).not.toBe('')
  })

  it('holds every route at or under the targets unless an issue owns it', () => {
    const { maxShareUnder14, contextBarFirstContentMaxPx } = budgets.targets
    const loose = budgets.routes.filter(
      r =>
        (r.maxShareUnder14 > maxShareUnder14 ||
          (r.contextBar &&
            r.firstContentMaxPx > contextBarFirstContentMaxPx)) &&
        !ISSUE.test(r.issue ?? '')
    )
    expect(loose.map(r => r.path)).toEqual([])
  })

  it('gives every allowlisted tap target a route and an owning issue', () => {
    const paths = new Set(budgets.routes.map(r => r.path))
    const bad = budgets.tapAllowlist.filter(
      a => !paths.has(a.path) || !a.selector.trim() || !ISSUE.test(a.issue)
    )
    expect(bad).toEqual([])
  })

  it('runs on every PR preview', () => {
    expect(readFileSync(WORKFLOW, 'utf8')).toMatch(
      /playwright test[^\n]*e2e\/mobile-375-gate\.smoke\.ts/
    )
  })
})
