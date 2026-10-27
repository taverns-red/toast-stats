import { FORM_FACTORS, type Scenario, type TimedCard } from './types'

/** Clips are ~30 s; anything longer stops being a "30-second how-to". */
export const MAX_DURATION_SEC = 34
/** A caption must be readable in one glance on a phone. */
export const MAX_CAPTION_WORDS = 12
/** Shortest beat a viewer can read a 12-word caption in. */
export const MIN_BEAT_SEC = 3
/**
 * ALL-CAPS hyphenated tokens like YOUR-DISTRICT: a viewer can't tell what
 * format to type (Ron, PR #2295). Show a real example plus a hint instead.
 */
const PLACEHOLDER = /\b[A-Z]{2,}(?:-[A-Z]{2,})+\b/g

/**
 * Counts and shares drift day to day, so a caption that quotes one is wrong
 * by the next snapshot (#2353): say what is shown instead. A percentage or a
 * number of two or more digits is flagged; a year (19xx/20xx), a one-digit
 * name such as "Round 1" or "Goals 7 and 8", and anything inside a URL-like
 * token (one containing "/" or a dotted host) are fine.
 */
export function driftingNumbers(caption: string): string[] {
  const found: string[] = []
  for (const token of caption.split(/\s+/)) {
    if (/[/]|[a-z]\.[a-z]/i.test(token)) continue
    for (const match of token.matchAll(/\d[\d,.]*%?/g)) {
      const value = match[0].replace(/[.,]$/, '')
      if (value.endsWith('%')) found.push(value)
      else if (/^(19|20)\d\d$/.test(value)) continue
      else if (value.replace(/\D/g, '').length >= 2) found.push(value)
    }
  }
  return found
}

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
    if (card.hint !== undefined) {
      const hintWords = countWords(card.hint)
      if (hintWords > MAX_CAPTION_WORDS) {
        problems.push(
          `${name} hint has ${hintWords} words; the limit is ${MAX_CAPTION_WORDS}`
        )
      }
    }
    for (const value of driftingNumbers(card.caption)) {
      problems.push(
        `${name} quotes "${value}"; numbers drift, so say what is shown`
      )
    }
    for (const text of [card.caption, card.hint ?? '']) {
      for (const placeholder of text.match(PLACEHOLDER) ?? []) {
        problems.push(
          `${name} shows placeholder "${placeholder}"; use a concrete example and a hint`
        )
      }
    }
    expectedStart = card.endSec
  }

  // Captions and timing are shared; each form factor scripts its own actions.
  const beatIds = new Set(beats.map(b => b.id))
  for (const format of FORM_FACTORS) {
    const form = scenario.forms[format]
    if (!form) continue
    for (const id of beatIds) {
      if (!form.beats[id]) {
        problems.push(`${format} has no actions for beat "${id}"`)
      }
    }
    for (const id of Object.keys(form.beats)) {
      if (!beatIds.has(id)) {
        problems.push(`${format} scripts unknown beat "${id}"`)
      }
    }
  }

  return problems
}
