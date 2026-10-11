/**
 * FilterSheet (#1836, mobile epic #1827 Phase 1) — the shared phone
 * "Filter & sort" bottom sheet. Built on the BottomSheet primitive, generic
 * over facets so the clubs list, the map and the explorers reuse one sheet.
 *
 * - Sort comes first: a labelled field select + Ascending/Descending.
 * - Facets are aria-pressed chips; none pressed = no filter (the select-all
 *   default is "nothing pressed", so a tap always means "only this").
 * - One onChange per tap (one setter per handler).
 * - Sticky footer: "Clear all" + "Show N clubs", which closes the sheet.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FilterSheet, type FilterSheetProps } from '../filters/FilterSheet'

afterEach(() => cleanup())

const baseProps = (
  overrides: Partial<FilterSheetProps> = {}
): FilterSheetProps => ({
  isOpen: true,
  onClose: vi.fn(),
  resultCount: 12,
  resultNoun: { one: 'club', other: 'clubs' },
  activeCount: 0,
  onClearAll: vi.fn(),
  sort: {
    options: [
      { value: 'name', label: 'Club' },
      { value: 'membership', label: 'Members' },
    ],
    field: 'name',
    direction: 'asc',
    onChange: vi.fn(),
  },
  facets: [
    {
      id: 'status',
      label: 'Status',
      options: [
        { value: 'thriving', label: 'Thriving' },
        { value: 'vulnerable', label: 'Vulnerable' },
      ],
      selected: [],
      onChange: vi.fn(),
    },
  ],
  ...overrides,
})

describe('FilterSheet (#1836)', () => {
  it('is a labelled modal dialog titled "Filter & sort"', () => {
    render(<FilterSheet {...baseProps()} />)
    const dialog = screen.getByRole('dialog', { name: 'Filter & sort' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('puts sort before the facets', () => {
    render(<FilterSheet {...baseProps()} />)
    const sort = screen.getByLabelText('Sort by')
    const status = screen.getByRole('group', { name: 'Status' })
    expect(
      sort.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('changes the sort field with one call carrying field and direction', () => {
    const props = baseProps()
    render(<FilterSheet {...props} />)
    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'membership' },
    })
    expect(props.sort!.onChange).toHaveBeenCalledTimes(1)
    expect(props.sort!.onChange).toHaveBeenCalledWith('membership', 'asc')
  })

  it('switches direction with pressed Ascending / Descending buttons', () => {
    const props = baseProps()
    render(<FilterSheet {...props} />)
    expect(screen.getByRole('button', { name: 'Ascending' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Descending' }))
    expect(props.sort!.onChange).toHaveBeenCalledWith('name', 'desc')
  })

  it('renders facet options as aria-pressed chips, none pressed by default', () => {
    render(<FilterSheet {...baseProps()} />)
    const chip = screen.getByRole('button', { name: 'Thriving' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('a tap adds the value with a single onChange (≤ 2 taps to filter)', () => {
    const props = baseProps()
    render(<FilterSheet {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vulnerable' }))
    const onChange = props.facets[0]!.onChange
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(['vulnerable'])
  })

  it('a tap on a pressed chip removes only that value', () => {
    const props = baseProps()
    props.facets[0]!.selected = ['thriving', 'vulnerable']
    render(<FilterSheet {...props} />)
    const chip = screen.getByRole('button', { name: 'Thriving' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip)
    expect(props.facets[0]!.onChange).toHaveBeenCalledWith(['vulnerable'])
  })

  it('shows the live result count on the apply button, which closes the sheet', () => {
    const props = baseProps({ resultCount: 1 })
    render(<FilterSheet {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 club' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('offers "Clear all" only when something is active', () => {
    const props = baseProps()
    const { rerender } = render(<FilterSheet {...props} />)
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled()
    rerender(<FilterSheet {...props} activeCount={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(props.onClearAll).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const props = baseProps()
    render(<FilterSheet {...props} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalled()
  })

  it('hides a facet that has no options rather than rendering an empty group', () => {
    const props = baseProps()
    props.facets.push({
      id: 'area',
      label: 'Area',
      options: [],
      selected: [],
      onChange: vi.fn(),
    })
    render(<FilterSheet {...props} />)
    expect(screen.queryByRole('group', { name: 'Area' })).toBeNull()
  })
})
