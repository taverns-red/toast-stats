/* The two-column "How it works" layout (#2656) is scoped to that page.
   Privacy, MCP and Videos share the `methodology-page` root class, so the
   1024px grid must hang on a modifier only MethodologyPage carries. */

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import MethodologyPage from '../MethodologyPage'
import PrivacyPage from '../PrivacyPage'
import McpPage from '../McpPage'
import VideosPage from '../VideosPage'

const MODIFIER = 'methodology-page--how-it-works'

const rootClasses = (page: React.ReactElement): DOMTokenList => {
  const { container } = render(<MemoryRouter>{page}</MemoryRouter>)
  return (container.querySelector('.methodology-page') as HTMLElement).classList
}

afterEach(() => cleanup())

describe('How it works two-column layout scope (#2656)', () => {
  it('puts the modifier on the How it works page', () => {
    expect(rootClasses(<MethodologyPage />).contains(MODIFIER)).toBe(true)
  })

  it.each([
    ['Privacy', <PrivacyPage key="p" />],
    ['MCP', <McpPage key="m" />],
    ['Videos', <VideosPage key="v" />],
  ])('does not put the modifier on %s', (_name, page) => {
    expect(rootClasses(page).contains(MODIFIER)).toBe(false)
  })

  it('hangs the 1024px grid on the modifier, not the shared root class', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../../styles/components/app-shell.css'),
      'utf8'
    )
    const start = css.indexOf(
      '@media (min-width: 1024px) {\n    .methodology-page'
    )
    expect(start).toBeGreaterThan(-1)
    const block = css.slice(start, css.indexOf('\n  }\n', start + 200) + 5)
    expect(block).toContain(`.${MODIFIER}`)
    expect(block).not.toMatch(/\.methodology-page\s*\{/)
    expect(block).not.toMatch(/\.methodology-page__header\s*\{/)
    expect(block).not.toMatch(/\.methodology-toc\s*\{/)
    expect(block).not.toMatch(/\.methodology-group,/)
  })
})
