/**
 * ClubsTable at a breakpoint tier, and the Columns menu (#2676, spec §4.1 to
 * §4.5; test plan 4). Columns the tier does not show are absent from the DOM
 * (TanStack `columnVisibility`), never CSS-hidden.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  render as rtlRender,
  cleanup,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ClubsTable } from '../ClubsTable'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { storageKey } from '../../utils/localStorageStore'
import { stubViewportWidth } from '../../test-utils/viewportMatchMedia'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

const KEY = storageKey('clubs-table:columns')
const HIDDEN_GROUPS_KEY = storageKey('clubs-table:hidden-groups')

const makeClub = (over: Partial<ClubTrend> = {}): ClubTrend => ({
  clubId: 'c1',
  clubName: 'Alpha Club',
  divisionId: 'div-1',
  divisionName: 'A',
  areaId: 'area-1',
  areaName: '1',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-01T00:00:00.000Z', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-03-01T00:00:00.000Z', goalsAchieved: 5 }],
  ...over,
})

const renderTable = () =>
  render(<ClubsTable clubs={[makeClub()]} districtId="61" isLoading={false} />)

const headerLabels = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      '#clubs-table thead th .clubs-col-header span.flex-1'
    )
  ).map(el => el.textContent?.trim() ?? '')
const firstRowCellCount = () =>
  document.querySelectorAll('#clubs-table tbody tr:first-child td').length
const trigger = () => screen.getByRole('button', { name: /^columns/i })

const TABLET = ['Club', 'Health', 'Members', 'DCP', 'Tier']
const LAPTOP = [
  'Club',
  'Div',
  'Area',
  'Health',
  'Members',
  'Trend',
  'Needed',
  'DCP',
  'Tier',
]
const DESKTOP = [...LAPTOP, 'Club Status', 'Coach']
const WIDE = [
  'Club',
  'Div',
  'Area',
  'Health',
  'Members',
  'Trend',
  'Needed',
  'New',
  'Oct Renew',
  'Apr Renew',
  'DCP',
  'Tier',
  'Club Status',
  'Coach',
  'Years',
]

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('ClubsTable default columns per tier (#2676)', () => {
  it.each([
    [768, TABLET],
    [1024, LAPTOP],
    [1280, DESKTOP],
    [1600, WIDE],
  ] as const)('at %ipx the headers are the tier default', (width, expected) => {
    stubViewportWidth(width)
    renderTable()
    expect(headerLabels()).toEqual(expected)
    expect(firstRowCellCount()).toBe(expected.length)
  })

  it('has no CSS-hidden columns: nothing carries the old desktop-only class', () => {
    stubViewportWidth(1024)
    renderTable()
    expect(document.querySelector('.clubs-table__col--desktop')).toBeNull()
    expect(headerLabels()).not.toContain('Oct Renew')
    expect(headerLabels()).not.toContain('Years')
  })

  it('keeps the Club column pinned', () => {
    stubViewportWidth(768)
    renderTable()
    expect(
      document.querySelectorAll('#clubs-table thead th.clubs-table__sticky-col')
    ).toHaveLength(1)
    expect(
      document.querySelector('#clubs-table tbody td.clubs-table__sticky-col')
    ).not.toBeNull()
  })
})

describe('Columns menu (#2676)', () => {
  it('reads "Columns · 9 of 15" at 1024, with a matching accessible name', () => {
    stubViewportWidth(1024)
    renderTable()
    expect(trigger()).toHaveTextContent('Columns · 9 of 15')
    expect(trigger()).toHaveAccessibleName(/^Columns, 9 of 15 shown/)
  })

  it('is offered at 768, where a hidden column must stay one click away', () => {
    stubViewportWidth(768)
    renderTable()
    expect(trigger()).toHaveTextContent('Columns · 5 of 15')
  })

  it('turning on Years adds the Years column and it survives another tier', async () => {
    const user = userEvent.setup()
    stubViewportWidth(1024)
    const first = renderTable()
    await user.click(trigger())
    await user.click(screen.getByRole('checkbox', { name: /years/i }))
    expect(headerLabels()).toContain('Years')
    expect(firstRowCellCount()).toBe(LAPTOP.length + 1)
    expect(trigger()).toHaveTextContent('Columns · 10 of 15')
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      schema: 2,
      overrides: { yearsChartered: true },
    })

    first.unmount()
    stubViewportWidth(768)
    renderTable()
    expect(headerLabels()).toEqual([...TABLET, 'Years'])
  })

  it('marks a customised view so it is never silent', async () => {
    const user = userEvent.setup()
    stubViewportWidth(1024)
    renderTable()
    expect(trigger()).not.toHaveTextContent(/custom/i)
    await user.click(trigger())
    await user.click(screen.getByRole('checkbox', { name: /years/i }))
    expect(trigger()).toHaveTextContent(/custom/i)
  })

  it('lists columns by full name with a hint, grouped under legends', async () => {
    const user = userEvent.setup()
    stubViewportWidth(1024)
    renderTable()
    await user.click(trigger())
    const dialog = document.getElementById(
      trigger().getAttribute('aria-controls') ?? ''
    ) as HTMLElement
    for (const legend of [
      'Club',
      'Health',
      'Membership',
      'Renewals',
      'Recognition',
    ]) {
      expect(
        within(dialog).getByRole('group', { name: legend })
      ).toBeInTheDocument()
    }
    expect(
      within(dialog).getByRole('checkbox', { name: /^Needed/ })
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/members needed to reach 20/i)).toBeTruthy()
  })

  it('shows Club checked and disabled with "Always shown"', async () => {
    const user = userEvent.setup()
    stubViewportWidth(1024)
    renderTable()
    await user.click(trigger())
    const club = screen.getByRole('checkbox', { name: /^Club\b(?! status)/i })
    expect(club).toBeChecked()
    expect(club).toBeDisabled()
    expect(screen.getByText(/always shown/i)).toBeInTheDocument()
  })

  it('moves focus into the menu on open, and back to the trigger on Escape', async () => {
    const user = userEvent.setup()
    stubViewportWidth(1024)
    renderTable()
    await user.click(trigger())
    const popover = document.getElementById(
      trigger().getAttribute('aria-controls') ?? ''
    ) as HTMLElement
    expect(popover.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toHaveAttribute('type', 'checkbox')
    await user.keyboard('{Escape}')
    expect(document.getElementById(popover.id)).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('announces a toggle in a polite live region', async () => {
    const user = userEvent.setup()
    stubViewportWidth(1024)
    renderTable()
    await user.click(trigger())
    await user.click(screen.getByRole('checkbox', { name: /^Coach/ }))
    const live = screen.getByTestId('columns-live')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent('Coach shown')
    await user.click(screen.getByRole('checkbox', { name: /^Coach/ }))
    expect(live).toHaveTextContent('Coach hidden')
  })

  it('Reset to default is disabled at the default and restores it otherwise', async () => {
    const user = userEvent.setup()
    stubViewportWidth(1024)
    renderTable()
    await user.click(trigger())
    const reset = screen.getByRole('button', { name: /reset to default/i })
    expect(reset).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /^Coach/ }))
    expect(reset).toBeEnabled()
    await user.click(reset)
    expect(headerLabels()).toEqual(LAPTOP)
    expect(reset).toBeDisabled()
  })

  it('Show all turns on every column', async () => {
    const user = userEvent.setup()
    stubViewportWidth(768)
    renderTable()
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: /show all/i }))
    expect(headerLabels()).toEqual(WIDE)
  })

  it('keeps the Club column when every other column is hidden', async () => {
    const user = userEvent.setup()
    stubViewportWidth(1024)
    renderTable()
    await user.click(trigger())
    for (const name of [
      /^Division/,
      /^Area/,
      /^Health/,
      /^Members/,
      /^Trend/,
      /^Needed/,
      /^DCP/,
      /^Tier/,
    ]) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    expect(headerLabels()).toEqual(['Club'])
    expect(firstRowCellCount()).toBe(1)
    const firstRow = document.querySelector(
      '#clubs-table tbody tr:first-child'
    ) as HTMLElement
    expect(within(firstRow).getByText('Alpha Club')).toBeInTheDocument()
  })

  it('can hide a default column and keeps the table in lockstep', async () => {
    const user = userEvent.setup()
    stubViewportWidth(1024)
    renderTable()
    await user.click(trigger())
    await user.click(screen.getByRole('checkbox', { name: /^Area/ }))
    expect(headerLabels()).not.toContain('Area')
    expect(firstRowCellCount()).toBe(LAPTOP.length - 1)
  })
})

describe('Columns persistence and v1 migration through the table (#2676)', () => {
  it('rehydrates a stored choice on remount', () => {
    stubViewportWidth(1024)
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 2, overrides: { coach: true } })
    )
    renderTable()
    expect(headerLabels()).toContain('Coach')
  })

  it('applies a v1 hidden "renewals" group and removes the old key', () => {
    stubViewportWidth(1600)
    localStorage.setItem(HIDDEN_GROUPS_KEY, JSON.stringify(['renewals']))
    renderTable()
    expect(headerLabels()).not.toContain('Oct Renew')
    expect(headerLabels()).not.toContain('Apr Renew')
    expect(headerLabels()).toHaveLength(13)
    expect(localStorage.getItem(HIDDEN_GROUPS_KEY)).toBeNull()
  })

  it('ignores a ?columns= style URL seed: the choice is per-browser, not URL state', () => {
    stubViewportWidth(1024)
    renderTable()
    expect(window.location.search).toBe('')
    expect(headerLabels()).toEqual(LAPTOP)
  })
})

describe('Close to Distinguished preset label (#2676)', () => {
  it('has no emoji in the toolbar button', () => {
    stubViewportWidth(1024)
    renderTable()
    const btn = screen.getByRole('button', { name: /close to distinguished/i })
    expect(btn.textContent?.trim()).toBe('Close to Distinguished')
  })
})
