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
}

/** Not implemented yet (#2899). */
export async function probeUrl(
  _url: string,
  _deps: ProbeDeps = {}
): Promise<number | null> {
  return null
}
