import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DistrictRevisedNote } from '../DistrictRevisedNote'
import { useDistrictRevisedAsOf } from '../../hooks/useDistrictRevisedAsOf'

vi.mock('../../hooks/useDistrictRevisedAsOf', () => ({
  useDistrictRevisedAsOf: vi.fn(() => null),
}))
const mockHook = vi.mocked(useDistrictRevisedAsOf)

afterEach(() => cleanup())

const renderNote = (districtId = '61') =>
  render(
    <MemoryRouter>
      <DistrictRevisedNote districtId={districtId} viewedDate="2026-10-31" />
    </MemoryRouter>
  )

describe('DistrictRevisedNote (#2475)', () => {
  it('renders nothing when the district has no revision', () => {
    mockHook.mockReturnValue(null)
    renderNote()
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
    renderNote('F')
    expect(screen.getByRole('link', { name: /revised/i })).toHaveAttribute(
      'href',
      '/district/F/changes'
    )
  })

  it('carries the note class so the stylesheet can colour it', () => {
    mockHook.mockReturnValue('2026-11-03')
    renderNote()
    const note = screen.getByTestId('district-revised-note')
    expect(note.className).toContain('district-revised-note')
  })
})
