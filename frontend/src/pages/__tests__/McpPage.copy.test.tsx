/* /mcp install snippets (#2657, REF-20). The one-liner has a copy button with
   an accessible name and a polite "Copied" confirmation; each focusable
   snippet block is a named region, so a keyboard user landing on it hears
   what it is. */

import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import McpPage from '../McpPage'

const renderPage = () =>
  render(
    <MemoryRouter>
      <McpPage />
    </MemoryRouter>
  )

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('McpPage — copy the install command (#2657)', () => {
  it('has a copy button with an accessible name', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })

  it('copies the exact Claude Code command and confirms it', async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    renderPage()
    await user.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith(
      'claude mcp add toast-stats -- npx -y @taverns-red/toast-stats-mcp'
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Copied')
  })

  it('does nothing, and does not claim success, without a clipboard', async () => {
    // navigator.clipboard is undefined on insecure (HTTP) contexts.
    const user = userEvent.setup()
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    try {
      renderPage()
      await user.click(screen.getByRole('button', { name: /copy/i }))
      expect(screen.getByRole('status')).not.toHaveTextContent('Copied')
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else delete (navigator as { clipboard?: unknown }).clipboard
    }
  })

  it('does not claim success when the clipboard write is refused', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied')
    )
    renderPage()
    await user.click(screen.getByRole('button', { name: /copy/i }))
    expect(screen.getByRole('status')).not.toHaveTextContent('Copied')
  })

  it('names both focusable snippet blocks', () => {
    renderPage()
    const regions = screen.getAllByRole('region', { name: /./ })
    // The Install section is a region too; match the snippet blocks only.
    const command = regions.find(r =>
      r.textContent?.trim().startsWith('claude mcp add')
    )
    const json = regions.find(r => r.textContent?.trim().startsWith('{'))
    expect(command).toBeDefined()
    expect(json).toBeDefined()
    expect(within(json!).getByText(/"command": "npx"/)).toBeInTheDocument()
  })
})
