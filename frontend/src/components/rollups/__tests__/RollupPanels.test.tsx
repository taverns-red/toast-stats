/**
 * RollupPanels (#1815) — KPI tiles plus the health, status, distinguished
 * and compliance panels of one rollup block. Fixture: recorded prod
 * 2026-10-15. A null figure renders "Not available", never 0.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import {
  RegionRollupsSchema,
  type RegionRollupFigures,
} from '@taverns-red/shared-contracts'
import recorded from '../../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'
import { RollupPanels } from '../RollupPanels'

const isMobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../../hooks/useIsMobile', () => ({
  useIsMobile: () => isMobile.value,
}))

const world = RegionRollupsSchema.parse(recorded).world

afterEach(() => {
  cleanup()
  isMobile.value = false
})

const renderPanels = (
  figures: RegionRollupFigures,
  snapshotDate = '2026-10-15'
) =>
  render(
    <RollupPanels
      figures={figures}
      programYear="2026-2027"
      snapshotDate={snapshotDate}
      scopeLabel="worldwide"
    />
  )

describe('RollupPanels', () => {
  it('shows the four KPI tiles', () => {
    renderPanels(world)
    const kpis = screen.getByTestId('rollup-kpis')
    expect(within(kpis).getByText('14,524')).toBeInTheDocument()
    expect(within(kpis).getByText('208,939')).toBeInTheDocument()
    expect(within(kpis).getByText('292,524')).toBeInTheDocument()
    expect(within(kpis).getByText('527')).toBeInTheDocument()
  })

  it('shows each section with counts and shares', () => {
    renderPanels(world)
    const health = screen.getByTestId('rollup-section-health')
    const row = within(health).getByTestId('rollup-row-interventionRequired')
    expect(row).toHaveTextContent('6,368')
    expect(row).toHaveTextContent('44%')
    for (const id of ['status', 'distinguished', 'compliance']) {
      expect(screen.getByTestId(`rollup-section-${id}`)).toBeInTheDocument()
    }
  })

  it('renders a null figure as Not available, not 0', () => {
    renderPanels({
      ...world,
      compliance: { ...world.compliance, officerListOnTime: null },
    })
    const row = screen.getByTestId('rollup-row-officerListOnTime')
    expect(row).toHaveTextContent('Not available')
    expect(row).not.toHaveTextContent(/\b0\b/)
  })

  it('says April renewals are not yet due in October', () => {
    renderPanels(world)
    expect(screen.getByTestId('rollup-row-aprilDuesOnTime')).toHaveTextContent(
      'Not yet due (April 2027)'
    )
  })

  it('places the attention slot between the KPI tiles and the sections (hub §5.5)', () => {
    render(
      <RollupPanels
        figures={world}
        programYear="2026-2027"
        snapshotDate="2026-10-15"
        scopeLabel="worldwide"
        attention={<div data-testid="slot">attention</div>}
      />
    )
    const kpis = screen.getByTestId('rollup-kpis')
    const slot = screen.getByTestId('slot')
    const health = screen.getByTestId('rollup-section-health')
    expect(
      kpis.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      slot.compareDocumentPosition(health) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('renders sections as disclosure rows on a phone', () => {
    isMobile.value = true
    renderPanels(world)
    const health = screen.getByTestId('rollup-section-health')
    expect(health.tagName).toBe('DETAILS')
    // The summary row carries the headline count.
    expect(health.querySelector('summary')).toHaveTextContent(
      'Intervention required 6,368'
    )
  })
})
