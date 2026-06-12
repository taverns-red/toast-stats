/* /mcp page (#1165, epic #1162) — the public announcement surface for the
   published MCP server. Content correctness against the package README and
   ADR-008: the real published package name in the install snippets, all 8
   tool names, the freshness/provenance caveats, and the GitHub + ADR links. */

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import McpPage from '../McpPage'

const renderPage = () =>
  render(
    <MemoryRouter>
      <McpPage />
    </MemoryRouter>
  )

afterEach(() => cleanup())

describe('McpPage — scaffold (#1165)', () => {
  it('renders a level-1 heading naming the MCP server', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /mcp server/i })
    ).toBeInTheDocument()
  })

  it('renders the lede explaining what the page answers', () => {
    renderPage()
    expect(screen.getByTestId('mcp-lede')).toBeInTheDocument()
  })

  it('sets the document title', async () => {
    renderPage()
    await waitFor(() => expect(document.title).toBe('MCP Server — Toast Stats'))
  })
})

describe('McpPage — install snippets (#1165)', () => {
  it('shows the real published package name in an npx one-liner', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toContain('npx -y @taverns-red/toast-stats-mcp')
  })

  it('shows the claude mcp add one-liner for Claude Code', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/claude mcp add toast-stats/)
  })

  it('shows the JSON client config using npx (no absolute paths)', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toContain('"command": "npx"')
    expect(txt).not.toMatch(/\/absolute\/path/)
  })

  it('never shows the stale pre-publish framing', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).not.toMatch(/not yet published/i)
  })
})

describe('McpPage — tools inventory (#1165)', () => {
  it('lists all 8 read-only tools by their real names', () => {
    renderPage()
    const txt = document.body.textContent || ''
    for (const tool of [
      'get-latest-date',
      'list-dates',
      'list-districts',
      'resolve-club',
      'get-district-snapshot',
      'query-rankings',
      'get-club-health',
      'get-time-series',
    ]) {
      expect(txt).toContain(tool)
    }
  })

  it('states the read-only / no-computation contract', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/read-only/i)
  })
})

describe('McpPage — freshness, provenance, and links (#1165)', () => {
  it('explains data freshness (daily pipeline) and source citation', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/once daily/i)
    expect(txt).toMatch(/sourceUrl/)
  })

  it('links to the GitHub repo', () => {
    renderPage()
    const gh = screen.getByRole('link', { name: /github/i })
    expect(gh).toHaveAttribute(
      'href',
      expect.stringContaining('github.com/taverns-red/toast-stats')
    )
  })

  it('links to ADR-008', () => {
    renderPage()
    const adr = screen.getByRole('link', { name: /adr[- ]?008/i })
    expect(adr).toHaveAttribute(
      'href',
      expect.stringContaining('008-ai-enable-toast-stats.md')
    )
  })

  it('links back to How it works for the methodology', () => {
    renderPage()
    const link = screen
      .getAllByRole('link')
      .find(a => a.getAttribute('href') === '/methodology')
    expect(link).toBeTruthy()
  })
})
