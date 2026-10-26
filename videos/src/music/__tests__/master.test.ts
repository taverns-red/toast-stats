import { describe, expect, it } from 'vitest'
import {
  encodeWav16,
  normalisationGainDb,
  parseEbur128,
  TARGET_LUFS,
  TRUE_PEAK_MAX_DB,
} from '../master'

/**
 * Real shape: the tail of `ffmpeg -hide_banner -nostats -i x.wav -af
 * ebur128=framelog=quiet:peak=sample+true -f null -` on ffmpeg 8.1 (macOS,
 * 2026-10-26), stderr. A filter's summary follows `Summary:`.
 */
const EBUR128_STDERR = `[Parsed_ebur128_0 @ 0x76e4c24600] Summary:

  Integrated loudness:
    I:         -17.7 LUFS
    Threshold: -27.7 LUFS

  Loudness range:
    LRA:         0.0 LU
    Threshold: -37.7 LUFS
    LRA low:   -17.7 LUFS
    LRA high:  -17.7 LUFS

  Sample peak:
    Peak:      -14.0 dBFS

  True peak:
    Peak:      -13.9 dBFS
[out#0/null @ 0x76e4c24600] video:0KiB audio:469KiB subtitle:0KiB
size=N/A time=00:00:05.00 bitrate=N/A speed= 338x elapsed=0:00:00.01
`

describe('targets (#2336)', () => {
  it('stays background music: −26 LUFS, true peak −3 dB', () => {
    expect(TARGET_LUFS).toBe(-26)
    expect(TRUE_PEAK_MAX_DB).toBe(-3)
  })
})

describe('parseEbur128', () => {
  it('reads integrated loudness and both peaks from the summary', () => {
    expect(parseEbur128(EBUR128_STDERR)).toEqual({
      integratedLufs: -17.7,
      samplePeakDb: -14,
      truePeakDb: -13.9,
    })
  })

  it('ignores per-frame lines before the summary', () => {
    const framelog =
      '[Parsed_ebur128_0] t: 0.4  TARGET:-23 LUFS  M: -18.1 S:-120.7  I: -5.0 LUFS\n'
    expect(parseEbur128(framelog + EBUR128_STDERR)?.integratedLufs).toBe(-17.7)
  })

  it('returns null when there is no summary', () => {
    expect(parseEbur128('Error opening input file x.wav.')).toBeNull()
  })

  it('reads -inf peaks of a silent file as -Infinity', () => {
    const silent = EBUR128_STDERR.replace(
      /-1[34]\.\d dBFS/g,
      '-inf dBFS'
    ).replace(
      '-17.7 LUFS\n    Threshold: -27.7',
      '-70.0 LUFS\n    Threshold: -70.0'
    )
    expect(parseEbur128(silent)).toEqual({
      integratedLufs: -70,
      samplePeakDb: -Infinity,
      truePeakDb: -Infinity,
    })
  })
})

describe('normalisationGainDb', () => {
  it('moves the measured loudness onto the target', () => {
    expect(normalisationGainDb(-17.7, -13.9)).toBeCloseTo(-8.3, 6)
    expect(normalisationGainDb(-30, -20)).toBeCloseTo(4, 6)
  })

  it('refuses a gain that would push the true peak above −3 dB', () => {
    // −30 → −26 is +4 dB; a −6 dBTP peak would land at −2 dBTP.
    expect(() => normalisationGainDb(-30, -6)).toThrow(/true peak/)
  })

  it('refuses a silent or unmeasured input', () => {
    expect(() => normalisationGainDb(Number.NaN, -10)).toThrow(/loudness/)
    expect(() => normalisationGainDb(-Infinity, -10)).toThrow(/loudness/)
  })
})

describe('encodeWav16', () => {
  const left = Float32Array.from([0, 0.5, -0.5, 1, -1])
  const right = Float32Array.from([0.25, -0.25, 0, 2, -2])
  const wav = encodeWav16(left, right, 48000, 0)

  it('writes a canonical 44-byte PCM header, stereo 16-bit 48 kHz', () => {
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8)
    expect(wav.toString('ascii', 8, 16)).toBe('WAVEfmt ')
    expect(wav.readUInt32LE(16)).toBe(16)
    expect(wav.readUInt16LE(20)).toBe(1) // PCM
    expect(wav.readUInt16LE(22)).toBe(2)
    expect(wav.readUInt32LE(24)).toBe(48000)
    expect(wav.readUInt32LE(28)).toBe(48000 * 4)
    expect(wav.readUInt16LE(32)).toBe(4)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.toString('ascii', 36, 40)).toBe('data')
    expect(wav.readUInt32LE(40)).toBe(5 * 4)
    expect(wav.length).toBe(44 + 5 * 4)
  })

  it('interleaves L/R, rounds to 16 bits and clamps out-of-range samples', () => {
    const samples = Array.from({ length: 10 }, (_, i) =>
      wav.readInt16LE(44 + i * 2)
    )
    expect(samples).toEqual([
      0, 8192, 16384, -8192, -16384, 0, 32767, 32767, -32767, -32767,
    ])
  })

  it('applies the gain in dB', () => {
    const quieter = encodeWav16(left, right, 48000, -6.0206)
    expect(quieter.readInt16LE(44 + 2 * 2)).toBe(8192) // 0.5 → 0.25
  })

  it('rejects channels of different lengths', () => {
    expect(() => encodeWav16(left, Float32Array.from([0]), 48000, 0)).toThrow(
      /same length/
    )
  })
})
