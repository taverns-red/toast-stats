import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * An original, generated background pad — no samples, no third-party
 * recording, so there is nothing to license. ffmpeg's `aevalsrc` sums sine
 * partials for a slow I–vi–IV–V progression in C (Cmaj7, Am7, Fmaj7, G),
 * each chord crossfaded into the next, softened with a low-pass and a short
 * echo, then loudness-normalised to TARGET_LUFS. The composer fades it in and
 * out and the video carries no other audio.
 */
export const TARGET_LUFS = -26

const CHORDS_HZ: readonly (readonly number[])[] = [
  [130.81, 196.0, 329.63, 493.88], // Cmaj7: C3 G3 E4 B4
  [110.0, 164.81, 261.63, 392.0], // Am7:   A2 E3 C4 G4
  [87.31, 130.81, 220.0, 329.63], // Fmaj7: F2 C3 A3 E4
  [98.0, 146.83, 246.94, 293.66], // G:     G2 D3 B3 D4
  [130.81, 196.0, 329.63, 493.88], // Cmaj7 again, so up to ~41 s is covered
]
const CHORD_SEC = 9.5
const CROSSFADE_SEC = 1.5

/** One channel: each note plus a soft octave, slightly detuned per channel. */
function chordExpr(notes: readonly number[], detune: number): string {
  return notes
    .map(hz => {
      const f = (hz * detune).toFixed(3)
      return `0.05*sin(2*PI*${f}*t)+0.012*sin(4*PI*${f}*t)`
    })
    .join('+')
}

export function generatePad(outFile: string): void {
  mkdirSync(dirname(outFile), { recursive: true })
  const inputs = CHORDS_HZ.flatMap(notes => [
    '-f',
    'lavfi',
    '-i',
    `aevalsrc=${chordExpr(notes, 0.998)}|${chordExpr(notes, 1.002)}:s=48000:d=${CHORD_SEC}`,
  ])
  // [0][1]acrossfade[x1];[x1][2]acrossfade[x2];…
  const chain: string[] = []
  let prev = '[0]'
  for (let i = 1; i < CHORDS_HZ.length; i++) {
    const label = `[x${i}]`
    chain.push(
      `${prev}[${i}]acrossfade=d=${CROSSFADE_SEC}:c1=qsin:c2=qsin${label}`
    )
    prev = label
  }
  const total =
    CHORDS_HZ.length * CHORD_SEC - (CHORDS_HZ.length - 1) * CROSSFADE_SEC
  chain.push(
    `${prev}lowpass=f=1600,aecho=0.8:0.6:90|170:0.22|0.14,` +
      `afade=t=in:d=2,afade=t=out:st=${(total - 3).toFixed(2)}:d=3,` +
      `loudnorm=I=${TARGET_LUFS}:TP=-3:LRA=7,aresample=48000[out]`
  )
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      ...inputs,
      '-filter_complex',
      chain.join(';'),
      '-map',
      '[out]',
      '-c:a',
      'pcm_s16le',
      outFile,
    ],
    { stdio: 'inherit' }
  )
}

/** Integrated loudness (LUFS) of a media file's audio, via ffmpeg ebur128. */
export function measureLufs(file: string): number | null {
  // ebur128 prints its summary on stderr.
  const { stderr } = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      file,
      '-af',
      'ebur128=framelog=quiet',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' }
  )
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'))
  const match = /I:\s+(-?[\d.]+) LUFS/.exec(summary)
  return match?.[1] ? Number.parseFloat(match[1]) : null
}
