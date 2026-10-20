/**
 * WorldEducationView (#1811) — the /regions/education body: the world
 * block's KPIs, programs, levels and Pathways-only matrix, the world's
 * years, and one row per region linking to its own education page. Values
 * are text; a region or year without a ledger says "Not available", never
 * 0. Fixtures: staging `derived/education-rollup/` recorded 2026-10-17.
 */
import { describe, expect, it, afterEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import {
  EducationRollupIndexSchema,
  EducationRollupProgramYearSchema,
  type EducationRollupProgramYear,
} from '@taverns-red/shared-contracts'
import current from '../../__tests__/fixtures/education-rollup-2026-2027.recorded.json'
import older from '../../__tests__/fixtures/education-rollup-2022-2023.recorded.json'
import recordedIndex from '../../__tests__/fixtures/education-rollup-index.recorded.json'
import {
  buildWorldEducation,
  worldEducationTrend,
} from '../../utils/worldEducation'
import { WorldEducationView } from '../WorldEducationView'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const py2627 = EducationRollupProgramYearSchema.parse(current)
const py2223 = EducationRollupProgramYearSchema.parse(older)
const index = EducationRollupIndexSchema.parse(recordedIndex)

afterEach(cleanup)

const renderView = (rollup: EducationRollupProgramYear, py: string) => {
  const e = buildWorldEducation({ rollup })
  if (e.status !== 'available') throw new Error('fixture not available')
  return render(
    <MemoryRouter>
      <WorldEducationView
        education={e}
        programYear={py}
        trend={worldEducationTrend(index)}
      />
    </MemoryRouter>
  )
}

describe('WorldEducationView', () => {
  it('states the source and coverage, and the world KPIs', () => {
    renderView(py2627, '2026-2027')
    expect(screen.getByTestId('education-provenance')).toHaveTextContent(
      'Source: TI education ledger, as of 2026-10-16 · 94 of 94 districts with a ledger'
    )
    const kpis = screen.getByRole('list', { name: 'Education at a glance' })
    expect(within(kpis).getByText('26,497')).toBeInTheDocument()
    expect(within(kpis).getByText('22,370')).toBeInTheDocument()
    expect(within(kpis).getByText('8,542')).toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: 'Level × path, Pathways awards' })
    ).toBeInTheDocument()
  })

  it('one row per region, linking to its education page for the PY', () => {
    renderView(py2627, '2026-2027')
    const table = screen.getByRole('table', {
      name: 'Regions, education awards',
    })
    const link = within(table).getByRole('link', { name: 'Region 01' })
    expect(link).toHaveAttribute('href', '/region/01/education?py=2026-2027')
    const row = link.closest('tr')!
    expect(within(row).getByText('1,562')).toBeInTheDocument()
    expect(within(row).getByText('7 of 7')).toBeInTheDocument()
    expect(within(table).getAllByRole('link')).toHaveLength(2)
    expect(screen.getByTestId('education-unassigned')).toHaveTextContent(
      'District U is in no region this year'
    )
  })

  it('a region missing districts shows how many it summed', () => {
    renderView(py2223, '2022-2023')
    expect(screen.getByTestId('education-provenance')).toHaveTextContent(
      '124 of 128 districts with a ledger'
    )
    const table = screen.getByRole('table', {
      name: 'Regions, education awards',
    })
    const row = within(table)
      .getByRole('link', { name: 'Region 01' })
      .closest('tr')!
    expect(within(row).getByText('6 of 9')).toBeInTheDocument()
    // Members were not measured for every district: not 0.
    const kpis = screen.getByRole('list', { name: 'Education at a glance' })
    const members = within(kpis)
      .getByText('Members with an award')
      .closest('li')!
    expect(members).toHaveTextContent('Not measured')
  })

  it('a region with no district available reads "Not available", not 0', () => {
    const r01 = py2223.regions!['01']!
    renderView(
      {
        ...py2223,
        regions: {
          ...py2223.regions!,
          '01': {
            ...r01,
            totals: { awards: 0, pathways: 0, legacy: 0, dtm: 0, other: 0 },
            pathwaysMatrix: {},
            legacyByCode: {},
            otherByCode: {},
            clubsWithAward: 0,
            membersWithAward: null,
            tripleCrownAchievers: null,
            districtsAvailable: [],
            districtsNotAvailable: [
              ...r01.districtsAvailable,
              ...r01.districtsNotAvailable,
            ].sort(),
          },
        },
      },
      '2022-2023'
    )
    const table = screen.getByRole('table', {
      name: 'Regions, education awards',
    })
    const row = within(table)
      .getByRole('link', { name: 'Region 01' })
      .closest('tr')!
    expect(row).toHaveTextContent(/Not available \(no district with a ledger\)/)
    expect(within(row).queryByText('0')).not.toBeInTheDocument()
  })

  it('before region history: the world block, and why there are no regions', () => {
    renderView({ ...py2627, regions: null }, '2026-2027')
    expect(
      screen.queryByRole('table', { name: 'Regions, education awards' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('education-regions-unavailable')
    ).toHaveTextContent('region membership is recorded from 2016-17 on')
    const kpis = screen.getByRole('list', { name: 'Education at a glance' })
    expect(within(kpis).getByText('26,497')).toBeInTheDocument()
  })

  it('the world’s years, the selected PY marked', () => {
    renderView(py2627, '2026-2027')
    const years = screen.getByRole('list', { name: 'Awards by program year' })
    expect(within(years).getAllByRole('listitem')).toHaveLength(24)
    const current = within(years)
      .getAllByRole('listitem')
      .find(li => li.getAttribute('aria-current') === 'true')!
    expect(current).toHaveTextContent('2026-27')
    expect(current).toHaveTextContent('26,497')
  })
})
