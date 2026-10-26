import type { ChordTone, MusicVariant, Roman } from './variants'

export type Voice = 'lead' | 'strum' | 'bass' | 'kick' | 'shaker'

/** One onset. Times are seconds from the start of the track. */
export interface ScoreEvent {
  voice: Voice
  startSec: number
  /** MIDI notes sounded; empty for the kick and shaker. */
  midi: readonly number[]
  /** 0–1. */
  velocity: number
  /** Seconds for the note to die away (~ -60 dB). */
  decaySec: number
  /** Strum direction; the synth spreads the strings from this onset. */
  stroke?: 'down' | 'up'
}

/** Semitones above the tonic, and whether the triad is minor. */
const DEGREES: Readonly<Record<Roman, { semis: number; minor: boolean }>> = {
  I: { semis: 0, minor: false },
  ii: { semis: 2, minor: true },
  iii: { semis: 4, minor: true },
  IV: { semis: 5, minor: false },
  V: { semis: 7, minor: false },
  vi: { semis: 9, minor: true },
}

/** Lowest note of the lead and strum: C4, a bright, singing register. */
const LEAD_FLOOR_MIDI = 60
/** Lowest note of the bass: C3, an octave above the old pad's F2–A2 roots. */
const BASS_FLOOR_MIDI = 48
const KICK_DECAY_SEC = 0.25
const SHAKER_DECAY_SEC = 0.08

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** The chord's root, `semis` above the tonic. */
export function chordRoot(tonicMidi: number, roman: Roman): number {
  return tonicMidi + DEGREES[roman].semis
}

/** Pitch classes of the chord's triad: root, third, fifth. */
function triad(tonicMidi: number, roman: Roman): number[] {
  const root = chordRoot(tonicMidi, roman) % 12
  const third = DEGREES[roman].minor ? 3 : 4
  return [root, (root + third) % 12, (root + 7) % 12]
}

/** The chord's tones from `floor` upward; index = ChordTone. */
function ladder(
  pcs: readonly number[],
  floor: number,
  count: number
): number[] {
  const tones: number[] = []
  for (let m = floor; tones.length < count; m++) {
    if (pcs.includes(m % 12)) tones.push(m)
  }
  return tones
}

function tone(tones: readonly number[], i: ChordTone): number {
  const m = tones[i]
  if (m === undefined) throw new Error(`chord tone ${i} out of range`)
  return m
}

/**
 * Every onset of `variant` over `durationSec`, looping the progression one
 * chord per bar. Pure and deterministic: the synth renders exactly this.
 */
export function buildScore(
  variant: MusicVariant,
  durationSec: number
): ScoreEvent[] {
  const sixteenth = 60 / variant.bpm / 4
  const barSixteenths = variant.beatsPerBar * 4
  const events: ScoreEvent[] = []
  // Times come from integer sixteenth counts so every onset sits on the grid.
  const at = (bar: number, beat: number): number =>
    (bar * barSixteenths + Math.round(beat * 4)) * sixteenth
  const push = (e: ScoreEvent): void => {
    if (e.startSec < durationSec) events.push(e)
  }
  const { lead, strum, bass, kick, shaker } = variant

  for (let bar = 0; at(bar, 0) < durationSec; bar++) {
    const roman = variant.progression[bar % variant.progression.length]
    if (!roman) throw new Error(`${variant.id} has an empty progression`)
    const pcs = triad(variant.tonicMidi, roman)
    const tones = ladder(pcs, LEAD_FLOOR_MIDI, 5)

    if (lead) {
      lead.pattern.forEach((step, i) => {
        if (step === null) return
        const beat = i / lead.stepsPerBeat
        push({
          voice: 'lead',
          startSec: at(bar, beat),
          midi: [tone(tones, step)],
          velocity: i === 0 ? 1 : Number.isInteger(beat) ? 0.85 : 0.7,
          decaySec: lead.decaySec,
        })
      })
    }
    if (strum) {
      const chord = ([0, 1, 2, 3] as const).map(i => tone(tones, i))
      strum.pattern.forEach((stroke, i) => {
        if (stroke === null) return
        push({
          voice: 'strum',
          startSec: at(bar, i / strum.stepsPerBeat),
          midi: chord,
          velocity: stroke === 'down' ? (i === 0 ? 1 : 0.85) : 0.6,
          decaySec: strum.decaySec,
          stroke,
        })
      })
    }
    const bassNote = BASS_FLOOR_MIDI + (pcs[0] ?? 0)
    for (const beat of bass.beats) {
      push({
        voice: 'bass',
        startSec: at(bar, beat),
        midi: [bassNote],
        velocity: beat === 0 ? 1 : 0.8,
        decaySec: bass.decaySec,
      })
    }
    for (const beat of kick.beats) {
      push({
        voice: 'kick',
        startSec: at(bar, beat),
        midi: [],
        velocity: beat === 0 ? 1 : 0.8,
        decaySec: KICK_DECAY_SEC,
      })
    }
    const hits = variant.beatsPerBar * shaker.stepsPerBeat
    for (let i = 0; i < hits; i++) {
      push({
        voice: 'shaker',
        startSec: at(bar, i / shaker.stepsPerBeat),
        midi: [],
        // Accent the off-beats: the lift that makes it feel light.
        velocity: i % shaker.stepsPerBeat === 0 ? 0.5 : 1,
        decaySec: SHAKER_DECAY_SEC,
      })
    }
  }
  return events.sort((a, b) => a.startSec - b.startSec)
}
