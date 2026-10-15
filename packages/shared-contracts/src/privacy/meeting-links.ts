/**
 * No link in a club's published meeting place (#2069, #1879).
 *
 * TI's Find-A-Club place fields (`Address.Street`, `Location`) are free text
 * the club types. Some clubs put their online meeting link there, often with
 * no scheme and behind a shortener ("Zoom Link: bit.ly/…, <street>"), which
 * a scheme- or host-based check misses. A shortened link hides where it
 * goes, so any link is treated as a way into the meeting: the place keeps
 * its words and loses every URL, URL-like token, email and the "Zoom Link:"
 * style label in front of one.
 *
 * One implementation for the collector (the source) and the frontend
 * (defence in depth for files already published).
 */

/** Online meeting hosts (the #1879 list) and URL shorteners. */
const LINK_HOSTS = [
  'zoom\\.us',
  'zoomgov\\.com',
  'zoom\\.com',
  'teams\\.microsoft\\.com',
  'teams\\.live\\.com',
  'meet\\.google\\.com',
  'webex\\.com',
  'gotomeeting\\.com',
  'gotomeet\\.me',
  'meet\\.goto\\.com',
  'meet\\.jit\\.si',
  '8x8\\.vc',
  'whereby\\.com',
  'bluejeans\\.com',
  'bit\\.ly',
  'bitly\\.com',
  'tinyurl\\.com',
  't\\.co',
  't\\.ly',
  'goo\\.gl',
  'ow\\.ly',
  'is\\.gd',
  'v\\.gd',
  'buff\\.ly',
  'rebrand\\.ly',
  'cutt\\.ly',
  'shorturl\\.at',
  'tiny\\.cc',
  'rb\\.gy',
  'lnkd\\.in',
  'forms\\.gle',
  'qrco\\.de',
  'linktr\\.ee',
].join('|')

/** Bare-domain TLDs common enough to mean a site, rare enough in a street. */
const BARE_TLDS = 'com|org|net|io|info|app|link|ly|gl|gle|ee|cc|gd|vc|si'

const LINK_TOKEN = new RegExp(
  [
    // An email (mailto is a link too).
    '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
    // A scheme or www.
    '(?:[a-z][a-z0-9+.-]*:\\/\\/|www\\.)\\S+',
    // A meeting host or shortener, with or without a path.
    `(?<![\\w.-])(?:[a-z0-9-]+\\.)*(?:${LINK_HOSTS})(?![\\w-])(?:[/?#]\\S*)?`,
    // Any domain.tld/path.
    '(?<![\\w.-])(?:[a-z0-9-]+\\.)+[a-z]{2,}\\/\\S*',
    // A bare domain on a common TLD.
    `(?<![\\w.-])(?:[a-z0-9-]+\\.)+(?:${BARE_TLDS})(?![\\w-])`,
  ].join('|'),
  'gi'
)

/** Marks where a link was, so a label in front of it can be found. */
const MARK = '\u0001'

/** "Zoom Link:", "Meeting link -", "Join us at", "Zoom:" before a link. */
const LABEL_BEFORE_LINK = new RegExp(
  '(?:\\b(?:(?:zoom|teams|webex|google\\s+meet|meet(?:ing)?|online|virtual|web)\\s+)?(?:link|url)s?\\b' +
    '|\\b(?:zoom|teams|webex|google\\s+meet|join(?:\\s+us)?(?:\\s+(?:at|on|via))?)\\b)' +
    `\\s*[:=–—-]?\\s*(?=${MARK})`,
  'gi'
)

/** A link label whose link is gone ("Zoom Link: , 9 Main St"). */
const DANGLING_LABEL =
  /\b(?:(?:zoom|teams|webex|google\s+meet|meet(?:ing)?|online|virtual)\s+)?(?:link|url)s?\s*[:=]\s*(?=[,;|)]|$)/gi

/** Every link-like token, for `containsLink` (non-global: no lastIndex). */
const ANY_LINK = new RegExp(LINK_TOKEN.source, 'i')

/** True when the text carries a URL, URL-like token or email. */
export function containsLink(text: string): boolean {
  return ANY_LINK.test(text)
}

/**
 * The text with every URL, URL-like token (with or without a scheme), email
 * and link label removed, and the separators left behind tidied. Text with
 * no link is returned unchanged; text that was only a link becomes "".
 */
export function stripLinks(text: string): string {
  if (!containsLink(text)) return text
  return text
    .replace(LINK_TOKEN, MARK)
    .replace(LABEL_BEFORE_LINK, '')
    .replace(new RegExp(MARK, 'g'), ' ')
    .replace(DANGLING_LABEL, ' ')
    .replace(/\(\s*[,;:|.-]*\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;|)])/g, '$1')
    .replace(/([,;|])(?:\s*[,;|])+/g, '$1')
    .replace(/^[\s,;:|/–—-]+|[\s,;:|/–—-]+$/g, '')
}
