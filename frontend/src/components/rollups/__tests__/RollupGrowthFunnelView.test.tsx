/**
 * RollupGrowthFunnelView on a phone (#1812, #1813): each stage's breakdown
 * is compact rows, each a link to the child's own funnel at that stage, and
 * the row's accessible name carries the full counts (the meta line can clip).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  RegionRollupsSchema,
  ReportsRollupsSchema,
} from '@taverns-red/shared-contracts'
import { RollupGrowthFunnelView } from '../RollupGrowthFunnelView'
import { buildRollupGrowthFunnel } from '../../../utils/rollupGrowthFunnel'
import reportsRecorded from '../../../__tests__/fixtures/reports-rollups-2026-10-15.recorded.json'
import rollupsRecorded from '../../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'
import checklistBuilt from '../../../__tests__/fixtures/reports-rollups-2026-10-27-checklist.built.json'

vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

afterEach(cleanup)

const funnel = buildRollupGrowthFunnel({
  reports: ReportsRollupsSchema.parse(reportsRecorded),
  rollups: RegionRollupsSchema.parse(rollupsRecorded),
  scope: { kind: 'region', regionId: '05' },
})

describe('RollupGrowthFunnelView (phone)', () => {
  it('renders each stage breakdown as linked rows with full counts', () => {
    render(
      <MemoryRouter>
        <RollupGrowthFunnelView
          funnel={funnel}
          scopeLabel="in Region 05"
          childNoun="District"
          asOfDate="2026-10-15"
        />
      </MemoryRouter>
    )
    const chartered = document.getElementById('growth-chartered')!
    const row = within(chartered).getByRole('link', {
      name: 'District 61: chartered 0, 12 sponsors, 13 mentors',
    })
    expect(row).toHaveAttribute('href', '/district/61/growth#growth-chartered')
    const suspended = document.getElementById('growth-suspended')!
    expect(
      within(suspended).getByRole('link', { name: 'District 216: suspended 2' })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^District 61:/ })).toHaveLength(
      4
    )
  })
})

/* #2388 — the region/world funnel prints prospective clubs by checklist steps
   complete when the date's artifact carries them (1.1.0), and keeps the
   by-stage table for past dates (1.0.0), saying why. */
describe('RollupGrowthFunnelView — prospective progress (#2388)', () => {
  function renderFunnel(f: ReturnType<typeof buildRollupGrowthFunnel>) {
    return render(
      <MemoryRouter>
        <RollupGrowthFunnelView
          funnel={f}
          scopeLabel="in Region 09"
          childNoun="District"
          asOfDate="2026-10-27"
        />
      </MemoryRouter>
    )
  }

  it('a 1.1.0 date: a by-progress table, no by-stage table', () => {
    renderFunnel(
      buildRollupGrowthFunnel({
        reports: ReportsRollupsSchema.parse(checklistBuilt),
        rollups: null,
        scope: { kind: 'region', regionId: '09' },
      })
    )
    const table = screen.getByTestId('rollup-growth-progress-table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringMatching(/^5 of 6 steps complete.*1$/),
      expect.stringMatching(/^3 of 6 steps complete.*1$/),
      expect.stringMatching(/^1 of 6 steps complete.*4$/),
    ])
    expect(screen.queryByTestId('rollup-growth-ladder-table')).toBeNull()
  })

  it('a 1.0.0 date: the by-stage table, with a note that it predates the checklist reading', () => {
    renderFunnel(funnel)
    expect(screen.getByTestId('rollup-growth-ladder-table')).toBeInTheDocument()
    expect(screen.queryByTestId('rollup-growth-progress-table')).toBeNull()
    expect(screen.getByTestId('rollup-growth-ladder-note')).toHaveTextContent(
      /steps complete.*not available for this date/i
    )
  })
})
