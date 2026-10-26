import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../../scenarios'
import { DEFAULT_MUSIC } from '../../scenarios/music'
import { MAX_DURATION_SEC } from '../../scenarios/validate'
import { buildScore, chordRoot, midiToHz, type ScoreEvent } from '../score'
import {
  DEFAULT_VARIANT_ID,
  getVariant,
  MUSIC_VARIANTS,
  TRACK_SEC,
  trackPath,
  variantForTrack,
} from '../variants'

/** Semitones above the tonic of each degree of a major scale. */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
const pitched = (events: ScoreEvent[]): ScoreEvent[] =>
  events.filter(e => e.midi.length > 0)

describe('music variants (#2336)', () => {
  it('offers 2–3 named variants with unique ids', () => {
    expect(MUSIC_VARIANTS.length).toBeGreaterThanOrEqual(2)
    expect(MUSIC_VARIANTS.length).toBeLessThanOrEqual(3)
    const ids = MUSIC_VARIANTS.map(v => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('the default variant exists and is what scenarios use', () => {
    expect(getVariant(DEFAULT_VARIANT_ID).id).toBe(DEFAULT_VARIANT_ID)
    expect(DEFAULT_MUSIC).toBe(trackPath(DEFAULT_VARIANT_ID))
    expect(variantForTrack(DEFAULT_MUSIC)?.id).toBe(DEFAULT_VARIANT_ID)
  })

  it("defaults to light-pop, Ron's pick from the PR #2337 previews", () => {
    expect(DEFAULT_VARIANT_ID).toBe('light-pop')
    expect(DEFAULT_MUSIC).toBe('music/light-pop.wav')
    // The other variants stay selectable.
    expect(MUSIC_VARIANTS.map(v => v.id)).toEqual([
      'bright-pluck',
      'light-pop',
      'warm-strum',
    ])
  })

  it('maps tracks to variants and leaves other files alone', () => {
    for (const v of MUSIC_VARIANTS) {
      expect(variantForTrack(trackPath(v.id))).toBe(v)
    }
    expect(variantForTrack('music/licensed-song.mp3')).toBeUndefined()
    expect(variantForTrack('music/calm-pad.wav')).toBeUndefined()
  })

  it('rejects an unknown variant, naming the known ones', () => {
    expect(() => getVariant('dirge')).toThrow(/Unknown music variant "dirge"/)
    expect(() => getVariant('dirge')).toThrow(MUSIC_VARIANTS[0]?.id ?? '')
  })

  it('the track outlasts every scenario and the longest allowed clip', () => {
    expect(TRACK_SEC).toBeGreaterThanOrEqual(MAX_DURATION_SEC)
    for (const s of Object.values(SCENARIOS)) {
      expect(TRACK_SEC, s.id).toBeGreaterThanOrEqual(s.durationSec)
    }
  })
})

describe('midiToHz', () => {
  it('tunes A4 to 440 Hz and C4 to middle C', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6)
    expect(midiToHz(60)).toBeCloseTo(261.626, 2)
  })
})

describe.each(MUSIC_VARIANTS)('variant $id', variant => {
  const score = buildScore(variant, TRACK_SEC)
  const barSec = (60 / variant.bpm) * variant.beatsPerBar

  it('is upbeat: 100–120 BPM in 4/4', () => {
    expect(variant.bpm).toBeGreaterThanOrEqual(100)
    expect(variant.bpm).toBeLessThanOrEqual(120)
    expect(variant.beatsPerBar).toBe(4)
  })

  it('follows I–V–vi–IV, one chord per bar', () => {
    expect(variant.progression).toEqual(['I', 'V', 'vi', 'IV'])
    const tonic = variant.tonicMidi
    expect(
      [0, 1, 2, 3].map(i => chordRoot(tonic, variant.progression[i]!) % 12)
    ).toEqual([0, 7, 9, 5].map(s => (tonic + s) % 12))
    for (const e of score.filter(e => e.voice === 'bass')) {
      const bar = Math.floor(e.startSec / barSec + 1e-9)
      const roman = variant.progression[bar % variant.progression.length]!
      expect(e.midi[0]! % 12).toBe(chordRoot(tonic, roman) % 12)
    }
  })

  it('stays in the major key', () => {
    for (const e of pitched(score)) {
      for (const m of e.midi) {
        expect(MAJOR_SCALE).toContain((m - variant.tonicMidi + 120) % 12)
      }
    }
  })

  it('sits in a brighter register than the old pad (lowest note F2)', () => {
    const lead = pitched(score).filter(e => e.voice !== 'bass')
    const bass = score.filter(e => e.voice === 'bass')
    expect(lead.length).toBeGreaterThan(0)
    expect(bass.length).toBeGreaterThan(0)
    const leadNotes = lead.flatMap(e => e.midi)
    // C4 and up for the melody, no higher than C6 so it never turns shrill.
    expect(Math.min(...leadNotes)).toBeGreaterThanOrEqual(60)
    expect(Math.max(...leadNotes)).toBeLessThanOrEqual(84)
    // Bass from C3 up: well above the old pad's F2/G2/A2 roots.
    expect(Math.min(...bass.flatMap(e => e.midi))).toBeGreaterThanOrEqual(48)
  })

  it('plays short notes: plucked or arpeggiated, not sustained chords', () => {
    const lead = pitched(score).filter(e => e.voice !== 'bass')
    const stepSec = 60 / variant.bpm / 2
    // At least an eighth-note's worth of onsets per bar on average.
    const bars = TRACK_SEC / barSec
    expect(lead.length / bars).toBeGreaterThanOrEqual(4)
    for (const e of score) {
      expect(e.decaySec, e.voice).toBeLessThanOrEqual(1.2)
    }
    expect(stepSec).toBeLessThan(0.31)
  })

  it('has a light pulse on every bar (kick and shaker)', () => {
    const bars = Math.floor(TRACK_SEC / barSec)
    for (const voice of ['kick', 'shaker'] as const) {
      const hits = score.filter(e => e.voice === voice)
      const barsHit = new Set(
        hits.map(e => Math.floor(e.startSec / barSec + 1e-9))
      )
      expect(barsHit.size, voice).toBeGreaterThanOrEqual(bars)
      for (const e of hits) expect(e.velocity, voice).toBeLessThanOrEqual(1)
    }
  })

  it('places every onset on the beat grid, from 0 to the end of the track', () => {
    const sixteenth = 60 / variant.bpm / 4
    for (const e of score) {
      const steps = e.startSec / sixteenth
      // Strum strokes spread their strings by a few ms; the stroke is on grid.
      expect(Math.abs(steps - Math.round(steps)), e.voice).toBeLessThan(1e-6)
      expect(e.startSec).toBeGreaterThanOrEqual(0)
      expect(e.startSec).toBeLessThan(TRACK_SEC)
    }
    expect(Math.min(...score.map(e => e.startSec))).toBe(0)
    expect(Math.max(...score.map(e => e.startSec))).toBeGreaterThan(
      TRACK_SEC - barSec
    )
  })

  it('is deterministic', () => {
    expect(buildScore(variant, TRACK_SEC)).toEqual(score)
  })
})

describe('variants differ', () => {
  it('in tempo and key, so Ron has a real choice', () => {
    expect(new Set(MUSIC_VARIANTS.map(v => v.bpm)).size).toBe(
      MUSIC_VARIANTS.length
    )
    expect(new Set(MUSIC_VARIANTS.map(v => v.tonicMidi % 12)).size).toBe(
      MUSIC_VARIANTS.length
    )
  })
})
