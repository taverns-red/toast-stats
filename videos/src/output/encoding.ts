/**
 * The render's container and colour contract (#2293). `render.ts` passes
 * RENDER_ENCODING to Remotion's renderMedia, and `npm run videos:verify`
 * ffprobes each MP4 and fails unless checkProbe returns no problems, so a
 * render that players would guess the colours of never leaves CI.
 *
 * colorSpace 'bt709' (Remotion 4.0.535, `validColorSpaces` in
 * @remotion/renderer/dist/options/color-space) makes ffmpeg convert with
 * zscale to limited-range BT.709 and tag -colorspace, -color_primaries and
 * -color_trc as bt709. Remotion 4's 'default' tags nothing but the
 * primaries, leaving the sRGB transfer of Chromium's screenshots.
 */
import type { RenderMediaOptions } from '@remotion/renderer'

export const RENDER_ENCODING = {
  codec: 'h264',
  pixelFormat: 'yuv420p',
  colorSpace: 'bt709',
  audioCodec: 'aac',
} as const satisfies Partial<RenderMediaOptions>

/** The ffprobe stream fields checkProbe reads. */
export const PROBE_STREAM_ENTRIES = [
  'codec_type',
  'codec_name',
  'pix_fmt',
  'color_range',
  'color_space',
  'color_transfer',
  'color_primaries',
] as const

/**
 * One stream of `ffprobe -of json -show_entries stream=…`. ffprobe omits a
 * field it reads as unknown, so every field is optional.
 */
export type ProbeStream = Partial<
  Record<(typeof PROBE_STREAM_ENTRIES)[number], string>
>
export interface ProbeOutput {
  streams: ProbeStream[]
}

const EXPECTED_VIDEO: ProbeStream = {
  codec_name: 'h264',
  pix_fmt: 'yuv420p',
  color_space: 'bt709',
  color_transfer: 'bt709',
  color_primaries: 'bt709',
}

/** Every way the probed file misses the contract; empty when it meets it. */
export function checkProbe(probe: ProbeOutput): string[] {
  const problems: string[] = []
  const video = probe.streams.find(s => s.codec_type === 'video')
  if (!video) {
    problems.push('no video stream, expected h264')
  } else {
    for (const key of Object.keys(EXPECTED_VIDEO) as (keyof ProbeStream)[]) {
      const want = EXPECTED_VIDEO[key]
      const got = video[key] ?? 'unknown'
      if (got !== want)
        problems.push(`video ${key} is ${got}, expected ${want}`)
    }
  }
  const audio = probe.streams.find(s => s.codec_type === 'audio')
  if (!audio) {
    problems.push('no audio stream, expected aac')
  } else if (audio.codec_name !== 'aac') {
    problems.push(
      `audio codec_name is ${audio.codec_name ?? 'unknown'}, expected aac`
    )
  }
  return problems
}
