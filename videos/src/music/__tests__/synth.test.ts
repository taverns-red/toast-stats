import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MIX_PEAK, SAMPLE_RATE, synthesize } from '../synth'
import { MUSIC_VARIANTS } from '../variants'

const SEC = 6

function digest(a: Float32Array, b: Float32Array): string {
  return createHash('sha256')
    .update(Buffer.from(a.buffer))
    .update(Buffer.from(b.buffer))
    .digest('hex')
}

/** RMS of the samples in [fromSec, toSec). */
function rms(x: Float32Array, fromSec: number, toSec: number): number {
  const a = Math.round(fromSec * SAMPLE_RATE)
  const b = Math.round(toSec * SAMPLE_RATE)
  let sum = 0
  for (let i = a; i < b; i++) sum += (x[i] ?? 0) ** 2
  return Math.sqrt(sum / (b - a))
}

describe.each(MUSIC_VARIANTS)('synthesize $id (#2336)', variant => {
  const { left, right } = synthesize(variant, SEC)

  it('renders exactly the requested length in stereo at 48 kHz', () => {
    expect(SAMPLE_RATE).toBe(48000)
    expect(left.length).toBe(SEC * SAMPLE_RATE)
    expect(right.length).toBe(SEC * SAMPLE_RATE)
  })

  it('never clips: finite samples peaking at MIX_PEAK, below full scale', () => {
    let peak = 0
    for (const ch of [left, right]) {
      for (const s of ch) {
        expect(Number.isFinite(s)).toBe(true)
        peak = Math.max(peak, Math.abs(s))
      }
    }
    expect(MIX_PEAK).toBeLessThan(1)
    expect(peak).toBeCloseTo(MIX_PEAK, 5)
  })

  it('is sample-for-sample deterministic', () => {
    const again = synthesize(variant, SEC)
    expect(digest(again.left, again.right)).toBe(digest(left, right))
  })

  it('is not silent anywhere in the body of the track', () => {
    for (let t = 0; t + 0.5 <= SEC - 1; t += 0.5) {
      expect(rms(left, t, t + 0.5), `${t}s`).toBeGreaterThan(0.005)
    }
  })

  it('has a pulse: each beat starts louder than the moment before it', () => {
    // Short envelopes mean energy rises at onsets. Compare the 30 ms after
    // each downbeat with the 30 ms before it, over the bars after the first.
    const beatSec = 60 / variant.bpm
    let louder = 0
    let beats = 0
    for (let t = beatSec * 4; t < SEC - 1; t += beatSec * 4) {
      beats++
      if (rms(left, t, t + 0.03) > rms(left, t - 0.03, t)) louder++
    }
    expect(beats).toBeGreaterThan(0)
    expect(louder).toBe(beats)
  })

  it('ends with a short fade so the file never stops on a click', () => {
    expect(Math.abs(left[left.length - 1] ?? 1)).toBeLessThan(1e-3)
    expect(Math.abs(right[right.length - 1] ?? 1)).toBeLessThan(1e-3)
  })
})

describe('synthesize', () => {
  it('gives each variant its own sound', () => {
    const digests = MUSIC_VARIANTS.map(v => {
      const { left, right } = synthesize(v, 2)
      return digest(left, right)
    })
    expect(new Set(digests).size).toBe(MUSIC_VARIANTS.length)
  })
})
