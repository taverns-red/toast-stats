import { afterAll, afterEach, beforeEach, expect, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

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
// Attribution is deterministic. A page often defers a read until after its
// first paint (an `enabled` flag that flips once another query resolves), so
// a synchronous test can end before the read starts, and the read then fires
// inside whichever test runs next. Before checking, the guard therefore
// unmounts the test's tree and flushes pending work, so a read the test set in
// motion lands in that test's check. Each call also records the test running
// when it was made; a call made between tests names the test that last ended.
//
// Assigned directly rather than via `vi.stubGlobal`, so a file's own
// `vi.unstubAllGlobals()` or `mockRestore()` puts the guard back, never the
// real network.

export interface UnmockedFetch {
  url: string
  /** The test running when fetch was called, or the gap after one. */
  test: string
}

const unmocked: UnmockedFetch[] = []
let currentTest: string | null = null
let lastEndedTest: string | null = null

function describeRequest(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (input && typeof input === 'object' && 'url' in input) {
    return String((input as { url: unknown }).url)
  }
  return String(input)
}

function callSite(): string {
  if (currentTest !== null) return currentTest
  if (lastEndedTest !== null) return `between tests, after "${lastEndedTest}"`
  return 'before the first test'
}

export function networkGuardFetch(input: unknown): Promise<Response> {
  const url = describeRequest(input)
  unmocked.push({ url, test: callSite() })
  return Promise.reject(
    new Error(
      `un-mocked network fetch in an integration test: ${url} — stub this read (#2405)`
    )
  )
}

/** Returns and clears the fetches recorded by the guard so far. */
export function takeUnmockedFetches(): UnmockedFetch[] {
  return unmocked.splice(0, unmocked.length)
}

/** Marks which test is running, so each call is attributed at call time. */
export function markTestStarted(name: string): void {
  currentTest = name
}

async function flushPendingWork(): Promise<void> {
  if (vi.isFakeTimers()) {
    // A macrotask would never fire under fake timers; drain microtasks.
    for (let i = 0; i < 20; i++) await Promise.resolve()
    return
  }
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

/**
 * Unmounts the rendered tree, lets pending work run, marks the test ended and
 * returns every fetch recorded since the last check. A read the test set in
 * motion (a deferred query, a promise chain) lands here, in this test, rather
 * than in the next one.
 */
export async function settleAndTakeUnmockedFetches(): Promise<UnmockedFetch[]> {
  cleanup()
  await flushPendingWork()
  lastEndedTest = currentTest
  currentTest = null
  return takeUnmockedFetches()
}

export function formatUnmockedFetches(
  when: string,
  fetches: UnmockedFetch[]
): string {
  return (
    `${when} made ${fetches.length} un-mocked network fetch(es) (#2405):\n` +
    fetches.map(f => `  - ${f.url}  [during: ${f.test}]`).join('\n')
  )
}

globalThis.fetch = networkGuardFetch as typeof fetch

beforeEach(() => {
  markTestStarted(expect.getState().currentTestName ?? '(unnamed test)')
})

afterEach(async () => {
  const fetches = await settleAndTakeUnmockedFetches()
  if (fetches.length > 0) {
    throw new Error(formatUnmockedFetches('This test', fetches))
  }
})

// A request fired after the last test's check still fails the file.
afterAll(async () => {
  await flushPendingWork()
  const fetches = takeUnmockedFetches()
  if (fetches.length > 0) {
    throw new Error(
      formatUnmockedFetches('This file (after its last test)', fetches)
    )
  }
})
