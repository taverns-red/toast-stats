export interface VideoUrlResult {
  id: string
  cut: 'desktop' | 'mobile'
  url: string
  status: number | null
  ok: boolean
}

/** One line per failed URL. Not implemented yet (#2899). */
export function describeFailures(_results: VideoUrlResult[]): string[] {
  return []
}
