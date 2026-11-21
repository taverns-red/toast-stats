/**
 * One not-found panel inside the shell (#2647).
 *
 * Unknown URLs and unknown district, club, region, division and area ids all
 * used to end in four different places: the standalone ErrorPage with no
 * header or main, a red card with no h1, an EmptyState with no heading, and
 * the "limited data" view with four "0 of 0" rank cards. Each must now render
 * the shared panel inside the AppShell, with an h1 that names the missing id.
 *
 * Mounts the real App router, so it lives in the integration project (R22).
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest'
import {
  render,
  cleanup,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupCdnFetchMock } from './utils/mockCdnData'
import { preloadAppRoutes } from './utils/preloadAppRoutes'

vi.setConfig({ testTimeout: 15000 })

beforeAll(async () => {
  await preloadAppRoutes()
})

/** App reads the location when its module loads, so set the URL first. */
async function openApp(url: string) {
  window.history.replaceState({}, 'Test', url)
  vi.resetModules()
  const { default: App } = await import('../../App')
  render(<App />)
}

/** The panel's own h1, found inside the shell's main landmark. */
async function notFoundHeading(name: RegExp) {
  const main = await screen.findByRole('main', undefined, { timeout: 8000 })
  const panel = await within(main).findByTestId('not-found-panel', undefined, {
    timeout: 8000,
  })
  const h1 = within(panel).getByRole('heading', { level: 1, name })
  // The tab title names what was not found, the same words as the h1.
  await waitFor(() =>
    expect(document.title).toBe(`${h1.textContent} — Toast Stats`)
  )
  return h1
}

describe('not found renders one panel inside the shell (#2647)', () => {
  beforeEach(() => {
    setupCdnFetchMock()
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows an unknown URL inside the shell, with an h1', async () => {
    await openApp('/nope')
    expect(await notFoundHeading(/find that page/i)).toBeInTheDocument()
    // The shell's own landmarks are present: header, main, skip link.
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /skip to main content/i })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('names the unknown district and shows no empty rank cards', async () => {
    await openApp('/district/999')
    expect(await notFoundHeading(/district 999/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 of 0/)).not.toBeInTheDocument()
    expect(screen.queryByText(/percentile/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('limited-data-banner')).not.toBeInTheDocument()
  })

  it('names the unknown division and the district it was looked up in', async () => {
    await openApp('/district/61/division/ZZ')
    const h1 = await notFoundHeading(/division zz/i)
    expect(h1).toHaveTextContent(/district 61/i)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('names the unknown area', async () => {
    await openApp('/district/61/division/A/area/ZZ9')
    expect(await notFoundHeading(/area zz9/i)).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('names the unknown club on the district-free club URL', async () => {
    await openApp('/club/99999999')
    expect(await notFoundHeading(/club 99999999/i)).toBeInTheDocument()
  })

  it('names the unknown club inside its district', async () => {
    await openApp('/district/61/club/99999999')
    expect(await notFoundHeading(/club 99999999/i)).toBeInTheDocument()
  })

  it('names the unknown region', async () => {
    await openApp('/region/99')
    expect(
      await notFoundHeading(/^Region 99 isn't in Toast Stats$/)
    ).toBeInTheDocument()
  })
})
