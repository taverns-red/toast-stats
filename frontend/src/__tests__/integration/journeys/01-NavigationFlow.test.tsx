import React from 'react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// Journey tests render <App /> and click through multi-step flows; the
// full-page scope is the test. 15s recognises that category — unit
// tests still inherit the 5s cap from vitest.config.ts (#473).
vi.setConfig({ testTimeout: 15000 })
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import App from '../../../App'
import { setupCdnFetchMock } from '../utils/mockCdnData'

// Compile the lazy routes this journey visits once, up front: otherwise the
// first test's 1 s findBy window measures Vite's cold transform of their
// module graphs, not the app; on a slow CI runner that alone
// overruns the window (#2248; same pattern as DistrictMapPage.test.tsx).
beforeAll(async () => {
  await Promise.all([
    import('../../../pages/DistrictDetailPage'),
    import('../../../components/GlobalRankingsTab'),
  ])
})

describe('Journey 01: The Navigation Flow', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    setupCdnFetchMock()

    // Ensure we start at the root url for the router
    window.history.replaceState({}, 'Test', '/')
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('navigates from landing page to District 61 overview', async () => {
    render(<App />)

    // Step 1: Landing page loads successfully (#356 chrome; #2249 H1)
    const landingHeading = await screen.findByRole('heading', {
      level: 1,
      name: /^find a district, club or region$/i,
    })
    expect(landingHeading).toBeInTheDocument()

    // Data loads and table displays District 61
    const districtNameCell = await screen.findByText('District 61')
    expect(districtNameCell).toBeInTheDocument()

    // Step 2: Filter by region using pill toggle bar (#326)
    const region6Pill = screen.getByRole('button', { name: /Region Region 6/i })
    await user.click(region6Pill)

    // Step 3: Search for specific district (optional, since filter does it)
    const searchInput = screen.getByRole('textbox', {
      name: /filter districts/i,
    })
    await user.type(searchInput, '61')

    // Step 4: Click the district row in the table
    // The tr elements don't have roles by default unless specified, so just click the District Name
    await user.click(districtNameCell)

    // Step 5: Verify Successful Navigation to District 61
    // The DistrictDetailPage should lazy load and render
    const districtHeading = await screen.findByRole(
      'heading',
      { name: /District 61/i },
      { timeout: 5000 }
    )
    expect(districtHeading).toBeInTheDocument()

    // #571 (Phase 3) retired the tab strip entirely — the District page
    // is a scrollable narrative and the Clubs subview lives at
    // /district/:id/clubs. Click the "View all clubs →" CTA instead of
    // the (no-longer-rendered) Clubs tab.
    const clubsLink = await screen.findByRole(
      'link',
      { name: /view all clubs/i },
      { timeout: 5000 }
    )
    // #2300 — the Overview links the council credentials page (a routed
    // page that is deliberately not in the district subnav).
    expect(
      screen.getByRole('link', { name: /^council credentials$/i })
    ).toHaveAttribute('href', '/district/61/council')
    await user.click(clubsLink)
    await screen.findByRole(
      'heading',
      { name: /^All Clubs$/i },
      { timeout: 5000 }
    )

    // Step 7: Find Ottawa Club in the data table and click it
    const ottawaClubRow = await screen.findByText(
      /Ottawa Club/i,
      {},
      { timeout: 5000 }
    )
    await user.click(ottawaClubRow)

    // Step 8: Verify Successful Navigation to Club Detail Page.
    const clubHeading = await screen.findByRole(
      'heading',
      { name: /Ottawa Club/i },
      { timeout: 5000 }
    )
    expect(clubHeading).toBeInTheDocument()
  }, 15000)
})
