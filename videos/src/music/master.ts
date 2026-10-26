/**
 * Mastering for the generated tracks (#2336): measure the raw mix's
 * loudness with ffmpeg's ebur128 (BS.1770), apply one linear gain to land on
 * TARGET_LUFS, and write 16-bit PCM WAV here in TypeScript. A single gain,
 * not a compressor or a dynamic loudnorm, keeps the plucks' envelopes intact
 * and the output deterministic. The ffmpeg calls live in `render/music.ts`.
 */

/** Background level under captions: the same target as the old pad. */
export const TARGET_LUFS = -26
/** True-peak ceiling (dBTP). */
export const TRUE_PEAK_MAX_DB = -3

export interface Loudness {
  integratedLufs: number
  samplePeakDb: number
  truePeakDb: number
}

const dbValue = (raw: string): number =>
  raw === '-inf' ? -Infinity : Number.parseFloat(raw)

/** The `Summary:` block of `-af ebur128=framelog=quiet:peak=sample+true`. */
export function parseEbur128(stderr: string): Loudness | null {
  const at = stderr.lastIndexOf('Summary:')
  if (at < 0) return null
  const summary = stderr.slice(at)
  const integrated = /I:\s+(-?[\d.]+|-inf) LUFS/.exec(summary)
  const sample = /Sample peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)
  const truePeak = /True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)
  if (!integrated?.[1] || !sample?.[1] || !truePeak?.[1]) return null
  return {
    integratedLufs: dbValue(integrated[1]),
    samplePeakDb: dbValue(sample[1]),
    truePeakDb: dbValue(truePeak[1]),
  }
}

/**
 * The gain (dB) that moves `integratedLufs` to TARGET_LUFS. Throws if the
 * input is unmeasurable or the gain would lift the true peak above the
 * ceiling, rather than silently clipping or limiting.
 */
export function normalisationGainDb(
  integratedLufs: number,
  truePeakDb: number
): number {
  if (!Number.isFinite(integratedLufs)) {
    throw new Error(`Cannot normalise: loudness is ${integratedLufs} LUFS`)
  }
  const gain = TARGET_LUFS - integratedLufs
  if (truePeakDb + gain > TRUE_PEAK_MAX_DB) {
    throw new Error(
      `Normalising to ${TARGET_LUFS} LUFS would put the true peak at ` +
        `${(truePeakDb + gain).toFixed(1)} dBTP, above ${TRUE_PEAK_MAX_DB} dBTP`
    )
  }
  return gain
}

/** Stereo 16-bit PCM WAV, `gainDb` applied, samples clamped to ±1. */
export function encodeWav16(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  gainDb: number
): Buffer {
  if (left.length !== right.length) {
    throw new Error('Left and right channels must be the same length')
  }
  const gain = 10 ** (gainDb / 20)
  const dataBytes = left.length * 4
  const wav = Buffer.alloc(44 + dataBytes)
  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + dataBytes, 4)
  wav.write('WAVEfmt ', 8, 'ascii')
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(2, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 4, 28)
  wav.writeUInt16LE(4, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(dataBytes, 40)
  const toInt = (s: number): number => {
    const x = Math.max(-1, Math.min(1, s * gain)) * 32767
    // Round half away from zero so +x and -x map to +n and -n.
    return Math.sign(x) * Math.round(Math.abs(x))
  }
  for (let i = 0; i < left.length; i++) {
    wav.writeInt16LE(toInt(left[i] ?? 0), 44 + i * 4)
    wav.writeInt16LE(toInt(right[i] ?? 0), 46 + i * 4)
  }
  return wav
}
