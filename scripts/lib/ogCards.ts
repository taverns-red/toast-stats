/**
 * Per-district Open Graph share cards (#2304) — pure functions.
 *
 * The `og-cards` job in data-pipeline.yml renders one 1200x630 PNG per
 * district (scripts/og-cards.ts) and publishes it at a STABLE path,
 * `og/v1/district/<id>.png`, overwritten daily. The per-district HTML stubs
 * the frontend build writes (scripts/lib/ogStubs.ts) point their og:image at
 * that path on the CDN, so the stubs change only at release while the image
 * changes with the data.
 *
 * Content (Ron, 2026-10-28): the district, its Distinguished District status
 * and the gap to the next tier, and the as-of date. The gap integers are the
 * ones the Overview trophy case shows (DistinguishedDistrictTrophyCase):
 * the canonical `*Remaining` fields of competitive-awards.json when the next
 * tier is Distinguished (they count down to the minimum tier, #686), else
 * analytics-core's `remainingToDistrictTier` over the rankings row (#2307).
 *
 * Placement: `og/` is outside every prefix the data pipeline promotes, gates
 * or prunes (DATA_PREFIXES in videoPublish.ts), so scoped promotion and the
 * content gates never see it. Staging first: the job uploads to staging and
 * copies to prod only when `decideCardPromotion` finds prod serving the
 * exact rankings and awards objects the cards were drawn from.
 *
 * Palette: the legacy app palette only until Phase 2 (#2080) — Loyal Blue,
 * ink and surface neutrals. No --rt-stats amber, no --rt-paper.
 */

import { remainingToDistrictTier } from '@taverns-red/analytics-core'
import type { DistrictRecognitionTier } from '@taverns-red/analytics-core'
import { createHash } from 'node:crypto'
import { OG_DISTRICT_PREFIX } from './ogCardPaths.js'
import type { RunManifestEntry } from './runManifest.js'

export { OG_DISTRICT_PREFIX }

export const OG_CARD_WIDTH = 1200
export const OG_CARD_HEIGHT = 630
/** One of the pipeline's existing TTL profiles (#1380): an hour. */
export const OG_CACHE_CONTROL = 'public, max-age=3600'
export const OG_CONTENT_TYPE = 'image/png'
/** A rendered text card is ~45 KB; outside this range something broke. */
export const OG_MIN_BYTES = 5_000
export const OG_MAX_BYTES = 400_000

/** District ids are short alphanumerics ("61", "F", "U"). */
const DISTRICT_ID = /^[A-Za-z0-9]{1,8}$/

export function assertDistrictId(id: unknown): string {
  if (typeof id !== 'string' || !DISTRICT_ID.test(id)) {
    throw new Error(
      `refusing district id ${JSON.stringify(id)}: not a plain district id`
    )
  }
  return id
}

export function ogDistrictCardPath(id: string): string {
  return `${OG_DISTRICT_PREFIX}${assertDistrictId(id)}.png`
}

type Tier =
  | 'Unknown'
  | 'NotDistinguished'
  | 'Distinguished'
  | 'Select'
  | 'Presidents'
  | 'Smedley'

/* Mirrors TIER_LABELS in frontend DistinguishedDistrictTrophyCase.tsx (the
   achieved titles come from recognitionRegistry's TIER_TITLES). */
const TIER_LABELS: Record<Tier, string> = {
  Unknown: 'Recognition Unknown',
  NotDistinguished: 'Not Yet Distinguished',
  Distinguished: 'Distinguished District',
  Select: 'Select Distinguished District',
  Presidents: "President's Distinguished District",
  Smedley: 'Smedley Distinguished District',
}

const ACHIEVED: ReadonlySet<Tier> = new Set([
  'Distinguished',
  'Select',
  'Presidents',
  'Smedley',
])

export interface CardGap {
  label: string
  count: number
}

