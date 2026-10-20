/**
 * Moved-region banner (#1821). When a district changed region between
 * program years, its page says so and links to each former region FOR the
 * year it was there — never a dead end (the link carries `?py=`).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { DistrictRegionHistorySchema } from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/district-region-history.recorded.json'
import { DistrictRegionMoveBanner } from '../DistrictRegionMoveBanner'

const history = DistrictRegionHistorySchema.parse(recorded)

afterEach(() => cleanup())

const renderBanner = (
  districtId: string,
  programYear: string,
  h: typeof history | null = history
) =>
  render(
    <MemoryRouter>
      <DistrictRegionMoveBanner
        districtId={districtId}
        programYear={programYear}
        history={h}
      />
    </MemoryRouter>
  )

describe('DistrictRegionMoveBanner', () => {
  it("names each former region and links to it for that year's PY", () => {
    renderBanner('61', '2026-2027')
    const note = screen.getByRole('note', { name: /region history/i })
    expect(note).toHaveTextContent(
      'In 2018-19 – 2023-24 this district was in Region 09'
    )
    expect(note).toHaveTextContent(
      'In 2016-17 – 2017-18 this district was in Region 06'
    )
    const link = within(note).getByRole('link', {
      name: 'Open Region 09 for 2023-24',
    })
    expect(link).toHaveAttribute('href', '/region/09?py=2023')
    expect(
      within(note).getByRole('link', { name: 'Open Region 06 for 2017-18' })
    ).toHaveAttribute('href', '/region/06?py=2017')
  })

  it('names the current region when viewing a past program year', () => {
    renderBanner('61', '2019-2020')
    const note = screen.getByRole('note', { name: /region history/i })
    expect(note).toHaveTextContent('In 2019-20 this district was in Region 09')
    expect(note).toHaveTextContent(
      'Since 2024-25 this district is in Region 05'
    )
    expect(
      within(note).getByRole('link', { name: 'Open Region 05 for 2026-27' })
    ).toHaveAttribute('href', '/region/05?py=2026')
  })

  it('renders nothing for a district that never moved, or without history', () => {
    const neverMoved = DistrictRegionHistorySchema.parse({
      ...recorded,
      districts: {
        '42': {
          spans: [{ from: '2017-01-31', to: null, region: '11' }],
          byProgramYear: { '2024-2025': '11', '2025-2026': '11' },
        },
      },
    })
    const { container } = renderBanner('42', '2025-2026', neverMoved)
    expect(container).toBeEmptyDOMElement()
    cleanup()
    const { container: c2 } = renderBanner('61', '2019-2020', null)
    expect(c2).toBeEmptyDOMElement()
  })
})
