/**
 * DistrictEducationView (#1793) — the district Education page body. Values
 * are text (bars are decorative), the level/path views and the rollup level
 * are URL state (links, not tabs), "not measured" never prints 0, and the
 * matrix is Pathways only with a tap-to-read cell readout.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import '@testing-library/jest-dom'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import recordedD61 from '../../__tests__/fixtures/d61-education-reports.recorded.json'
import recordedClubs from '../../__tests__/fixtures/d61-education-clubs.recorded.json'
import recordedArchive from '../../__tests__/fixtures/d111-education-archive-2019-2020.recorded.json'
import {
  buildDistrictEducation,
  type EducationClub,
} from '../../utils/districtEducation'
import { DistrictEducationView } from '../DistrictEducationView'

const d61 = recordedD61 as unknown as DistrictReportsDataset
const archive = recordedArchive as unknown as DistrictReportsDataset
const clubs = (recordedClubs as { clubs: EducationClub[] }).clubs

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

const LocationProbe = () => {
  const loc = useLocation()
  return <div data-testid="loc">{loc.search}</div>
}

function renderView({
  url = '/district/61/education',
  reports = d61,
  programYear = '2026-2027',
  clubList = clubs,
  isPriorProgramYear = false,
}: {
  url?: string
  reports?: DistrictReportsDataset | null
  programYear?: string
  clubList?: EducationClub[]
  isPriorProgramYear?: boolean
} = {}) {
  const education = buildDistrictEducation({
    reports,
    programYear,
    clubs: clubList,
  })
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/district/:districtId/education"
          element={
            <>
              <DistrictEducationView
                education={education}
                snapshotDate="2026-10-13"
                isPriorProgramYear={isPriorProgramYear}
              />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('DistrictEducationView', () => {
  beforeEach(() => stubMobile(false))
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('KPI strip: the five figures as text', () => {
    renderView()
    const strip = screen.getByRole('list', { name: /education at a glance/i })
    const items = within(strip).getAllByRole('listitem')
    expect(items.map(i => i.textContent)).toEqual([
      expect.stringMatching(/Awards this year.*297/),
      expect.stringMatching(/Members with an award.*229/),
      expect.stringMatching(/DTMs.*4/),
      expect.stringMatching(/Triple Crown.*9/),
      expect.stringMatching(/Awards per base member.*0\.10/),
    ])
  })

  it('a section the dataset lacks reads "Not measured", never 0', () => {
    renderView({ reports: archive, programYear: '2019-2020', clubList: [] })
    const strip = screen.getByRole('list', { name: /education at a glance/i })
    const members = within(strip)
      .getByText(/Members with an award/)
      .closest('li')!
    expect(members).toHaveTextContent(/Not measured/)
    expect(members).not.toHaveTextContent(/\b0\b/)
  })

  it('stacks Legacy and Pathways in the all-awards bar', () => {
    renderView({ reports: archive, programYear: '2019-2020', clubList: [] })
    const legend = screen.getByRole('list', { name: /awards by program/i })
    expect(legend).toHaveTextContent(/Pathways\s*294/)
    expect(legend).toHaveTextContent(/Legacy\s*81/)
    expect(legend).toHaveTextContent(/DTM\s*2/)
  })

  it('by level (default): six rows, a row expands into its path chips', () => {
    renderView()
    const rows = screen.getByRole('list', { name: /awards by level/i })
    const buttons = within(rows).getAllByRole('button')
    expect(buttons.map(b => b.textContent)).toEqual([
      expect.stringMatching(/Level 1.*88/),
      expect.stringMatching(/Level 2.*79/),
      expect.stringMatching(/Level 3.*38/),
      expect.stringMatching(/Level 4.*45/),
      expect.stringMatching(/Level 5.*43/),
      expect.stringMatching(/DTM.*4/),
    ])
    const l1 = buttons[0]!
    expect(l1).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(l1)
    expect(l1).toHaveAttribute('aria-expanded', 'true')
    const chips = screen.getByRole('list', { name: /level 1 by path/i })
    expect(within(chips).getAllByRole('listitem')[0]).toHaveTextContent(
      /PM.*39/
    )
  })

  it('?by=path: one row per path with its total, same route', () => {
    renderView({ url: '/district/61/education?by=path' })
    const rows = screen.getByRole('list', { name: /awards by path/i })
    const items = within(rows).getAllByRole('listitem')
    expect(items).toHaveLength(12) // the 11 paths + BT from the live feed
    expect(
      items.find(i => /Presentation Mastery/.test(i.textContent ?? ''))
    ).toHaveTextContent(/106/)
  })

  it('the view switch is links that set ?by= (URL state, not tabs)', () => {
    renderView()
    expect(screen.queryByRole('tab')).toBeNull()
    const byPath = screen.getByRole('link', { name: 'By path' })
    expect(byPath.getAttribute('href')).toMatch(/\?by=path$/)
    expect(screen.getByRole('link', { name: 'By level' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    fireEvent.click(byPath)
    expect(screen.getByTestId('loc')).toHaveTextContent('?by=path')
  })

  it('≥768 shows the Pathways-only matrix inline; a cell tap highlights and reads out', () => {
    renderView()
    const matrix = screen.getByRole('table', { name: /level × path/i })
    const pmRow = within(matrix)
      .getByRole('rowheader', {
        name: /Presentation Mastery/,
      })
      .closest('tr')!
    const cells = within(pmRow).getAllByRole('button')
    expect(cells.map(c => c.textContent)).toEqual(['39', '33', '15', '11', '8'])
    fireEvent.click(cells[0]!)
    expect(screen.getByTestId('education-matrix-readout')).toHaveTextContent(
      'Presentation Mastery · Level 1: 39 awards'
    )
    expect(pmRow).toHaveClass('is-highlighted')
    // Totals row sums Pathways only.
    const foot = within(matrix).getByRole('rowheader', { name: 'Total' })
    expect(foot.closest('tr')).toHaveTextContent(/88.*79.*38.*45.*43.*293/)
  })

  it('<768 puts the matrix behind "Open matrix" in a labelled sheet region', () => {
    stubMobile(true)
    renderView()
    expect(screen.queryByRole('table', { name: /level × path/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /open matrix/i }))
    const dialog = screen.getByRole('dialog', { name: /level × path/i })
    const region = within(dialog).getByRole('region', {
      name: /level × path/i,
    })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(
      within(region).getByRole('table', { name: /level × path/i })
    ).toBeInTheDocument()
  })

  it('division rollup by default; ?rollup=area switches to areas via a link', () => {
    renderView()
    const table = screen.getByRole('table', { name: /education by division/i })
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 8)
    const toArea = screen.getByRole('link', { name: 'Areas' })
    expect(toArea.getAttribute('href')).toMatch(/rollup=area/)
    fireEvent.click(toArea)
    expect(
      within(
        screen.getByRole('table', { name: /education by area/i })
      ).getAllByRole('row')
    ).toHaveLength(1 + 34)
  })

  it('rollup headers sort through the shared SortableHeader (URL-synced)', () => {
    renderView()
    const table = screen.getByRole('table', { name: /education by division/i })
    fireEvent.click(
      within(table).getByRole('button', { name: /Sort by Awards/ })
    )
    expect(screen.getByTestId('loc').textContent).toMatch(/sort=awards/)
    const first = within(table).getAllByRole('row')[1]!
    expect(first).toHaveTextContent(/Division F/)
  })

  it('provenance: the report and its as-of beside the snapshot date', () => {
    renderView()
    expect(screen.getByTestId('education-provenance')).toHaveTextContent(
      'Source: TI Education Achievements report, as of October 14, 2026 · snapshot 2026-10-13'
    )
  })

  it('not available says why, and is not a page of zeros', () => {
    renderView({ reports: null })
    expect(screen.getByRole('status')).toHaveTextContent(
      /No education report for this date/
    )
    expect(
      screen.queryByRole('list', { name: /education at a glance/i })
    ).toBeNull()
  })

  it('a prior program year explains the June 30 year-end snapshot', () => {
    renderView({ reports: null, isPriorProgramYear: true })
    expect(screen.getByRole('status')).toHaveTextContent(/June 30/)
  })
})
