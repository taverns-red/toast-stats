import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  encodeWav16,
  normalisationGainDb,
  parseEbur128,
  type Loudness,
} from '../music/master'
import { SAMPLE_RATE, synthesize } from '../music/synth'
import { getVariant, TRACK_SEC } from '../music/variants'

/**
 * The ffmpeg side of the generated music (#2336). The track itself is
 * synthesised in TypeScript from a score (`src/music/`): no samples, no
 * third-party recording, so there is nothing to license. ffmpeg only
 * measures loudness (ebur128) and encodes the AAC preview clips. The
 * composer fades the track in and out and the video carries no other audio.
 */

export interface AudioMeasure extends Loudness {
  codec: string
  durationSec: number
}

const EBUR128 = 'ebur128=framelog=quiet:peak=sample+true'
const MAX_BUFFER = 64 * 1024 * 1024

function interleave(left: Float32Array, right: Float32Array): Buffer {
  const out = Buffer.alloc(left.length * 8)
  for (let i = 0; i < left.length; i++) {
    out.writeFloatLE(left[i] ?? 0, i * 8)
    out.writeFloatLE(right[i] ?? 0, i * 8 + 4)
  }
  return out
}

/** ebur128 over `args` (the input), or an error naming what failed. */
function loudnessOf(inputArgs: string[], input?: Buffer): Loudness {
  const { stderr, error } = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      ...inputArgs,
      '-af',
      EBUR128,
      '-f',
      'null',
      '-',
    ],
    { input, encoding: 'utf8', maxBuffer: MAX_BUFFER }
  )
  if (error) throw error
  const loudness = parseEbur128(stderr)
  if (!loudness) {
    throw new Error(`ffmpeg ebur128 printed no summary:\n${stderr.slice(-800)}`)
  }
  return loudness
}

/**
 * Synthesise `variantId`, normalise it to TARGET_LUFS with one gain, and
 * write it to `outFile` as 48 kHz stereo 16-bit WAV. Deterministic: the same
 * variant always produces the same bytes.
 */
export function generateTrack(
  variantId: string,
  outFile: string,
  durationSec: number = TRACK_SEC
): void {
  const { left, right } = synthesize(getVariant(variantId), durationSec)
  const raw = loudnessOf(
    ['-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '2', '-i', 'pipe:0'],
    interleave(left, right)
  )
  const gainDb = normalisationGainDb(raw.integratedLufs, raw.truePeakDb)
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, encodeWav16(left, right, SAMPLE_RATE, gainDb))
}

/** Codec, duration, loudness and peaks of a media file's first audio stream. */
export function measureAudio(file: string): AudioMeasure {
  const probe = JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name:format=duration',
        '-of',
        'json',
        file,
      ],
      { encoding: 'utf8' }
    )
  ) as { streams?: { codec_name?: string }[]; format?: { duration?: string } }
  return {
    codec: probe.streams?.[0]?.codec_name ?? 'none',
    durationSec: Number.parseFloat(probe.format?.duration ?? 'NaN'),
    ...loudnessOf(['-i', file]),
  }
}

/** Integrated loudness (LUFS) of a media file's audio, or null. */
export function measureLufs(file: string): number | null {
  try {
    return loudnessOf(['-i', file]).integratedLufs
  } catch {
    return null
  }
}

/**
 * A `seconds`-long AAC preview of a generated track for listening on a PR
 * (#2336), with the same short fades the video gives it.
 */
export function encodeClip(
  wavFile: string,
  outFile: string,
  seconds: number
): void {
  mkdirSync(dirname(outFile), { recursive: true })
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      wavFile,
      '-t',
      String(seconds),
      '-af',
      `afade=t=in:d=0.5,afade=t=out:st=${(seconds - 1.5).toFixed(2)}:d=1.5`,
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-movflags',
      '+faststart',
      outFile,
    ],
    { stdio: 'inherit' }
  )
}
