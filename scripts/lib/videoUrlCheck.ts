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