export interface DistrictCard {
  districtId: string
  title: string
  region: string | null
  tier: Tier
  statusLabel: string
  nextTierLabel: string | null
  gaps: CardGap[]
  asOf: string
  asOfLabel: string
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** "2026-10-01" → "Oct 1, 2026", parsed as text (no timezone shift). */
export function formatAsOfDate(date: string): string {
  const m = ISO_DATE.exec(date)
  if (!m) throw new Error(`not a YYYY-MM-DD date: ${date}`)
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`
}

/** The program year a logical date belongs to (July starts a year). */
function programYearOf(date: string): string {
  const m = ISO_DATE.exec(date)!
  const y = Number(m[1])
  const start = Number(m[2]) >= 7 ? y : y - 1
  return `${start}-${start + 1}`
}

interface RankingRow {
  districtId: string
  region?: string
  paidClubBase: number
  paymentBase: number
  paidClubs: number
  totalPayments: number
  distinguishedClubs: number
}

interface AwardsStatus {
  currentTier: Tier
  nextTierGap: { tier: Tier } | null
  paidClubsRemaining?: number
  paymentsRemaining?: number
  distinguishedClubsRemaining?: number
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

function regionLabel(region: unknown): string | null {
  if (typeof region !== 'string' || !/^\d{1,2}$/.test(region)) return null
  return `Region ${Number(region)}`
}

function gapsFor(status: AwardsStatus, row: RankingRow, py: string): CardGap[] {
  const next = status.nextTierGap?.tier
  if (!next || !ACHIEVED.has(next)) return []
  let paid: number | undefined
  let payments: number | undefined
  let dist: number | undefined
  if (next === 'Distinguished') {
    paid = status.paidClubsRemaining
    payments = status.paymentsRemaining
    dist = status.distinguishedClubsRemaining
  }
  if (!isNum(paid) || !isNum(payments) || !isNum(dist)) {
    const derived = remainingToDistrictTier(
      row,
      next as DistrictRecognitionTier,
      py
    )
    if (!derived) return []
    paid = isNum(paid) ? paid : derived.paidClubsRemaining
    payments = isNum(payments) ? payments : derived.paymentsRemaining
    dist = isNum(dist) ? dist : derived.distinguishedClubsRemaining
  }
  return [
    { label: 'Paid Clubs', count: paid },
    { label: 'Payments', count: payments },
    { label: 'Distinguished Clubs', count: dist },
  ]
}

/**
 * One card per district present in BOTH v1/rankings.json and the date's
 * competitive-awards.json, sorted by id. A district the awards file does not
 * cover gets no card (prod keeps its previous one) rather than a made-up
 * status. Malformed input throws.
 */
export function buildDistrictCards(
  rankings: unknown,
  awards: unknown
): DistrictCard[] {
  if (
    !isObj(rankings) ||
    typeof rankings['date'] !== 'string' ||
    !ISO_DATE.test(rankings['date'])
  ) {
    throw new Error('rankings: no YYYY-MM-DD date')
  }
  if (!Array.isArray(rankings['rankings'])) {
    throw new Error('rankings: no rankings array')
  }
  const date = rankings['date']
  const py = programYearOf(date)
  const statuses =
    isObj(awards) && isObj(awards['distinguishedDistrict'])
      ? awards['distinguishedDistrict']
      : null
  if (!statuses)
    throw new Error('competitive-awards: no distinguishedDistrict map')

  const cards: DistrictCard[] = []
  for (const raw of rankings['rankings'] as unknown[]) {
    if (!isObj(raw)) throw new Error('rankings: a row is not an object')
    const id = assertDistrictId(raw['districtId'])
    const status = statuses[id]
    if (!isObj(status)) continue
    for (const k of [
      'paidClubBase',
      'paymentBase',
      'paidClubs',
      'totalPayments',
      'distinguishedClubs',
    ]) {
      if (!isNum(raw[k]))
        throw new Error(`rankings: district ${id} has no numeric ${k}`)
    }
    const s = status as unknown as AwardsStatus
    const tier: Tier = s.currentTier in TIER_LABELS ? s.currentTier : 'Unknown'
    const next = s.nextTierGap?.tier
    const gaps = gapsFor(s, raw as unknown as RankingRow, py)
    cards.push({
      districtId: id,
      title: `District ${id}`,
      region: regionLabel(raw['region']),
      tier,
      statusLabel: TIER_LABELS[tier],
      nextTierLabel:
        next && ACHIEVED.has(next) && gaps.length ? TIER_LABELS[next] : null,
      gaps,
      asOf: date,
      asOfLabel: formatAsOfDate(date),
    })
  }
  return cards.sort((a, b) =>
    a.districtId.localeCompare(b.districtId, 'en', { numeric: true })
  )
}

/* The tile caption says what is still NEEDED, so "21" never reads as the
   district's count (#2389 review): "more paid clubs", or "… met" at 0. */
const GAP_NOUNS: Record<string, [string, string]> = {
  'Paid Clubs': ['paid club', 'paid clubs'],
  Payments: ['payment', 'payments'],
  'Distinguished Clubs': ['Distinguished club', 'Distinguished clubs'],
}

function gapPhrase(g: CardGap): string {
  const [one, many] = GAP_NOUNS[g.label] ?? [g.label, g.label]
  if (g.count === 0)
    return `${many.charAt(0).toUpperCase()}${many.slice(1)} met`
  return `more ${g.count === 1 ? one : many}`
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* Legacy palette (frontend/src/styles/tokens/colors.css, redesign.css). */
const C = {
  loyalBlue: '#004165',
  loyalBlueTint: '#e6eef3',
  ink: '#0f1720',
  ink2: '#344052',
  ink3: '#5b6675',
  surface: '#ffffff',
  surface2: '#f9fafb',
  line: '#e5e7eb',
}

/**
 * The card as a self-contained 1200x630 page. `fontCss` carries the
 * @font-face rules (data: URLs of the self-hosted Montserrat and Source
 * Sans 3), so the render needs no network.
 */
export function renderDistrictCardHtml(
  card: DistrictCard,
  fontCss = ''
): string {
  const achieved = ACHIEVED.has(card.tier)
  const tiles = card.gaps
    .map(g => {
      const met = g.count === 0
      return `<div class="tile"><div class="num${met ? ' met' : ''}">${met ? '✓' : esc(g.count.toLocaleString('en-US'))}</div><div class="lbl">${esc(gapPhrase(g))}</div></div>`
    })
    .join('')
  const gapBlock = card.nextTierLabel
    ? `<div class="gaphead">Gap to ${esc(card.nextTierLabel)}</div><div class="tiles">${tiles}</div>`
    : `<div class="top">Top tier reached</div>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; }
body { background: ${C.surface}; color: ${C.ink}; font-family: 'Source Sans 3', system-ui, sans-serif; position: relative; overflow: hidden; }
.band { position: absolute; left: 0; top: 0; bottom: 0; width: 24px; background: ${C.loyalBlue}; }
.wrap { position: absolute; left: 88px; right: 72px; top: 46px; bottom: 40px; display: flex; flex-direction: column; }
.kicker { font-size: 30px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.ink3}; }
.row { margin-top: 2px; }
.title { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 96px; line-height: 1.05; letter-spacing: -0.02em; color: ${C.ink}; white-space: nowrap; }
.pill { display: inline-block; margin-top: 10px; font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 34px; padding: 10px 26px; border-radius: 999px; white-space: nowrap; }
.pill.on { background: ${C.loyalBlue}; color: #ffffff; }
.pill.off { background: ${C.surface2}; color: ${C.ink2}; border: 3px solid ${C.line}; }
.gaphead { margin-top: 26px; font-size: 34px; font-weight: 600; color: ${C.ink2}; }
.tiles { display: flex; gap: 24px; margin-top: 16px; }
.tile { flex: 1; border: 3px solid ${C.line}; border-radius: 16px; padding: 14px 22px; background: ${C.surface2}; }
.num { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 64px; line-height: 1; color: ${C.ink}; font-variant-numeric: tabular-nums; }
.num.met { color: ${C.loyalBlue}; }
.lbl { margin-top: 8px; font-size: 29px; line-height: 1.15; font-weight: 600; color: ${C.ink3}; }
.top { margin-top: 40px; font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 56px; color: ${C.loyalBlue}; }
.foot { margin-top: auto; display: flex; justify-content: space-between; align-items: baseline; font-size: 32px; color: ${C.ink2}; }
.host { font-family: 'Montserrat', sans-serif; font-weight: 700; color: ${C.loyalBlue}; }
</style></head><body>
<div class="band"></div>
<div class="wrap">
<div class="kicker">Toastmasters${card.region ? ` · ${esc(card.region)}` : ''}</div>
<div class="row"><div class="title">${esc(card.title)}</div><div class="pill ${achieved ? 'on' : 'off'}">${esc(card.statusLabel)}</div></div>
${gapBlock}
<div class="foot"><span>As of ${esc(card.asOfLabel)}</span><span class="host">ts.taverns.red</span></div>
</div>
</body></html>`
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

/** Width and height from a PNG's IHDR chunk, or null if not a PNG. */
export function readPngSize(
  buf: Buffer
): { width: number; height: number } | null {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/**
 * The content check before anything is uploaded: exactly one plausible
 * 1200x630 PNG per planned card, nothing else. An empty plan fails.
 */
export function verifyCardSet(
  plannedIds: readonly string[],
  files: ReadonlyMap<string, Buffer>
): { ok: boolean; problems: string[] } {
  const problems: string[] = []
  if (plannedIds.length === 0) problems.push('no cards planned')
  const planned = new Set(plannedIds.map(id => `${assertDistrictId(id)}.png`))
  const names = [...new Set([...planned, ...files.keys()])].sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true })
  )
  for (const name of names) {
    const buf = files.get(name)
    if (!planned.has(name)) {
      problems.push(`${name}: not a planned card`)
      continue
    }
    if (!buf) {
      problems.push(`${name}: missing`)
      continue
    }
    const size = readPngSize(buf)
    if (!size) {
      problems.push(`${name}: not a PNG`)
      continue
    }
    if (size.width !== OG_CARD_WIDTH || size.height !== OG_CARD_HEIGHT) {
      problems.push(
        `${name}: ${size.width}x${size.height}, expected ${OG_CARD_WIDTH}x${OG_CARD_HEIGHT}`
      )
      continue
    }
    if (buf.length < OG_MIN_BYTES || buf.length > OG_MAX_BYTES) {
      problems.push(
        `${name}: ${buf.length} bytes, outside ${OG_MIN_BYTES}..${OG_MAX_BYTES}`
      )
    }
  }
  return { ok: problems.length === 0, problems }
}

export interface SourceHashes {
  stagingRankings: string
  prodRankings: string
  stagingAwards: string
  prodAwards: string
}

/**
 * The promotion gate. The cards were drawn from staging's rankings and
 * awards objects; they may reach prod only when prod serves those exact
 * objects (same MD5), i.e. the pipeline's gates promoted that data. A held
 * or not-yet-promoted date holds its cards; a missing hash fails closed.
 */
export function decideCardPromotion(h: SourceHashes): {
  promote: boolean
  reason: string
} {
  const pairs: Array<[string, string, string]> = [
    ['v1/rankings.json', h.stagingRankings, h.prodRankings],
    ['competitive-awards.json', h.stagingAwards, h.prodAwards],
  ]
  for (const [name, staging, prod] of pairs) {
    if (!staging || !prod) {
      return { promote: false, reason: `no MD5 for ${name} in staging or prod` }
    }
    if (staging !== prod) {
      return {
        promote: false,
        reason: `prod ${name} differs from the staging copy the cards were drawn from`,
      }
    }
  }
  return { promote: true, reason: '' }
}

/**
 * The staged re-read: what staging now holds for every planned card is a
 * valid card (verifyCardSet) AND the exact bytes gcs-upload.sh recorded in
 * the og-cards manifest. Run on objects downloaded back from staging, so the
 * promote copies only bytes this job checked.
 */
export function verifyStagedCards(
  plannedIds: readonly string[],
  manifest: readonly RunManifestEntry[],
  staged: ReadonlyMap<string, Buffer>
): { ok: boolean; problems: string[] } {
  const { problems } = verifyCardSet(plannedIds, staged)
  const recorded = new Map(manifest.map(e => [e.path, e.sha256]))
  for (const id of plannedIds) {
    const name = `${id}.png`
    const buf = staged.get(name)
    if (!buf) continue
    const want = recorded.get(ogDistrictCardPath(id))
    if (!want) problems.push(`${name}: not in the og-cards manifest`)
    else if (createHash('sha256').update(buf).digest('hex') !== want) {
      problems.push(`${name}: staged bytes differ from the recorded upload`)
    }
  }
  return { ok: problems.length === 0, problems }
}
