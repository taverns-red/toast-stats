import { renderWithProviders } from './test-utils'
import { describe, expect, it, vi } from 'vitest'

// Wait a macrotask, as the network guard does, so a deferred fetch still
// lands inside the assertion window.
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

describe('renderWithProviders program-year fetch', () => {
  it('can render isolated UI without fetching program-year dates', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('un-mocked dates.json fetch'))

    try {
      renderWithProviders(<div>test content</div>, { withProgramYear: false })
      await settle()

      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('still fetches dates.json by default, so the probe above can see one', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('un-mocked dates.json fetch'))

    try {
      renderWithProviders(<div>test content</div>)
      await settle()

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('v1/dates.json')
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
