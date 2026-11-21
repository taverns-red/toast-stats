/**
 * Count placeholders on the Divisions page share their content's box (#2793).
 *
 * The placeholders were sized in pixels to District 61's labels, so longer
 * labels elsewhere re-flowed the area table and widened the phone chip when
 * the counts landed. The size now comes from one CSS rule that both the
 * placeholder and the content follow. jsdom does no layout, so this pins the
 * markup and the stylesheet; `district-subpages-cls.smoke.ts` measures the
 * boxes on the preview.
 */
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  render as rtlRender,
  screen,
  cleanup,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { AreaPerformanceTable } from '../AreaPerformanceTable'
import { DivisionPerformanceCards } from '../DivisionPerformanceCards'
import type {
  AreaPerformance,
  DivisionPerformance,
} from '../../utils/divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'

vi.mock('../../utils/extractDivisionPerformance', () => ({
  extractDivisionPerformance: vi.fn(),
}))
import { extractDivisionPerformance } from '../../utils/extractDivisionPerformance'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

const stylesheet = (rel: string) =>
  readFileSync(
    resolve(__dirname, '../../styles/components', rel),
    'utf-8'
  ).replace(/\/\*[\s\S]*?\*\//g, '')

/** Declarations of the first rule whose selector list is exactly `sel`. */
function rule(css: string, sel: string): Record<string, string> {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  if (!m || m[1] === undefined) throw new Error(`rule not found: ${sel}`)
  return Object.fromEntries(
    m[1]
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => {
        const i = d.indexOf(':')
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
      })
  )
}

/** A width that scales with the text: em or ch, never px. */
const FONT_RELATIVE = /^\d+(\.\d+)?(em|ch)$/

const visits = {
  completed: 8,
  required: 8,
  percentage: 100,
  meetsThreshold: true,
}

const AREA: AreaPerformance = withRecognitionState(
  {
    areaId: 'A1',
    status: 'distinguished',
    clubBase: 10,
    paidClubs: 10,
    netGrowth: 0,
    distinguishedClubs: 6,
    requiredDistinguishedClubs: 5,
    firstRoundVisits: visits,
    secondRoundVisits: visits,
    isQualified: true,
  },
  '2026-03-15'
)

const DIVISIONS: DivisionPerformance[] = [
  {
    divisionId: 'A',
    status: 'not-distinguished',
    clubBase: 10,
    paidClubs: 10,
    netGrowth: 0,
    distinguishedClubs: 1,
    requiredDistinguishedClubs: 5,
    cspTracked: false,
    cspSubmittedCount: 0,
    clubsMissingCsp: [],
    areas: [AREA],
  },
]

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

const renderRows = (countsPending: boolean) =>
  render(
    <DivisionPerformanceCards
      districtSnapshot={{ divisionPerformance: [] }}
      snapshotTimestamp="2026-03-15"
      districtId="86"
      countsPending={countsPending}
    />
  )

beforeEach(() => {
  vi.mocked(extractDivisionPerformance).mockReturnValue(DIVISIONS)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('area table count columns (#2793)', () => {
  const css = stylesheet('entity-tables.css')

  it('sizes the Distinguished and Recognition columns in em or ch', () => {
    for (const sel of [
      '.entity-table--areas .entity-table__dist',
      '.entity-table--areas .entity-table__recognition',
    ]) {
      expect(rule(css, sel)['width'], sel).toMatch(FONT_RELATIVE)
    }
  })

  it('puts the column rule on both header cells', () => {
    render(<AreaPerformanceTable areas={[AREA]} countsPending />)
    expect(
      screen.getByRole('columnheader', { name: /^Distinguished/ })
    ).toHaveClass('entity-table__dist')
    expect(
      screen.getByRole('columnheader', { name: /^Recognition/ })
    ).toHaveClass('entity-table__recognition')
  })

  it('gives the count placeholders no pixel size of their own', () => {
    render(<AreaPerformanceTable areas={[AREA]} countsPending />)
    const row = screen.getByText('A1').closest('tr')!
    const pending = within(row).getAllByTestId('distinguished-pending')
    expect(pending.length).toBe(5)
    for (const p of pending) {
      expect(p.style.width).toBe('')
      expect(p.style.height).toBe('')
    }
  })
})

describe('phone division chip (#2793)', () => {
  it('has a min-width in em or ch that fits the longest label', () => {
    const chip = rule(stylesheet('mobile-row-list.css'), '.mobile-chip')
    expect(chip['display']).toBe('block')
    expect(chip['min-width']).toMatch(FONT_RELATIVE)
    // A set height: a glyph's fallback font must not make a real chip taller
    // than the empty placeholder.
    expect(chip['height']).toBe(chip['line-height'])
  })

  it('the placeholder is a chip box with no pixel size of its own', () => {
    stubMobile(true)
    renderRows(true)
    const pending = screen.getByTestId('distinguished-pending')
    expect(pending).toHaveClass('mobile-chip')
    expect(pending.style.width).toBe('')
    expect(pending.style.height).toBe('')
    expect(pending.style.display).toBe('')
  })

  it('the loaded chip uses the same chip box', () => {
    stubMobile(true)
    renderRows(false)
    const row = screen.getByTestId('mobile-row')
    expect(row.querySelector('.mobile-row__chip > .mobile-chip')).not.toBe(null)
  })
})
