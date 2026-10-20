/**
 * No phone number in any published place text (#2167).
 *
 * Club phone keys are dropped at ingest (#2030), but clubs also type a
 * phone number into Find-A-Club place fields (street, city, `Location`,
 * meeting day), and those reached public snapshot JSON.
 *
 * Place text is full of numbers that are places: street, postal, suite,
 * room and box numbers, highway markers, dates and times. So a phone is
 * only a shape with a phone signal:
 * - a label and its number: tel / tél / telephone / téléphone / phone /
 *   ph / call / mobile / mob / cell / WhatsApp, then 7–15 digits
 *   ("Tel: 55550100", "Ph 555-0100"); the label goes too;
 * - a "+" country code and 8–15 digits ("+65 5555 0100", "(+1) …");
 * - the NANP 3-3-4 shape with separators ("555-555-0100",
 *   "(555) 555-0100", "555.555.0100", "1-555-555-0100");
 * - French pairs, a trunk 0 and four pairs ("05 55 55 01 00").
 * A bare digit run with none of these ("1234 5678", a 10-digit postal
 * code) stays. Text with no phone is returned unchanged, byte for byte.
 */

/** Phone digits: a first group, then groups of 2+ digits (so "Tel 555 0100
 *  9 Main St" keeps its street number). A parenthesised group is whole. */
const NUMBER = String.raw`(?:\(\+?\d+\)|\+?\d+)(?:[ .\-/]{1,3}(?:\(\d{2,}\)|\d{2,}))*`

const PHONE_LABEL = String.raw`(?:t[eé]l[eé]phone|tel|t[eé]l|phone|ph|call|mobile|mob|cell|whats\s?app)`

/** "Tel: ", "Tel. No. ", "Phone # ", "Téléphone : ". */
const LABEL_SEP = String.raw`\.?(?:\s*(?:no|nr|number)\.?)?\s*[:#=\-]?\s*`

/** Not glued to a word, a digit or a number's separator. */
const START = String.raw`(?<![\p{L}\p{N}_.\-+/])`
const END = String.raw`(?![\p{L}\p{N}_\-]|[.\/]\d)`

const RULES: { source: string; minDigits: number; maxDigits: number }[] = [
  // A label and its number.
  {
    source: String.raw`(?<![\p{L}\p{N}_])${PHONE_LABEL}(?![\p{L}])${LABEL_SEP}${NUMBER}${END}`,
    minDigits: 7,
    maxDigits: 15,
  },
  // A "+" country code: "+65 5555 0100", "(+65) 5555 0100".
  {
    source: String.raw`(?<![\p{L}\p{N}_+])\(?\+\d{1,3}\)?(?:[ .\-]?\(?\d{1,4}\)?)(?:[ .\-]?\d{2,5}){1,5}${END}`,
    minDigits: 8,
    maxDigits: 15,
  },
  // NANP 3-3-4 with separators, an optional leading 1.
  {
    source: String.raw`${START}(?:1[ .\-])?(?:\(\d{3}\)\s?|\d{3}[ .\-])\d{3}[ .\-]\d{4}${END}`,
    minDigits: 10,
    maxDigits: 11,
  },
  // French pairs: "05 55 55 01 00".
  {
    source: String.raw`${START}0[1-9](?:[ .\-]\d{2}){4}${END}`,
    minDigits: 10,
    maxDigits: 10,
  },
]

const PHONE_SOURCE = RULES.map(rule => `(${rule.source})`).join('|')

function digitCount(text: string): number {
  return text.replace(/\D/g, '').length
}

/** The rule a match came from, by its capture group. */
function isPhone(groups: (string | undefined)[]): boolean {
  return groups.some((group, i) => {
    const rule = RULES[i]
    if (group === undefined || rule === undefined) return false
    const digits = digitCount(group)
    return digits >= rule.minDigits && digits <= rule.maxDigits
  })
}

function phoneRegex(): RegExp {
  return new RegExp(PHONE_SOURCE, 'giu')
}

/** True when the text carries a phone number (a shape with a signal). */
export function containsPhoneNumber(text: string): boolean {
  for (const match of text.matchAll(phoneRegex())) {
    if (isPhone(match.slice(1))) return true
  }
  return false
}

/**
 * The text with every phone number replaced by a space. Separators are
 * left for the caller to tidy. Text with no phone is returned unchanged.
 */
export function replacePhoneNumbers(text: string): string {
  if (!containsPhoneNumber(text)) return text
  return text.replace(phoneRegex(), (match: string, ...rest: unknown[]) =>
    isPhone(rest.slice(0, RULES.length) as (string | undefined)[]) ? ' ' : match
  )
}
