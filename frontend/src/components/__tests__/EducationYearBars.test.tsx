/**
 * Multi-year education bars (#1807), shared by the district and region
 * education pages. One row per program year with the total printed, the
 * Legacy / Pathways / DTM / Other split stacked in the bar and printed as
 * text. A year without a ledger reads "Not available" with no bar — never 0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { EducationYearBars } from '../education/EducationYearBars'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Stub matchMedia so useIsMobile(768) resolves to the given viewport. */
const setViewport = (mobile: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: mobile,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )

const years = [
  { programYear: '2006-2007', totals: null },
  {
    programYear: '2017-2018',
    totals: { awards: 536, pathways: 80, legacy: 440, dtm: 16, other: 0 },
  },
  {
    programYear: '2026-2027',
    totals: { awards: 167, pathways: 165, legacy: 0, dtm: 2, other: 0 },
  },
]

const rows = () =>
  within(
    screen.getByRole('list', { name: 'Awards by program year' })
  ).getAllByRole('listitem')

describe('EducationYearBars (#1807)', () => {
  it('prints one row per year with its total and split', () => {
    render(<EducationYearBars years={years} programYear="2026-2027" note="n" />)
    expect(
      screen.getByRole('heading', { name: 'By program year' })
    ).toBeInTheDocument()
    expect(rows()).toHaveLength(3)
    expect(rows()[1]).toHaveTextContent('2017-18')
    expect(rows()[1]).toHaveTextContent('536')
    expect(rows()[1]).toHaveTextContent('Pathways 80 · Legacy 440 · DTM 16')
  })

  it('reads a year without a ledger as not available, with no bar', () => {
    render(<EducationYearBars years={years} programYear="2026-2027" note="n" />)
    const na = rows()[0]!
    expect(na).toHaveTextContent('2006-07')
    expect(na).toHaveTextContent('Not available')
    expect(na).not.toHaveTextContent(/\b0\b/)
    expect(na.querySelector('.education-year__track')).toBeNull()
  })

  it('marks the selected program year (R3: from props)', () => {
    render(<EducationYearBars years={years} programYear="2017-2018" note="n" />)
    expect(rows()[1]).toHaveAttribute('aria-current', 'true')
    expect(rows()[2]).not.toHaveAttribute('aria-current')
  })

  it('prints the caller’s note', () => {
    render(
      <EducationYearBars
        years={years}
        programYear="2026-2027"
        note="Each year is the whole program year."
      />
    )
    expect(
      screen.getByText('Each year is the whole program year.')
    ).toBeInTheDocument()
  })
})

describe('EducationYearBars sparkline-expand below 768 (#1793)', () => {
  const sparkline = {
    urlId: 'education-years',
    headline: '2026-27: 167 awards',
    series: [536, 167],
  }
  const renderBars = (mobile: boolean, url = '/') => {
    setViewport(mobile)
    return render(
      <MemoryRouter initialEntries={[url]}>
        <EducationYearBars
          years={years}
          programYear="2026-2027"
          note="Every ledger award."
          sparkline={sparkline}
        />
      </MemoryRouter>
    )
  }

  it('collapses to the headline and a sparkline on a phone', () => {
    renderBars(true)
    expect(
      screen.getByRole('heading', { name: 'By program year' })
    ).toBeInTheDocument()
    const trigger = screen.getByRole('button', {
      name: 'Expand Awards by program year chart',
    })
    expect(trigger).toHaveTextContent('2026-27: 167 awards')
    expect(
      screen.getByRole('img', { name: 'Awards by program year sparkline' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Awards by program year' })
    ).toBeNull()
    expect(screen.getByText('Every ledger award.')).toBeInTheDocument()
  })

  it('opens the full bars in a sheet on tap', () => {
    renderBars(true)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Expand Awards by program year chart',
      })
    )
    const sheet = screen.getByRole('dialog')
    expect(
      within(sheet).getByRole('list', { name: 'Awards by program year' })
    ).toBeInTheDocument()
  })

  it('deep-links the open sheet (?chartExpanded=education-years)', () => {
    renderBars(true, '/?chartExpanded=education-years')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the bars inline from 768 up', () => {
    renderBars(false)
    expect(
      screen.getByRole('list', { name: 'Awards by program year' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'Expand Awards by program year chart',
      })
    ).toBeNull()
  })
})
