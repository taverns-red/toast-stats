/**
 * A `matchMedia` stub driven by a viewport width (#2676).
 *
 * jsdom has no layout, so a test that needs a breakpoint tier states the width
 * it is "at" and every `(min-width: Npx)` / `(max-width: Npx)` query answers
 * from it. Anything else (orientation, pointer, height) does not match, which
 * is the desktop default the rest of the suite already assumes.
 */

import { vi } from 'vitest'

const px = (part: string, kind: 'min' | 'max'): number | null => {
  const m = new RegExp(`\\(\\s*${kind}-width\\s*:\\s*([\\d.]+)px\\s*\\)`).exec(
    part
  )
  return m ? Number(m[1]) : null
}

/** Does `query` match a viewport `width` px wide? */
export const matchesViewport = (query: string, width: number): boolean =>
  query.split(/\s+and\s+/i).every(raw => {
    const part = raw.trim()
    const min = px(part, 'min')
    if (min !== null) return width >= min
    const max = px(part, 'max')
    if (max !== null) return width <= max
    return false
  })

/** Make `window.matchMedia` answer as a viewport `width` px wide. */
export const stubViewportWidth = (width: number): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: matchesViewport(query, width),
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
