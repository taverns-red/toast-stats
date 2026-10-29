import { describe, expect, it, vi } from 'vitest'
import { networkGuardFetch, takeUnmockedFetches } from '../networkGuard'

// #2405 — the integration project's setup replaces `fetch` with a guard that
// rejects at once, naming the URL, and fails the test that called it.
describe('integration network guard', () => {
  it('is the global fetch in the integration project', () => {
    expect(globalThis.fetch).toBe(networkGuardFetch)
  })

  it('rejects an un-mocked fetch at once with the URL in the error', async () => {
    await expect(
      fetch('https://cdn.example.test/v1/dates.json')
    ).rejects.toThrow('https://cdn.example.test/v1/dates.json')
    // Drain the record so this test's own afterEach does not fail it.
    expect(takeUnmockedFetches()).toEqual([
      'https://cdn.example.test/v1/dates.json',
    ])
  })

  it('records Request and URL inputs by their href', async () => {
    await expect(
      fetch(new URL('https://cdn.example.test/v1/rankings.json'))
    ).rejects.toThrow('v1/rankings.json')
    await expect(
      fetch(new Request('https://cdn.example.test/snapshots/x.json'))
    ).rejects.toThrow('snapshots/x.json')
    expect(takeUnmockedFetches()).toEqual([
      'https://cdn.example.test/v1/rankings.json',
      'https://cdn.example.test/snapshots/x.json',
    ])
  })

  it('comes back after a file stubs and unstubs fetch, not the real network', () => {
    vi.stubGlobal('fetch', vi.fn())
    expect(globalThis.fetch).not.toBe(networkGuardFetch)
    vi.unstubAllGlobals()
    expect(globalThis.fetch).toBe(networkGuardFetch)
  })
})
