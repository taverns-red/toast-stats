/**
 * #3094 — the "Can reinstate" card and its by-district breakdown on the
 * region and world Club Growth funnels. `reinstate === null` (the date has
 * no file) shows four cards and no section; a measured zero shows the card
 * at 0 and says so; otherwise a table on desktop and stacked rows on phones.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  RegionRollupsSchema,
  ReportsRollupsSchema,
} from '@taverns-red/shared-contracts'
import { RollupGrowthFunnelView } from '../RollupGrowthFunnelView'
import { buildRollupGrowthFunnel } from '../../../utils/rollupGrowthFunnel'
import type { RollupReinstate } from '../../../utils/rollupReinstate'
import reportsRecorded from '../../../__tests__/fixtures/reports-rollups-2026-10-15.recorded.json'
import rollupsRecorded from '../../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../../hooks/useIsMobile', () => ({
  useIsMobile: () => mobile.value,
}))

beforeEach(() => {
  mobile.value = false
})
afterEach(cleanup)

const funnel = buildRollupGrowthFunnel({
  reports: ReportsRollupsSchema.parse(reportsRecorded),
  rollups: RegionRollupsSchema.parse(rollupsRecorded),
  scope: { kind: 'region', regionId: '05' },
})

const reinstate: RollupReinstate = {
  count: 7,
  netGrowth: 4,
  card: '4 add to net club growth',
  rows: [
    {
      id: '61',
      label: 'District 61',
      to: '/district/61/growth#growth-reinstate',
      suspended: 3,
      closed: 2,
      netGrowth: 2,
      total: 5,
    },
    {
      id: '86',
      label: 'District 86',
      to: '/district/86/growth#growth-reinstate',
      suspended: 0,
      closed: 2,
      netGrowth: 2,
      total: 2,
    },
  ],
}

function renderView(r: RollupReinstate | null) {
  return render(
    <MemoryRouter>
      <RollupGrowthFunnelView
        funnel={funnel}
        scopeLabel="in Region 05"
        childNoun="District"
        asOfDate="2026-11-18"
        reinstate={r}
      />
    </MemoryRouter>
  )
}

const strip = () => screen.getByRole('list', { name: 'Club Growth funnel' })

describe('RollupGrowthFunnelView — Can reinstate (#3094)', () => {
  it('no file for the date: four cards and no section', () => {
    renderView(null)
    expect(within(strip()).getAllByRole('listitem')).toHaveLength(4)
    expect(document.getElementById('growth-reinstate')).toBeNull()
  })

  it('a fifth card with the count, the hint and the split, linking to its section', () => {
    renderView(reinstate)
    const cards = within(strip()).getAllByRole('listitem')
    expect(cards).toHaveLength(5)
    const card = screen.getByTestId('growth-stage-reinstate')
    expect(card).toHaveTextContent('Can reinstate')
    expect(card).toHaveTextContent('7')
    expect(card).toHaveTextContent(
      'suspended or recently closed clubs that can come back'
    )
    expect(card).toHaveTextContent('4 add to net club growth')
    expect(within(card).getByRole('link')).toHaveAttribute(
      'href',
      '#growth-reinstate'
    )
    expect(document.getElementById('growth-reinstate')).not.toBeNull()
  })

  it('breaks the count down by district, each linking to its section', () => {
    renderView(reinstate)
    const section = document.getElementById('growth-reinstate')!
    expect(
      within(section).getByRole('heading', { name: 'Can reinstate (7)' })
    ).toBeInTheDocument()
    const table = within(section).getByTestId('rollup-growth-reinstate-table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent)
    expect(headers).toEqual([
      'District',
      'Suspended',
      'Closed',
      'Adds to net club growth',
    ])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      'District 61322',
      'District 86022',
    ])
    expect(
      within(table).getByRole('link', { name: 'District 61' })
    ).toHaveAttribute('href', '/district/61/growth#growth-reinstate')
  })

  it('says Toastmasters decides and links the FAQ, with no oldest period (#3103)', () => {
    renderView(reinstate)
    const section = document.getElementById('growth-reinstate')!
    expect(section).toHaveTextContent(
      'Toastmasters International makes the final call.'
    )
    // #3130: the same n as the card.
    expect(section).toHaveTextContent('4 of 7 add to net club growth.')
    // Ron's approved intro (2026-11-20, #3103), the same as the district's.
    expect(section).toHaveTextContent(
      'A suspended or closed club can reinstate until the end of its fifth renewal period, counting the period it was suspended in. Toastmasters International makes the final call.'
    )
    expect(section).not.toHaveTextContent(/oldest/i)
    const link = within(section).getByRole('link', {
      name: /Club Reinstatement FAQ/,
    })
    expect(link).toHaveAttribute(
      'href',
      'https://toastmasters.org/footer/faq/Club'
    )
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('says what it takes and where to send it, as the district does (#3100)', () => {
    renderView(reinstate)
    const section = document.getElementById('growth-reinstate')!
    const steps = within(section).getByTestId('growth-reinstate-requirements')
    expect(
      within(steps).getByRole('heading', { name: 'What it takes' })
    ).toBeInTheDocument()
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3)
    expect(
      within(steps).getByRole('link', { name: 'renewals@toastmasters.org' })
    ).toHaveAttribute('href', 'mailto:renewals@toastmasters.org')
    expect(
      within(steps).getByRole('link', { name: '+1 720-439-5050' })
    ).toHaveAttribute('href', 'tel:+17204395050')
  })

  it('always names this year’s club base, never next year’s (Ron, 2026-11-20)', () => {
    renderView(reinstate)
    const table = screen.getByTestId('rollup-growth-reinstate-table')
    expect(
      within(table).getByRole('columnheader', {
        name: 'Adds to net club growth',
      })
    ).toBeInTheDocument()
    expect(document.getElementById('growth-reinstate')).not.toHaveTextContent(
      /next year/i
    )
  })

  it('a measured zero: the card says 0 and the section says none', () => {
    renderView({
      ...reinstate,
      count: 0,
      netGrowth: 0,
      card: '0 add to net club growth',
      rows: [],
    })
    expect(screen.getByTestId('growth-stage-reinstate')).toHaveTextContent('0')
    const section = document.getElementById('growth-reinstate')!
    expect(section).toHaveTextContent(
      'No suspended or recently closed clubs can reinstate right now.'
    )
    expect(screen.queryByTestId('rollup-growth-reinstate-table')).toBeNull()
  })

  it('on a phone: rows lead with the sort key, net club growth, and give every count', () => {
    mobile.value = true
    renderView(reinstate)
    const section = document.getElementById('growth-reinstate')!
    expect(within(section).queryByRole('table')).toBeNull()
    const row = within(section).getByRole('link', {
      name: 'District 61: 2 add to net club growth, 5 can reinstate, 3 suspended, 2 closed',
    })
    expect(row).toHaveAttribute('href', '/district/61/growth#growth-reinstate')
    expect(row.querySelector('.mobile-row__title')).toHaveTextContent(
      'District 61 — 2 add to net club growth'
    )
    expect(row.querySelector('.mobile-row__meta')).toHaveTextContent(
      '5 can reinstate · 3 suspended · 2 closed'
    )
    // The large number is the sort key (net club growth), never the total.
    expect(row.querySelector('.mobile-row__chip')).toBeNull()
    // The CSS hook that lets the row wrap instead of clipping.
    expect(section.querySelector('.rollup-reinstate__rows')).toContainElement(
      row
    )
  })

  it('one club: the phone row and the split say "1 adds to net club growth" (#3130)', () => {
    mobile.value = true
    renderView({
      ...reinstate,
      count: 1,
      netGrowth: 1,
      card: '1 adds to net club growth',
      rows: [{ ...reinstate.rows[1]!, closed: 1, netGrowth: 1, total: 1 }],
    })
    const section = document.getElementById('growth-reinstate')!
    const row = within(section).getByRole('link', {
      name: 'District 86: 1 adds to net club growth, 1 can reinstate, 0 suspended, 1 closed',
    })
    expect(row.querySelector('.mobile-row__title')).toHaveTextContent(
      'District 86 — 1 adds to net club growth'
    )
    expect(
      screen.getByTestId('rollup-growth-reinstate-split')
    ).toHaveTextContent('1 of 1 adds to net club growth.')
  })

  // A retired district's growth page has no current data, so no link.
  const withRetired: RollupReinstate = {
    ...reinstate,
    count: 9,
    rows: [
      ...reinstate.rows,
      {
        id: '124',
        label: 'District 124',
        retiredNote: 'District 124 was retired on July 1, 2026.',
        suspended: 0,
        closed: 2,
        netGrowth: 0,
        total: 2,
      },
    ],
  }

  it('a retired district: the note on its row, and no link (#3101)', () => {
    renderView(withRetired)
    const table = screen.getByTestId('rollup-growth-reinstate-table')
    const row = within(table).getAllByRole('row')[3]!
    expect(row).toHaveTextContent('District 124')
    expect(row).toHaveTextContent('District 124 was retired on July 1, 2026.')
    expect(within(row).queryByRole('link')).toBeNull()
    expect(within(table).getAllByRole('link')).toHaveLength(2)
  })

  it('a retired district on a phone: a row with the note that links nowhere (#3101)', () => {
    mobile.value = true
    renderView(withRetired)
    const section = document.getElementById('growth-reinstate')!
    const rows = within(section).getAllByRole('listitem')
    const retiredRow = rows.find(li =>
      li.textContent?.includes('District 124 —')
    )!
    // The note replaces the counts on line 2, so the row stays one line
    // of meta and keeps the 56-64 px row height.
    const meta = retiredRow.querySelector('.mobile-row__meta')!
    expect(meta.textContent).toBe('District 124 was retired on July 1, 2026.')
    expect(meta).not.toHaveTextContent('can reinstate')
    expect(within(retiredRow).queryByRole('link')).toBeNull()
    expect(
      within(section).getAllByRole('link', { name: /^District (61|86):/ })
    ).toHaveLength(2)
  })

  it('never mentions an unknown effect on the club base, on a desktop or a phone (#3103)', () => {
    renderView(reinstate)
    const table = screen.getByTestId('rollup-growth-reinstate-table')
    expect(
      within(table).queryByRole('columnheader', {
        name: 'Effect on the club base not known',
      })
    ).toBeNull()
    expect(
      screen.getByTestId('rollup-growth-reinstate-split')
    ).not.toHaveTextContent('not known')
    cleanup()
    mobile.value = true
    renderView(reinstate)
    const section = document.getElementById('growth-reinstate')!
    expect(section).not.toHaveTextContent('not known')
  })
})
