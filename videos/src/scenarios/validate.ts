import type { Scenario, TimedCard } from './types'

/** Clips are ~30 s; anything longer stops being a "30-second how-to". */
export const MAX_DURATION_SEC = 34
/** A caption must be readable in one glance on a phone. */
export const MAX_CAPTION_WORDS = 12
/** Shortest beat a viewer can read a 12-word caption in. */
export const MIN_BEAT_SEC = 3

/**
 * Words a viewer reads: whitespace-separated tokens that contain at least one
 * letter or digit, so a dash or bullet is not a word and a URL is one.
 */
export function countWords(caption: string): number {
  return caption.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token))
    .length
}

/**
 * Every timing and caption problem in a scenario, as human-readable lines.
 * An empty array means the scenario is valid.
 */
export function validateScenario(scenario: Scenario): string[] {
  const problems: string[] = []
  const { durationSec, titleCard, beats, closing } = scenario

  if (durationSec > MAX_DURATION_SEC) {
    problems.push(
      `duration is ${durationSec} s; the limit is ${MAX_DURATION_SEC} s`
    )
  }
  if (titleCard.startSec !== 0) {
    problems.push('title card must start at 0')
  }
  if (closing.endSec !== durationSec) {
    problems.push(`closing card must end at ${durationSec}`)
  }
  if (beats.length === 0) {
    problems.push('scenario has no beats')
  }

  const timeline: { name: string; card: TimedCard; isBeat: boolean }[] = [
    { name: 'title card', card: titleCard, isBeat: false },
    ...beats.map(b => ({ name: `beat "${b.id}"`, card: b, isBeat: true })),
    { name: 'closing card', card: closing, isBeat: false },
  ]

  let expectedStart = 0
  for (const { name, card, isBeat } of timeline) {
    if (card.startSec < 0) {
      problems.push(`${name} starts before 0 (${card.startSec} s)`)
    }
    if (card.endSec > durationSec) {
      problems.push(
        `${name} ends at ${card.endSec} s, after the duration (${durationSec} s)`
      )
    }
    if (card.startSec !== expectedStart) {
      problems.push(
        `${name} starts at ${card.startSec} s; the previous segment ends at ${expectedStart} s`
      )
    }
    const length = card.endSec - card.startSec
    if (isBeat && length < MIN_BEAT_SEC) {
      problems.push(
        `${name} lasts ${length} s; a beat needs at least ${MIN_BEAT_SEC} s to read`
      )
    }
    const words = countWords(card.caption)
    if (words === 0) {
      problems.push(`${name} has an empty caption`)
    } else if (words > MAX_CAPTION_WORDS) {
      problems.push(
        `${name} caption has ${words} words; the limit is ${MAX_CAPTION_WORDS}`
      )
    }
    expectedStart = card.endSec
  }

  return problems
}
