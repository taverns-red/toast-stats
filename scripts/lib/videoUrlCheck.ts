export interface VideoUrlResult {
  id: string
  cut: 'desktop' | 'mobile'
  url: string
  status: number | null
  ok: boolean
}

/** One line per failed URL, naming the video, the cut, the URL and the status. */
export function describeFailures(results: VideoUrlResult[]): string[] {
  return results
    .filter(r => !r.ok)
    .map(
      r =>
        `${r.id} (${r.cut}): ${r.url} returned ${
          r.status === null ? 'no response' : r.status
        }`
    )
}

export interface ProbeDeps {
  fetchFn?: (
    url: string,
    init: RequestInit
  ) => Promise<{
    status: number
    body?: { cancel(): Promise<void> } | null
  }>
  sleep?: (ms: number) => Promise<void>
  /** Builds the per-request abort signal; injected so a test can see the timeout. */
  timeoutSignal?: (ms: number) => AbortSignal
}

const REQUEST_TIMEOUT_MS = 15_000
const RETRY_DELAY_MS = 2_000

async function attempt(
  url: string,
  fetchFn: NonNullable<ProbeDeps['fetchFn']>,
  timeoutSignal: NonNullable<ProbeDeps['timeoutSignal']>
): Promise<number | null> {
  try {
    const res = await fetchFn(url, {
      headers: { Range: 'bytes=0-0' },
      signal: timeoutSignal(REQUEST_TIMEOUT_MS),
    })
    await res.body?.cancel()
    return res.status
  } catch (err) {
    console.error(`check-video-urls: ${url}: ${String(err)}`)
    return null
  }
}

/**
 * Request the first byte of `url` and return the HTTP status, or null when
 * there was no response. A network error, a timeout or a 5xx gets one retry
 * after a short delay; a 4xx fails at once.
 */
export async function probeUrl(
  url: string,
  deps: ProbeDeps = {}
): Promise<number | null> {
  const fetchFn = deps.fetchFn ?? fetch
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const timeoutSignal = deps.timeoutSignal ?? AbortSignal.timeout
  const first = await attempt(url, fetchFn, timeoutSignal)
  if (first !== null && first < 500) return first
  await sleep(RETRY_DELAY_MS)
  return attempt(url, fetchFn, timeoutSignal)
}
