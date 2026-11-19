import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DistrictRevisedNote } from '../DistrictRevisedNote'
import { useDistrictRevision } from '../../hooks/useDistrictRevision'

vi.mock('../../hooks/useDistrictRevision', () => ({
  useDistrictRevision: vi.fn(() => null),
}))
const mockHook = vi.mocked(useDistrictRevision)

afterEach(() => cleanup())

const LINK = {
  revisedOn: '2026-11-03',
  from: '2026-10-31@2026-11-02',
  to: '2026-10-31',
}

const renderNote = ({
  districtId = '61',
  viewedDate = '2026-10-31',
  latestSnapshotDate = '2026-10-31',
}: {
  districtId?: string
  viewedDate?: string
  latestSnapshotDate?: string
} = {}) =>
  render(
    <MemoryRouter>
      <DistrictRevisedNote
        districtId={districtId}
        viewedDate={viewedDate}
        latestSnapshotDate={latestSnapshotDate}
      />
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
    mockHook.mockReturnValue(LINK)
    renderNote({ viewedDate: '2026-11-12', latestSnapshotDate: '2026-11-12' })
    expect(screen.queryByTestId('district-revised-note')).toBeNull()
  })

  it('renders nothing on an older month end: What Changed only offers revisions for the newest', () => {
    mockHook.mockReturnValue(LINK)
    renderNote({ viewedDate: '2026-09-30', latestSnapshotDate: '2026-10-31' })
    expect(screen.queryByTestId('district-revised-note')).toBeNull()
    expect(mockHook).toHaveBeenLastCalledWith('61', undefined)
  })

  it('shows on the newest month end after later daily snapshots land', () => {
    mockHook.mockReturnValue(LINK)
    renderNote({ viewedDate: '2026-10-31', latestSnapshotDate: '2026-11-12' })
    expect(
      screen.getByTestId('district-revised-note')
    ).not.toBeEmptyDOMElement()
    expect(mockHook).toHaveBeenLastCalledWith('61', '2026-10-31')
  })

  it('says in plain words what was revised, when, and where to look', () => {
    // "Nov 3" is the one on-screen spelling of a date (#2648).
    mockHook.mockReturnValue(LINK)
    renderNote()
    expect(
      screen.getByRole('link', {
        name: 'Month-end figures revised Nov 3. See what changed.',
      })
    ).toBeInTheDocument()
  })

  it('the stylesheet reserves two lines on the narrowest phones, where the sentence wraps', () => {
    const css = readFileSync(
      join(__dirname, '../../styles/components/app-shell.css'),
      'utf-8'
    )
    const narrowRule =
      css.match(
        /@media \(max-width: 359px\)\s*\{\s*\.district-revised-note\s*\{([^}]*)\}/
      )?.[1] ?? ''
    expect(narrowRule).toMatch(/min-height:\s*36px/)
  })

  it("opens What Changed on the month end's newest revision", () => {
    mockHook.mockReturnValue(LINK)
    renderNote()
    expect(screen.getByRole('link', { name: /revised/i })).toHaveAttribute(
      'href',
      '/district/61/changes?from=2026-10-31%402026-11-02&to=2026-10-31'
    )
  })

  it('links a letter district (F) by its own id', () => {
    mockHook.mockReturnValue(LINK)
    renderNote({ districtId: 'F' })
    expect(screen.getByRole('link', { name: /revised/i })).toHaveAttribute(
      'href',
      '/district/F/changes?from=2026-10-31%402026-11-02&to=2026-10-31'
    )
  })
})
