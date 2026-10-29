import { useEffect } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  markTestStarted,
  networkGuardFetch,
  settleAndTakeUnmockedFetches,
  takeUnmockedFetches,
} from '../networkGuard'

// #2405 — the integration project's setup replaces `fetch` with a guard that
// rejects at once, naming the URL, and fails the test that called it.
const urls = () => takeUnmockedFetches().map(f => f.url)

describe('integration network guard', () => {
  it('is the global fetch in the integration project', () => {
    expect(globalThis.fetch).toBe(networkGuardFetch)
  })

  it('rejects an un-mocked fetch at once with the URL in the error', async () => {
    await expect(
      fetch('https://cdn.example.test/v1/dates.json')
    ).rejects.toThrow('https://cdn.example.test/v1/dates.json')
    // Drain the record so this test's own afterEach does not fail it.
    expect(urls()).toEqual(['https://cdn.example.test/v1/dates.json'])
  })

  it('records Request and URL inputs by their href', async () => {
    await expect(
      fetch(new URL('https://cdn.example.test/v1/rankings.json'))
    ).rejects.toThrow('v1/rankings.json')
    await expect(
      fetch(new Request('https://cdn.example.test/snapshots/x.json'))
    ).rejects.toThrow('snapshots/x.json')
    expect(urls()).toEqual([
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

  // The #2408 misattribution: a page defers a read past its first paint, a
  // synchronous test ends first, and the read used to fire inside the next
  // test. Settling before the check pins it to the test that started it.
  it('attributes a read deferred past a synchronous test to that test', async () => {
    function DeferredRead() {
      useEffect(() => {
        setTimeout(() => {
          void fetch('https://cdn.example.test/v1/latest.json').catch(
            () => undefined
          )
        }, 0)
      }, [])
      return null
    }
    render(<DeferredRead />)
    // A synchronous test would end here, with the read not yet started.
    expect(takeUnmockedFetches()).toEqual([])

    expect(await settleAndTakeUnmockedFetches()).toEqual([
      {
        url: 'https://cdn.example.test/v1/latest.json',
        test: expect.getState().currentTestName,
      },
    ])
  })

  it('names the test that last ended for a call made between tests', async () => {
    markTestStarted('an earlier test')
    await settleAndTakeUnmockedFetches()
    await fetch('https://cdn.example.test/late.json').catch(() => undefined)
    expect(takeUnmockedFetches()).toEqual([
      {
        url: 'https://cdn.example.test/late.json',
        test: 'between tests, after "an earlier test"',
      },
    ])
  })
})
