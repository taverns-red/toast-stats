import { buildScore, midiToHz, type ScoreEvent } from './score'
import type { MusicVariant } from './variants'

/**
 * Renders a variant's score to stereo PCM in plain TypeScript: no samples,
 * no third-party audio (#2336). Every voice is a short-envelope instrument:
 *
 *   - pluck: Karplus–Strong string (a noise burst through a damped delay
 *     line), the plucked-guitar/harp sound;
 *   - mallet: a sine with a quickly fading 4th partial, marimba-like;
 *   - strum: Karplus–Strong strings spread a few ms apart, down or up;
 *   - bass: a sine with a soft 2nd harmonic, plucked envelope;
 *   - kick: a sine sweeping 140 → 50 Hz, a soft thump;
 *   - shaker: high-passed noise with a ~30 ms decay.
 *
 * Noise comes from a seeded PRNG, so the output is sample-for-sample
 * deterministic. The mix is peak-normalised to MIX_PEAK; loudness is set
 * afterwards (`master.ts`).
 */

export const SAMPLE_RATE = 48000
/** Peak of the raw mix: headroom, so nothing clips before mastering. */
export const MIX_PEAK = 0.5

const FADE_IN_SEC = 0.005
const FADE_OUT_SEC = 0.5
const STRUM_SPREAD_SEC = 0.012
/** exp(-6.9) ≈ -60 dB: an envelope that has died away by `decaySec`. */
const T60 = 6.9

type Mono = Float64Array

/** mulberry32: small, fast, seeded. Returns [-1, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1
  }
}

/** FNV-1a, to seed each variant differently. */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

/** Linear attack, then exponential decay to ~-60 dB at `decaySec`. */
function envelope(n: number, attackSec: number, decaySec: number): number {
  const t = n / SAMPLE_RATE
  const attack = t < attackSec ? t / attackSec : 1
  return attack * Math.exp((-T60 * t) / decaySec)
}

const samples = (sec: number): Mono =>
  new Float64Array(Math.ceil(sec * SAMPLE_RATE))

function pluck(hz: number, decaySec: number, noise: () => number): Mono {
  const out = samples(decaySec)
  const period = Math.max(2, Math.round(SAMPLE_RATE / hz))
  const line = new Float64Array(period)
  // A softened noise burst: the one-pole low-pass rounds off the pick.
  let lp = 0
  for (let i = 0; i < period; i++) {
    lp += 0.5 * (noise() - lp)
    line[i] = lp
  }
  let idx = 0
  for (let n = 0; n < out.length; n++) {
    const next = (idx + 1) % period
    const y = line[idx] ?? 0
    line[idx] = 0.996 * 0.5 * (y + (line[next] ?? 0))
    idx = next
    out[n] = y * envelope(n, 0.002, decaySec)
  }
  return out
}

function mallet(hz: number, decaySec: number): Mono {
  const out = samples(decaySec)
  const w = (2 * Math.PI * hz) / SAMPLE_RATE
  for (let n = 0; n < out.length; n++) {
    const bright = 0.3 * Math.exp(-n / (0.04 * SAMPLE_RATE))
    out[n] =
      (Math.sin(w * n) + bright * Math.sin(4 * w * n)) *
      envelope(n, 0.003, decaySec)
  }
  return out
}

function bass(hz: number, decaySec: number): Mono {
  const out = samples(decaySec)
  const w = (2 * Math.PI * hz) / SAMPLE_RATE
  for (let n = 0; n < out.length; n++) {
    out[n] =
      (Math.sin(w * n) + 0.3 * Math.sin(2 * w * n)) *
      envelope(n, 0.008, decaySec)
  }
  return out
}

function kick(decaySec: number): Mono {
  const out = samples(decaySec)
  let phase = 0
  for (let n = 0; n < out.length; n++) {
    const hz = 50 + 90 * Math.exp(-n / (0.03 * SAMPLE_RATE))
    phase += (2 * Math.PI * hz) / SAMPLE_RATE
    out[n] = Math.sin(phase) * envelope(n, 0.002, decaySec)
  }
  return out
}

