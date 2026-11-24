/**
 * useUrlDatePair on a held day (#3195): the default pair stops at the
 * published date (`defaultFrom`), while an explicit `?to=` may name a held
 * date that is only in the full list.
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { useUrlDatePair } from '../useUrlDatePair'

const all = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']
const published = ['2026-11-19', '2026-11-20', '2026-11-21']

const render = (url: string) =>
  renderHook(() => useUrlDatePair(all, { defaultFrom: published }), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    ),
  })

describe('useUrlDatePair with a held date (#3195)', () => {
  it('defaults to the last two published dates', () => {
    const { result } = render('/district/61/changes')
    expect(result.current.from).toBe('2026-11-20')
    expect(result.current.to).toBe('2026-11-21')
  })

  it('keeps an explicit ?to= that names the held date', () => {
    const { result } = render('/district/61/changes?to=2026-11-22')
    expect(result.current.to).toBe('2026-11-22')
    expect(result.current.from).toBe('2026-11-20')
  })
})
