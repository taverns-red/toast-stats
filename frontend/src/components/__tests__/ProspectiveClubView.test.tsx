/**
 * ProspectiveClubView (#2303) — one prospective club: header, charter
 * checklist as text (never a progress bar implying a sequence), the
 * sponsors/mentors note, a TI link-out and a way back to the funnel. The
 * free-text report location, website and meeting times never render.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import type {
  DistrictReportsDataset,
  ProspectiveClub,
} from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/prospective-club-page.recorded.json'
import { buildProspectiveClubPage } from '../../utils/prospectiveClubPage'
import { ProspectiveClubView } from '../ProspectiveClubView'

const d84 = recorded.d84_reports as unknown as DistrictReportsDataset
const d25 = recorded.d25_reports as unknown as DistrictReportsDataset
const fac84 = recorded.d84_findAClub as unknown as ProspectiveClub[]
const AS_OF = recorded.snapshotDate

afterEach(cleanup)

function renderClub(
  clubId: string,
  {
    reports = d84,
    districtId = '84',
    clubPageIds = new Set<string>(),
    growthQuery = '',
  }: {
    reports?: DistrictReportsDataset | null
    districtId?: string
    clubPageIds?: Set<string>
    growthQuery?: string
  } = {}
) {
  const model = buildProspectiveClubPage({
    districtId,
    clubId,
    reports,
    findAClub: fac84,
    clubPageIds,
    asOfDate: AS_OF,
  })
  return render(
    <MemoryRouter>
      <ProspectiveClubView
        model={model}
        districtId={districtId}
        asOfDate={AS_OF}
        growthQuery={growthQuery}
      />
    </MemoryRouter>
  )
}

describe('ProspectiveClubView', () => {
  it('heads the page with the club, its division/area and Find-a-Club place', () => {
    renderClub('28679702')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Prospective Club 84-3' })
    ).toBeInTheDocument()
    expect(screen.getByText('C / 31')).toBeInTheDocument()
    expect(
      screen.getByText('Cityville 3, ST, United States')
    ).toBeInTheDocument()
    expect(screen.getByText(/October 28, 2026/)).toBeInTheDocument()
  })

  it('says a club with no division yet is not yet assigned, and no place', () => {
    renderClub('28679424')
    expect(screen.getByText('Not yet assigned')).toBeInTheDocument()
    expect(screen.getByText(/not listed on Find a Club/i)).toBeInTheDocument()
  })

  it('never renders the report location, website or meeting times', () => {
    for (const id of ['28679702', '28679424', '28680214', '28681056']) {
      const { container, unmount } = renderClub(id)
      const text = container.textContent ?? ''
      const html = container.innerHTML
      expect(text).not.toMatch(/LOCATION-TEXT/)
      expect(html).not.toMatch(/WEBSITE/)
      expect(text).not.toMatch(/MEETING-/)
      expect(text).not.toMatch(/meets|meeting time/i)
      unmount()
    }
  })

  it('lists the charter checklist as text: status, last-changed date, days', () => {
    renderClub('28680093', { reports: d25, districtId: '25' })
    const list = screen.getByRole('list', { name: /charter checklist/i })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(7)
    expect(items[0]).toHaveTextContent('#1 Application to Organize')
    expect(items[0]).toHaveTextContent('Complete')
    expect(items[1]).toHaveTextContent('#2 Certificate & Remit')
    expect(items[1]).toHaveTextContent('Incomplete')
    expect(items[1]).toHaveTextContent('Aug 14, 2026')
    expect(items[1]).toHaveTextContent('74 days')
    expect(items[6]).toHaveTextContent('Payment')
    expect(items[6]).toHaveTextContent('Complete')
    // A checklist, not a progress bar implying a sequence.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('says a step TI does not print is not listed', () => {
    renderClub('28681056')
    const items = within(
      screen.getByRole('list', { name: /charter checklist/i })
    ).getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('Not listed')
    expect(items[6]).toHaveTextContent('Incomplete')
  })

  it('says TI reports sponsors and mentors only after charter — no counts', () => {
    renderClub('28679702')
    expect(
      screen.getByText(
        /TI doesn.t report sponsors or mentors until a club charters/i
      )
    ).toBeInTheDocument()
  })

  it('links out to toastmasters.org and back to the funnel, keeping py/date', () => {
    renderClub('28679702', { growthQuery: '?py=2026&date=2026-10-27' })
    const ti = screen.getByRole('link', { name: /toastmasters\.org/i })
    expect(ti).toHaveAttribute(
      'href',
      'https://www.toastmasters.org/Find-a-Club/28679702'
    )
    expect(ti).toHaveAttribute('target', '_blank')
    expect(
      screen.getByRole('link', { name: /back to prospective clubs/i })
    ).toHaveAttribute(
      'href',
      '/district/84/growth?py=2026&date=2026-10-27#growth-prospective'
    )
  })

  it('says a club off this date’s list is not a prospective club then', () => {
    renderClub('99999999')
    expect(
      screen.getByText(/not a prospective club on Oct 27, 2026/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /back to prospective clubs/i })
    ).toBeInTheDocument()
  })

  it('links a club that has since chartered to its club page here', () => {
    renderClub('1234567', { clubPageIds: new Set(['1234567']) })
    expect(screen.getByRole('link', { name: /club page/i })).toHaveAttribute(
      'href',
      '/district/84/club/1234567'
    )
  })

  it('says the report is not available for a date without one', () => {
    renderClub('28679702', { reports: null })
    expect(screen.getByText(/not available for this date/i)).toBeInTheDocument()
  })
})
