import type { MusicVariant, Roman } from './variants'

export type Voice = 'lead' | 'strum' | 'bass' | 'kick' | 'shaker'

export interface ScoreEvent {
  voice: Voice
  startSec: number
  /** MIDI notes sounded; empty for the kick and shaker. */
  midi: readonly number[]
  velocity: number
  decaySec: number
  stroke?: 'down' | 'up'
}

export function midiToHz(_midi: number): number {
  throw new Error('not implemented (#2336 red)')
}

export function chordRoot(_tonicMidi: number, _roman: Roman): number {
  throw new Error('not implemented (#2336 red)')
}

export function buildScore(
  _variant: MusicVariant,
  _durationSec: number
): ScoreEvent[] {
  throw new Error('not implemented (#2336 red)')
}
