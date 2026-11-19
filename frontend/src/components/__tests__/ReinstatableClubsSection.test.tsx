/**
 * ReinstatableClubsSection (#3007, phase 3) — "Can reinstate" on the district
 * Club Growth page. Fixture: the staging 2026-11-18 file (D61: 3 suspended
 * clubs that add to the base, 19 closed clubs, 9 of them in the oldest
 * renewal period).
 *
 * Tags are plain text (never colour alone). Reasons quote Toastmasters'
 * Club Reinstatement FAQ. A missing file renders nothing; a measured zero
 * says so.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type {
  ReinstatableClub,
  ReinstatableClubs,
} from '@taverns-red/shared-contracts'
import recordedJson from '../../__tests__/fixtures/reinstatable-clubs-2026-11-18.recorded.json'
import { ReinstatableClubsSection } from '../ReinstatableClubsSection'

const recorded = recordedJson as unknown as ReinstatableClubs
const d61 = recorded.districts['61'] ?? []
const d51 = recorded.districts['51'] ?? []

function stubMobile(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

describe('ReinstatableClubsSection', () => {
  beforeEach(() => stubMobile(false))
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders nothing when the list was not measured', () => {
    const { container } = render(
      <ReinstatableClubsSection
        clubs={null}
        baseProgramYear={null}
        programYearStart={2026}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('says so when the file lists no clubs for the district', () => {
    render(
      <ReinstatableClubsSection
        clubs={[]}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Can reinstate (0)' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No suspended or recently closed clubs can reinstate/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lists every recorded D61 club with its number', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Can reinstate (22)' })
    ).toBeInTheDocument()
    const table = screen.getByTestId('growth-reinstate-table')
    expect(within(table).getAllByRole('row')).toHaveLength(23)
    const row = rowFor('Toastmasters At St. Lawrence College')
    expect(row).toHaveTextContent('Club 1849755')
    expect(row).toHaveTextContent('A / 01')
  })

  it('tags a suspended club that adds to the base, quoting the FAQ', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    const row = rowFor('Toastmasters At St. Lawrence College')
    // The page's shared date format (formatDisplayDate), as the Suspended stage.
    expect(row).toHaveTextContent('Suspended Sep 30, 2026')
    expect(row).toHaveTextContent('Adds to the club base')
    expect(row).toHaveTextContent(
      '“Reinstatement during the October renewal cycle will increase the club base.”'
    )
  })

  it('tags a closed club as not adding, with its last-seen date', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    const row = rowFor("Tunney's Toastmasters")
    expect(row).toHaveTextContent('Closed, last seen Jun 30, 2026')
    expect(row).toHaveTextContent('Doesn’t add to the club base')
    expect(row).toHaveTextContent('“will not increase the club base”')
    expect(row).not.toHaveTextContent('Confirm with World Headquarters')
  })

  it('marks clubs in the oldest renewal period "Confirm with World Headquarters"', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(rowFor('Club Le Marquis')).toHaveTextContent(
      'Confirm with World Headquarters'
    )
    const oldest = d61.filter(c => c.oldestPeriod).length
    expect(oldest).toBe(9)
    const flagged = within(screen.getByTestId('growth-reinstate-table'))
      .getAllByRole('row')
      .filter(r => r.textContent?.includes('Confirm with World Headquarters'))
    expect(flagged).toHaveLength(oldest)
  })

  it('shows a closed club with no known division or area as not known', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(rowFor('Club Le Marquis')).toHaveTextContent('Not known')
  })

  it('says the effect is not known for a suspend date off the renewal cycle', () => {
    render(
      <ReinstatableClubsSection
        clubs={d51}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    const row = rowFor('HELP Synergy Toastmasters Club')
    expect(row).toHaveTextContent('Effect on the club base not known')
    expect(row).not.toHaveTextContent('Doesn’t add to the club base')
  })

  it('says "next year’s club base" when the base year is after the displayed year', () => {
    const club: ReinstatableClub = {
      clubNumber: '1',
      clubName: 'Spring Club',
      status: 'suspended',
      suspendDate: '2027-03-31',
      oldestPeriod: false,
      addsToBase: true,
      reason: 'suspended_mar31_before_oct1',
    }
    render(
      <ReinstatableClubsSection
        clubs={[club]}
        baseProgramYear="2027-2028"
        programYearStart={2026}
      />
    )
    expect(rowFor('Spring Club')).toHaveTextContent(
      'Adds to next year’s club base'
    )
  })

  it('explains what it takes, links the FAQ and says Toastmasters decides', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    const note = screen.getByTestId('growth-reinstate-requirements')
    expect(note).toHaveTextContent('12 members')
    expect(note).toHaveTextContent('3 of whom were active')
    expect(note).toHaveTextContent('president, vice president and secretary')
    expect(note).toHaveTextContent('World Headquarters')
    const link = screen.getByRole('link', { name: /Club Reinstatement FAQ/ })
    expect(link).toHaveAttribute(
      'href',
      'https://toastmasters.org/footer/faq/Club'
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(
      screen.getByText(/Toastmasters International makes the final call/)
    ).toBeInTheDocument()
  })
})
