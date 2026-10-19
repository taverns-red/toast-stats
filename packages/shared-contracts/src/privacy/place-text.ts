/**
 * No meeting credential, link or email in any published place text (#2157).
 *
 * TI's Find-A-Club place fields (city, region, postal code, street,
 * `Location`, meeting day and time) and the reports `location` are free
 * text the club types. #2069 removed links and emails (`stripLinks`); a D02
 * club then turned out to have typed its meeting passcode into its CITY,
 * which reached the public clubs-by-region shards. A passcode or meeting id
 * is a way into the meeting just as a link is.
 *
 * `scrubPlaceText` is the one scrub for every free-text place field: links
 * and emails (`stripLinks`) plus meeting credentials. A credential is a
 * label and its value:
 * - passcode / password / passwd / pwd / access code / mot de passe /
 *   code d'accès, followed by any value ("Passcode: x0x0", "pwd=Ab0");
 * - PIN, followed by digits ("PIN 0000"; "Pin Oak", "Pinner" are places);
 * - a meeting, Zoom, Teams, webinar or conference id or number, followed by
 *   digits, spaced or not;
 * - a bare "ID" only with a ":" or "#" and digits ("ID: 000 0000"), so a
 *   US state code and ZIP ("Boise, ID 83702") is a place.
 * Text with none of these is returned unchanged, byte for byte.
 *
 * One implementation for the collector (ingest), analytics-core, the
 * contact-strip repair tool and the frontend (defence in depth).
 */
import { containsLink, stripLinks } from './meeting-links.js'

/** Digits, possibly in spaced or dashed groups ("000 0000 0000"). */
const DIGITS = String.raw`\d+(?:[ \-.]\d+)*`

/** Labels whose value may be any token. */
const SECRET_LABEL = String.raw`(?:pass\s*code|pass\s*word|passwd|pwd|access\s*code|mot\s+de\s+passe|code\s+d['’]acc[eè]s)`

/** Labels whose value is digits. */
const ID_LABEL = String.raw`(?:(?:meeting|mtg\.?|zoom|teams|webex|webinar|conference)\s*(?:id|number|no\.?|#)|pin)`

/** A separator between a label and its value ("is", ":", "#", "="). */
const SEP = String.raw`\s*(?:\bis\b\s*)?[:#=]?\s*`

const CREDENTIAL_SOURCE = [
  // "Passcode: x0x0", "password is x0x0", "pwd=Ab0" (any token value).
  String.raw`\b${SECRET_LABEL}\b${SEP}(?:${DIGITS}(?![^\s,;()])|[^\s,;()]+)`,
  // "Meeting ID: 000 0000 0000", "PIN 0000" (digit values).
  String.raw`\b${ID_LABEL}(?![a-z])${SEP}${DIGITS}`,
  // "ID: 000 0000", "ID# 000" (a bare id needs ":" or "#").
  String.raw`\bid\s*[:#]\s*${DIGITS}`,
  // A secret label whose value is gone ("Passcode:" at the end).
  String.raw`\b${SECRET_LABEL}\b\s*[:#=]\s*(?=$|[,;)])`,
].join('|')

const CREDENTIAL = new RegExp(CREDENTIAL_SOURCE, 'gi')
/** Non-global copy for tests (no `lastIndex` state). */
const ANY_CREDENTIAL = new RegExp(CREDENTIAL_SOURCE, 'i')

/** True when the text carries a meeting credential (label and value). */
export function containsMeetingCredential(text: string): boolean {
  return ANY_CREDENTIAL.test(text)
}

/** True when the text carries a meeting credential, a link or an email. */
export function containsPlaceSecret(text: string): boolean {
  return containsMeetingCredential(text) || containsLink(text)
}

/** Separators a removal leaves behind, tidied (as `stripLinks` does). */
function tidy(text: string): string {
  return text
    .replace(/\(\s*[,;:|.-]*\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;|)])/g, '$1')
    .replace(/([,;|])(?:\s*[,;|])+/g, '$1')
    .replace(/^[\s,;:|/–—-]+|[\s,;:|/–—-]+$/g, '')
}

/**
 * The text with every meeting credential removed, separators tidied. Text
 * with no credential is returned unchanged; text that was only a credential
 * becomes "".
 */
export function stripMeetingCredentials(text: string): string {
  if (!containsMeetingCredential(text)) return text
  return tidy(text.replace(CREDENTIAL, ' '))
}

/**
 * The one scrub for published place text (#2157): links and emails
 * (`stripLinks`, #2069), then meeting credentials. Text with none is
 * returned unchanged; text that was only those becomes "".
 */
export function scrubPlaceText(text: string): string {
  return stripMeetingCredentials(stripLinks(text))
}