function shaker(decaySec: number, noise: () => number): Mono {
  const out = samples(decaySec)
  // One-pole high-pass around 6 kHz keeps the "tss" and drops the body.
  const a = Math.exp((-2 * Math.PI * 6000) / SAMPLE_RATE)
  let prevIn = 0
  let prevOut = 0
  for (let n = 0; n < out.length; n++) {
    const x = noise()
    prevOut = a * (prevOut + x - prevIn)
    prevIn = x
    out[n] = prevOut * envelope(n, 0.003, decaySec * 0.4)
  }
  return out
}

/** Equal-power pan gains; -1 is hard left, 1 hard right. */
function pan(p: number): [number, number] {
  const theta = ((p + 1) * Math.PI) / 4
  return [Math.cos(theta), Math.sin(theta)]
}

/** Spread notes by pitch: low a little left, high a little right. */
const pitchPan = (midi: number): number =>
  Math.max(-0.4, Math.min(0.4, (midi - 72) / 30))

interface Bus {
  left: Mono
  right: Mono
}

function mixIn(
  bus: Bus,
  sound: Mono,
  startSec: number,
  gain: number,
  position: number
): void {
  const start = Math.round(startSec * SAMPLE_RATE)
  const [gl, gr] = pan(position)
  const end = Math.min(bus.left.length, start + sound.length)
  for (let i = start; i < end; i++) {
    const s = (sound[i - start] ?? 0) * gain
    bus.left[i] = (bus.left[i] ?? 0) + s * gl
    bus.right[i] = (bus.right[i] ?? 0) + s * gr
  }
}

function play(
  variant: MusicVariant,
  e: ScoreEvent,
  noise: () => number,
  bus: Bus
): void {
  const v = e.velocity
  switch (e.voice) {
    case 'lead': {
      const midi = e.midi[0] ?? 60
      const hz = midiToHz(midi)
      const sound =
        variant.lead?.timbre === 'mallet'
          ? mallet(hz, e.decaySec)
          : pluck(hz, e.decaySec, noise)
      mixIn(
        bus,
        sound,
        e.startSec,
        v * (variant.lead?.gain ?? 0),
        pitchPan(midi)
      )
      return
    }
    case 'strum': {
      const strings = e.stroke === 'up' ? [...e.midi].reverse() : e.midi
      strings.forEach((midi, i) => {
        mixIn(
          bus,
          pluck(midiToHz(midi), e.decaySec, noise),
          e.startSec + i * STRUM_SPREAD_SEC,
          v * (variant.strum?.gain ?? 0),
          pitchPan(midi)
        )
      })
      return
    }
    case 'bass': {
      const sound = bass(midiToHz(e.midi[0] ?? 48), e.decaySec)
      mixIn(bus, sound, e.startSec, v * variant.bass.gain, 0)
      return
    }
    case 'kick':
      mixIn(bus, kick(e.decaySec), e.startSec, v * variant.kick.gain, 0)
      return
    case 'shaker': {
      const sound = shaker(e.decaySec, noise)
      mixIn(bus, sound, e.startSec, v * variant.shaker.gain, 0.35)
      return
    }
  }
}

export function synthesize(
  variant: MusicVariant,
  durationSec: number
): { left: Float32Array; right: Float32Array } {
  const length = Math.round(durationSec * SAMPLE_RATE)
  const bus: Bus = {
    left: new Float64Array(length),
    right: new Float64Array(length),
  }
  const seed = hash(variant.id)
  buildScore(variant, durationSec).forEach((e, i) => {
    play(variant, e, rng(seed ^ Math.imul(i + 1, 0x9e3779b1)), bus)
  })

  const fadeIn = Math.round(FADE_IN_SEC * SAMPLE_RATE)
  const fadeOut = Math.min(length, Math.round(FADE_OUT_SEC * SAMPLE_RATE))
  let peak = 0
  for (let i = 0; i < length; i++) {
    let g = i < fadeIn ? i / fadeIn : 1
    const fromEnd = length - 1 - i
    if (fromEnd < fadeOut) g *= Math.sin(((fromEnd / fadeOut) * Math.PI) / 2)
    const l = (bus.left[i] ?? 0) * g
    const r = (bus.right[i] ?? 0) * g
    bus.left[i] = l
    bus.right[i] = r
    peak = Math.max(peak, Math.abs(l), Math.abs(r))
  }
  const scale = peak > 0 ? MIX_PEAK / peak : 0
  return {
    left: Float32Array.from(bus.left, s => s * scale),
    right: Float32Array.from(bus.right, s => s * scale),
  }
}
