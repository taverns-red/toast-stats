import { renderWithProviders } from './test-utils'
import { expect, it, vi } from 'vitest'

it('can render isolated UI without fetching program-year dates', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('un-mocked dates.json fetch'))

  try {
    renderWithProviders(<div>test content</div>, { withProgramYear: false })

    await Promise.resolve()

    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})
