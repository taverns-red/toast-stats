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
