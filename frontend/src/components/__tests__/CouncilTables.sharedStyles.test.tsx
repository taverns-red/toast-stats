/**
 * Council print-pack tables on the shared table styles (#2676, M8; #2707,
 * #2655 REF-09, #2756 item 3, #2754 item 2).
 *
 * DOM assertions read real elements; CSS assertions read the stylesheet as
 * text (jsdom has no layout engine, R22). The rendered boxes are measured by
 * e2e/council-pack-print.smoke.ts.
 */

import React from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CouncilPackDocument } from '../councilPack/CouncilPackDocument'
import type { CouncilPack } from '../../utils/councilPack'
import { getProgramYear } from '../../utils/programYear'

const css = (rel: string): string =>
  readFileSync(
    join(__dirname, '..', '..', 'styles', 'components', rel),
    'utf-8'
  )

const pack: CouncilPack = {
  divisionId: 'B',
  areaId: null,
  recognition: {
    label: 'Net Loss',
    paidClubs: 5,
    clubBase: 6,
    distinguishedClubs: 2,
    requiredDistinguishedClubs: 3,
    gapToDistinguished: 'N/A',
    gapToSelect: 'N/A',
    gapToPresidents: 'N/A',
  },
  areas: [
    {
      areaId: 'B1',
      recognition: 'Net Loss',
      paidClubs: 5,
      clubBase: 6,
      distinguishedClubs: 2,
      requiredDistinguishedClubs: 3,
      visits: {
        completed: 1,
        required: 3,
        percentage: 33,
        meetsThreshold: false,
      },
      missingVisit: [],
      cspTracked: true,
      cspSubmitted: 1,
      cspHeld: 2,
    },
  ],
  visitRound: 1,
  visitDeadline: '2026-11-30',
  closeToDistinguished: { shown: [], total: 0, more: 0 },
  csp: {
    tracked: true,
    submitted: 1,
    held: 2,
    missing: { shown: [], total: 0, more: 0 },
  },
  roster: [
    {
      clubId: 'c1',
      clubName: 'Limestone City Club',
      areaId: 'B1',
      health: 'Intervention required',
      members: 12,
      goals: 3,
      distinguished: '—',
      visit: 'missing',
      csp: 'missing',
    },
  ],
}

const renderPack = (kind: 'area' | 'division' = 'division') =>
  render(
    <MemoryRouter>
      <CouncilPackDocument
        kind={kind}
        districtId="61"
        title="Division B"
        pack={pack}
        programYear={getProgramYear(2025)}
        snapshotDate="2026-03-15"
        asOfDate="2026-03-15"
        sourcePath="/district/61/division/B"
        backTo="/district/61/division/B"
        printedAt={new Date(2026, 2, 16)}
      />
    </MemoryRouter>
  )

describe('print-pack tables take the shared table styles (#2676 M8)', () => {
  afterEach(() => cleanup())

  it('every pack table is .dt.dt-static with a caption', () => {
    const { container } = renderPack()
    const tables = container.querySelectorAll('table')
    expect(tables.length).toBe(2)
    for (const t of tables) {
      expect(t).toHaveClass('dt', 'dt-static')
      expect(t.querySelector('caption')).not.toBeNull()
    }
  })

  it('the captions tell the roster from the areas table', () => {
    const { container } = renderPack()
    const names = [...container.querySelectorAll('caption')].map(c =>
      c.textContent?.trim()
    )
    expect(names).toEqual(['Areas in Division B', 'Clubs in Division B'])
  })
})

describe('print roster health column does not wrap (#2707)', () => {
  afterEach(() => cleanup())

  it('the health cell carries the nowrap class', () => {
    const { container } = renderPack()
    const roster = container.querySelector(
      '[data-testid="council-pack-roster"]'
    )
    const cell = [...roster!.querySelectorAll('tbody td')].find(
      td => td.textContent === 'Intervention required'
    )
    expect(cell).toBeDefined()
    expect(cell).toHaveClass('council-pack__nowrap')
  })

  it('the health column is wide enough for "Intervention required"', () => {
    // 8.5pt text: the label is about 110px; the box is 698px wide, so the
    // column needs at least 17% (119px) before cell padding.
    const m = /\.council-pack__col-health\s*\{[^}]*width:\s*([\d.]+)%/.exec(
      css('council-pack.css')
    )
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(17)
  })
})

describe('print-pack headings and link use the shared styles', () => {
  it('the screen title and section headings take the heading ramp (#2756)', () => {
    const src = css('council-pack.css')
    const title = /\.council-pack__title\s*\{([^}]*)\}/.exec(src)
    expect(title?.[1]).toMatch(/font-size:\s*var\(--heading-page-size\)/)
    const h2 = /\.council-pack__section h2\s*\{([^}]*)\}/.exec(src)
    expect(h2?.[1]).toMatch(/font-size:\s*var\(--heading-section-size\)/)
  })

  it('"Print pack" is a secondary button, a 44px bordered box (#2754)', () => {
    const src = css('council-pack.css')
    const m = /\.council-pack-link a\s*\{([^}]*)\}/.exec(src)
    expect(m, 'rule').not.toBeNull()
    expect(m![1]).toMatch(/display:\s*inline-flex/)
    expect(m![1]).toMatch(/min-height:\s*44px/)
    expect(m![1]).toMatch(/border:\s*1px solid var\(--line\)/)
    expect(m![1]).toMatch(/border-radius:/)
  })
})
