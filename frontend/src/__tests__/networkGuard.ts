import { afterAll, afterEach } from 'vitest'

// #2405 — the integration project is hermetic: no test may reach the network.
//
// A page test that leaves a CDN read un-stubbed passes or fails on latency
// (#2403): on a dev machine the request is still pending when the file ends,
// on CI it settles mid-file and re-renders spend later tests' mocks. So the
// real `fetch` is replaced, for every integration file, by one that rejects at
// once — the CI-shaped timing — with the URL in the error. Code under test
// usually swallows the rejection into query/error state, so every call is
// also recorded and the test that made it fails in `afterEach`, naming the
// URL. A file that needs a response stubs `fetch` (or the service) itself.
//
// Assigned directly rather than via `vi.stubGlobal`, so a file's own
// `vi.unstubAllGlobals()` or `mockRestore()` puts the guard back, never the
// real network.

const unmocked: string[] = []

function describeRequest(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (input && typeof input === 'object' && 'url' in input) {
    return String((input as { url: unknown }).url)
  }
  return String(input)
}

export function networkGuardFetch(input: unknown): Promise<Response> {
  const url = describeRequest(input)
  unmocked.push(url)
  return Promise.reject(
    new Error(
      `un-mocked network fetch in an integration test: ${url} — stub this read (#2405)`
    )
  )
}

/** Returns and clears the URLs fetched through the guard so far. */
export function takeUnmockedFetches(): string[] {
  return unmocked.splice(0, unmocked.length)
}

function assertNoUnmockedFetches(when: string): void {
  const urls = takeUnmockedFetches()
  if (urls.length > 0) {
    throw new Error(
      `${when} made ${urls.length} un-mocked network fetch(es) (#2405):\n` +
        urls.map(u => `  - ${u}`).join('\n')
    )
  }
}

globalThis.fetch = networkGuardFetch as typeof fetch

afterEach(() => {
  assertNoUnmockedFetches('This test')
})

// A request fired after the last test's afterEach still fails the file.
afterAll(() => {
  assertNoUnmockedFetches('This file (after its last test)')
})
