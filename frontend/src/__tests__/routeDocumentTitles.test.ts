/**
 * #2640 (WCAG 2.4.2): every routed page sets its own document title.
 *
 * A page that never calls `useDocumentTitle` leaves the generic
 * "Toast Stats — Toastmasters District Performance" in the tab, history,
 * bookmarks and screen-reader page announcements. This guard reads the route
 * table in `App.tsx` and fails for any routed page (and the router's
 * `errorElement`) whose source has no `useDocumentTitle(` call, so a new page
 * cannot ship untitled.
 *
 * It is a static source check on purpose: unit tests may not full-page-mount
 * (R22), and a mount would need every page's data mocked.
 */
import { describe, it, expect } from 'vitest'
import appSource from '../App.tsx?raw'

const sources = import.meta.glob(
  ['../pages/*.tsx', '../components/ErrorPage.tsx', '!../pages/*.test.tsx'],
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>

/** Pages that deliberately keep the branded default title. */
const KEEPS_DEFAULT_TITLE: Record<string, string> = {
  DistrictsPage: 'the landing page: the default title is its title',
  AreaRedirectPage: 'redirects at once; the target page sets the title',
  ClubRedirectPage: 'redirects at once; the target page sets the title',
}

/** Every page module App.tsx imports, plus the router's errorElement. */
function routedModules(): string[] {
  const names = new Set<string>()
  for (const m of appSource.matchAll(/['"]\.\/pages\/(\w+)['"]/g)) {
    names.add(m[1] as string)
  }
  names.add('ErrorPage')
  return [...names]
}

function sourceOf(name: string): string | undefined {
  return Object.entries(sources).find(([path]) =>
    path.endsWith(`/${name}.tsx`)
  )?.[1]
}

describe('every route sets a specific document title (#2640)', () => {
  const modules = routedModules()

  it('finds the routed pages in App.tsx', () => {
    expect(modules.length).toBeGreaterThan(30)
    for (const name of modules) expect(sourceOf(name), name).toBeDefined()
  })

  it.each(modules.filter(n => !(n in KEEPS_DEFAULT_TITLE)))(
    '%s calls useDocumentTitle',
    name => {
      expect(sourceOf(name)).toMatch(/\buseDocumentTitle\(/)
    }
  )

  it('lists no exemption that has since been titled', () => {
    for (const name of Object.keys(KEEPS_DEFAULT_TITLE)) {
      expect(sourceOf(name), name).not.toMatch(/\buseDocumentTitle\(/)
    }
  })
})
