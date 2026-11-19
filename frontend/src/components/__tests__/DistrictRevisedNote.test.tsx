import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DistrictRevisedNote } from '../DistrictRevisedNote'
import { useDistrictRevisedAsOf } from '../../hooks/useDistrictRevisedAsOf'

vi.mock('../../hooks/useDistrictRevisedAsOf', () => ({
  useDistrictRevisedAsOf: vi.fn(() => null),
}))
const mockHook = vi.mocked(useDistrictRevisedAsOf)

afterEach(() => cleanup())

const renderNote = ({
  districtId = '61',
  viewedDate = '2026-10-31',
}: {
  districtId?: string
  viewedDate?: string
} = {}) =>
  render(
    <MemoryRouter>
      <DistrictRevisedNote districtId={districtId} viewedDate={viewedDate} />
    </MemoryRouter>
  )

describe('DistrictRevisedNote (#2475)', () => {
  it('reserves its line on the month end while the revision index loads', () => {
    mockHook.mockReturnValue(null)
    renderNote()
    const note = screen.getByTestId('district-revised-note')
    expect(note).toBeEmptyDOMElement()
  })

  it('the stylesheet gives the reserved line a fixed minimum height', () => {
    // jsdom has no layout engine, so this pins the CSS contract (Lesson 66).
    const css = readFileSync(
      join(__dirname, '../../styles/components/app-shell.css'),
      'utf-8'
    )
    const rule =
      css.match(/\n\s*\.district-revised-note\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/min-height:\s*\S+/)
  })

  it('renders nothing on a date that is not a month end', () => {
    mockHook.mockReturnValue('2026-11-03')
    renderNote({ viewedDate: '2026-11-12' })
    expect(screen.queryByTestId('district-revised-note')).toBeNull()
  })

  it('says "Revised <date>" and links to the district What Changed page', () => {
    mockHook.mockReturnValue('2026-11-03')
    renderNote()
    const link = screen.getByRole('link', { name: /revised nov 3/i })
    expect(link).toHaveAttribute('href', '/district/61/changes')
  })

  it('links a letter district (F) by its own id', () => {
    mockHook.mockReturnValue('2026-11-03')
    renderNote({ districtId: 'F' })
    expect(screen.getByRole('link', { name: /revised/i })).toHaveAttribute(
      'href',
      '/district/F/changes'
    )
  })
})
