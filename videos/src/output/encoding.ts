/** Red-phase stub (#2293): the real values land in the next commit. */
export const RENDER_ENCODING = {
  codec: 'h264',
  audioCodec: 'aac',
} as const

export type ProbeStream = Record<string, string | undefined>
export interface ProbeOutput {
  streams: ProbeStream[]
}

export function checkProbe(_probe: ProbeOutput): string[] {
  return []
}
