/**
 * The how-to videos' background music: original tracks synthesised from a
 * score at render time (#2336), so there is no sample, loop or recording to
 * license. Each variant is a short, looping I–V–vi–IV groove in a major key
 * at 100–120 BPM: plucked or strummed notes with short envelopes over a soft
 * kick and a filtered-noise shaker. It replaces the slow, low, echoing pad
 * Ron heard as "foreboding" (#2336).
 *
 * Pick one per scenario (`music: trackPath('light-pop')`) or per render
 * (`npm run videos:render -- v2 --music light-pop`).
 */

export type Roman = 'I' | 'ii' | 'iii' | 'IV' | 'V' | 'vi'

/**
 * Chord tones an arpeggio step can reach, counted up from C4: 0 is the
 * chord's lowest tone at or above C4, 1 the next one up, and so on. Counting
 * from a fixed floor (inversions, not root position) keeps every chord in
 * the same bright octave and the hand moving by small steps.
 */
export type ChordTone = 0 | 1 | 2 | 3 | 4

/** One step of a strum pattern: a down-stroke, an up-stroke or a rest. */
export type Stroke = 'down' | 'up' | null

export interface MusicVariant {
  id: string
  /** Human name for the PR comment and README. */
  label: string
  bpm: number
  beatsPerBar: 4
  /** Key name, for people; `tonicMidi` is what the score uses. */
  key: string
  /** The key's tonic as a MIDI note (C4 = 60); its pitch class sets the key. */
  tonicMidi: number
  /** One chord per bar, looping. */
  progression: readonly Roman[]
  /** Melodic voice: plucked string or soft mallet, one note per step. */
  lead?: {
    timbre: 'pluck' | 'mallet'
    stepsPerBeat: 2 | 4
    /** One bar of chord-tone indices; `null` is a rest. */
    pattern: readonly (ChordTone | null)[]
    /** Seconds for the note to die away (~ -60 dB). */
    decaySec: number
    gain: number
  }
  /** Strummed chords: every stroke sounds chord tones 0–3. */
  strum?: {
    stepsPerBeat: 2
    pattern: readonly Stroke[]
    decaySec: number
    gain: number
  }
  /** Short bass notes on the chord root, at these beats of the bar (0-based). */
  bass: { beats: readonly number[]; decaySec: number; gain: number }
  /** Soft kick-like thump at these beats of the bar. */
  kick: { beats: readonly number[]; gain: number }
  /** Filtered-noise shaker, `stepsPerBeat` hits a beat, off-beats accented. */
  shaker: { stepsPerBeat: 2 | 4; gain: number }
}

/** Length of every generated track: the longest allowed clip (34 s) plus room. */
export const TRACK_SEC = 36

const I_V_VI_IV: readonly Roman[] = ['I', 'V', 'vi', 'IV']

export const MUSIC_VARIANTS: readonly MusicVariant[] = [
  {
    id: 'bright-pluck',
    label: 'Bright pluck — 112 BPM, C major, plucked eighth-note arpeggio',
    bpm: 112,
    beatsPerBar: 4,
    key: 'C major',
    tonicMidi: 60,
    progression: I_V_VI_IV,
    lead: {
      timbre: 'pluck',
      stepsPerBeat: 2,
      pattern: [0, 2, 3, 2, 4, 2, 3, 1],
      decaySec: 0.9,
      gain: 0.55,
    },
    bass: { beats: [0, 2, 2.5], decaySec: 0.45, gain: 0.5 },
    kick: { beats: [0, 2], gain: 0.55 },
    shaker: { stepsPerBeat: 2, gain: 0.16 },
  },
  {
    id: 'light-pop',
    label: 'Light pop — 120 BPM, G major, mallet riff over a four-on-the-floor',
    bpm: 120,
    beatsPerBar: 4,
    key: 'G major',
    tonicMidi: 67,
    progression: I_V_VI_IV,
    lead: {
      timbre: 'mallet',
      stepsPerBeat: 4,
      pattern: [
        0,
        null,
        2,
        null,
        3,
        null,
        2,
        1,
        null,
        2,
        3,
        null,
        4,
        null,
        2,
        null,
      ],
      decaySec: 0.5,
      gain: 0.5,
    },
    bass: { beats: [0, 0.5, 1.5, 2, 2.5, 3.5], decaySec: 0.3, gain: 0.45 },
    kick: { beats: [0, 1, 2, 3], gain: 0.5 },
    shaker: { stepsPerBeat: 4, gain: 0.12 },
  },
  {
    id: 'warm-strum',
    label: 'Warm strum — 100 BPM, D major, acoustic-style strummed chords',
    bpm: 100,
    beatsPerBar: 4,
    key: 'D major',
    tonicMidi: 62,
    progression: I_V_VI_IV,
    strum: {
      stepsPerBeat: 2,
      // The classic down, down-up, up-down-up.
      pattern: ['down', null, 'down', 'up', null, 'up', 'down', 'up'],
      decaySec: 1.1,
      gain: 0.4,
    },
    bass: { beats: [0, 2], decaySec: 0.6, gain: 0.5 },
    kick: { beats: [0, 2], gain: 0.4 },
    shaker: { stepsPerBeat: 2, gain: 0.1 },
  },
]

export const DEFAULT_VARIANT_ID = 'bright-pluck'

export function getVariant(id: string): MusicVariant {
  const variant = MUSIC_VARIANTS.find(v => v.id === id)
  if (!variant) {
    throw new Error(
      `Unknown music variant "${id}". Known: ${MUSIC_VARIANTS.map(v => v.id).join(', ')}`
    )
  }
  return variant
}

/** Where a variant's generated track lives, relative to `videos/public/`. */
export function trackPath(id: string): string {
  return `music/${id}.wav`
}

/** The variant a `public/`-relative track path names, if it is generated. */
export function variantForTrack(path: string): MusicVariant | undefined {
  return MUSIC_VARIANTS.find(v => trackPath(v.id) === path)
}
