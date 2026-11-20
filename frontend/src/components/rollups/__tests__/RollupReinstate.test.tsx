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
  adds: 3,
  unknown: 0,
  card: '3 add to the club base',
  nextYear: false,
  rows: [
    {
      id: '61',
      label: 'District 61',
      to: '/district/61/growth#growth-reinstate',
      suspended: 3,
      closed: 2,
      adds: 3,
      oldest: 1,
      unknown: 0,
      total: 5,
    },
    {
      id: '86',
      label: 'District 86',
      to: '/district/86/growth#growth-reinstate',
      suspended: 0,
      closed: 2,
      adds: 0,
      oldest: 2,
      unknown: 0,
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
    expect(card).toHaveTextContent('3 add to the club base')
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
      'Adds to the club base',
      'Oldest period',
    ])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      'District 613231',
      'District 860202',
    ])
    expect(
      within(table).getByRole('link', { name: 'District 61' })
    ).toHaveAttribute('href', '/district/61/growth#growth-reinstate')
  })

  it('says Toastmasters decides, links the FAQ and explains the oldest period', () => {
    renderView(reinstate)
    const section = document.getElementById('growth-reinstate')!
    expect(section).toHaveTextContent(
      'Toastmasters International makes the final call.'
    )
    expect(section).toHaveTextContent('3 of 7 add to the club base.')
    expect(section).toHaveTextContent(/Confirm those with World Headquarters/)
    const link = within(section).getByRole('link', {
      name: /Club Reinstatement FAQ/,
    })
    expect(link).toHaveAttribute(
      'href',
      'https://toastmasters.org/footer/faq/Club'
    )
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('names next year’s club base between April 1 and June 30', () => {
    renderView({
      ...reinstate,
      nextYear: true,
      card: '3 add to next year’s club base',
    })
    const table = screen.getByTestId('rollup-growth-reinstate-table')
    expect(
      within(table).getByRole('columnheader', {
        name: 'Adds to next year’s club base',
      })
    ).toBeInTheDocument()
  })

  it('a measured zero: the card says 0 and the section says none', () => {
    renderView({
      ...reinstate,
      count: 0,
      adds: 0,
      card: '0 add to the club base',
      rows: [],
    })
    expect(screen.getByTestId('growth-stage-reinstate')).toHaveTextContent('0')
    const section = document.getElementById('growth-reinstate')!
    expect(section).toHaveTextContent(
      'No suspended or recently closed clubs can reinstate right now.'
    )
    expect(screen.queryByTestId('rollup-growth-reinstate-table')).toBeNull()
  })

  it('on a phone: rows lead with the sort key, adds, and give every count', () => {
    mobile.value = true
    renderView(reinstate)
    const section = document.getElementById('growth-reinstate')!
    expect(within(section).queryByRole('table')).toBeNull()
    const row = within(section).getByRole('link', {
      name: 'District 61: 3 add to the club base, 5 can reinstate, 3 suspended, 2 closed, 1 oldest period',
    })
    expect(row).toHaveAttribute('href', '/district/61/growth#growth-reinstate')
    expect(row.querySelector('.mobile-row__title')).toHaveTextContent(
      'District 61 — 3 add to the club base'
    )
    expect(row.querySelector('.mobile-row__meta')).toHaveTextContent(
      '5 can reinstate · 3 suspended · 2 closed · 1 oldest period'
    )
    // The large number is the sort key (adds), never the total.
    expect(row.querySelector('.mobile-row__chip')).toBeNull()
    // The CSS hook that lets the row wrap instead of clipping.
    expect(section.querySelector('.rollup-reinstate__rows')).toContainElement(
      row
    )
  })

  it('on a phone: counts the clubs whose effect isn’t known, only when there are some', () => {
    mobile.value = true
    renderView({
      ...reinstate,
      unknown: 1,
      rows: [{ ...reinstate.rows[0]!, unknown: 1 }, reinstate.rows[1]!],
    })
    const section = document.getElementById('growth-reinstate')!
    const [first, second] = within(section).getAllByRole('link', {
      name: /^District \d+:/,
    })
    expect(first!.querySelector('.mobile-row__meta')).toHaveTextContent(
      '5 can reinstate · 3 suspended · 2 closed · 1 oldest period · 1 effect on the club base not known'
    )
    expect(second!.querySelector('.mobile-row__meta')).not.toHaveTextContent(
      'not known'
    )
  })

  it('desktop: an unknown-effect column only when a row has one', () => {
    renderView({
      ...reinstate,
      unknown: 1,
      rows: [{ ...reinstate.rows[0]!, unknown: 1 }, reinstate.rows[1]!],
    })
    const table = screen.getByTestId('rollup-growth-reinstate-table')
    expect(
      within(table).getByRole('columnheader', {
        name: 'Effect on the club base not known',
      })
    ).toBeInTheDocument()
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map(r => r.textContent)
    ).toEqual(['District 6132311', 'District 8602020'])
    expect(
      screen.getByTestId('rollup-growth-reinstate-split')
    ).toHaveTextContent(
      '3 of 7 add to the club base. 1 effect on the club base not known.'
    )
  })

  it('desktop: no unknown-effect column when every effect is known', () => {
    renderView(reinstate)
    const table = screen.getByTestId('rollup-growth-reinstate-table')
    expect(
      within(table).queryByRole('columnheader', {
        name: 'Effect on the club base not known',
      })
    ).toBeNull()
  })
})
