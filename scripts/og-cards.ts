/**
 * Per-district Open Graph cards (#2304) — CLI for the og-cards pipeline job.
 *
 *   npx tsx scripts/og-cards.ts rankings-date <rankings.json>
 *       print the rankings' logical date (stdout), to fetch that date's
 *       competitive-awards.json
 *   npx tsx scripts/og-cards.ts render --rankings <f> --awards <f> --out <dir>
 *       render <dir>/<id>.png per district plus <dir>/cards.json (the plan),
 *       then content-check the set (scripts/lib/ogCards.ts verifyCardSet);
 *       exit 1 if any card is missing, the wrong size or not a PNG
 *   npx tsx scripts/og-cards.ts check --plan <cards.json> --manifest <jsonl> --dir <dir>
 *       the staged re-read: <dir> holds the cards downloaded back from
 *       staging; each must be a valid card and the exact bytes the
 *       og-cards manifest recorded (verifyStagedCards); exit 1 otherwise
 *   npx tsx scripts/og-cards.ts gate --verdict <file>
 *       compare the MD5s in STAGING_RANKINGS_MD5 / PROD_RANKINGS_MD5 /
 *       STAGING_AWARDS_MD5 / PROD_AWARDS_MD5, write the promoter's verdict
 *       file (`{"promote":true|false}`) and print `promote=` and `reason=`
 *       lines for $GITHUB_OUTPUT
 *
 * Inputs may be gzip bytes (a `Content-Encoding: gzip` object downloaded
 * as stored) or plain JSON. Logs go to stderr; stdout carries only the
 * structured output above (R4). The render uses the self-hosted legacy
 * fonts, embedded as data: URLs, so it needs no network.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parseRunManifest } from './lib/runManifest'
import {
  buildDistrictCards,
  decideCardPromotion,
  renderDistrictCardHtml,
  verifyCardSet,
  verifyStagedCards,
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
} from './lib/ogCards'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONTS = join(REPO, 'frontend', 'src', 'assets', 'fonts')

function readJson(file: string): unknown {
  let buf = readFileSync(file)
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf)
  return JSON.parse(buf.toString('utf8'))
}

function arg(name: string): string {
  const i = process.argv.indexOf(name)
  const v = i > -1 ? process.argv[i + 1] : undefined
  if (!v) throw new Error(`missing ${name}`)
  return v
}

function fontCss(): string {
  const face = (family: string, file: string, weight: string) =>
    `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; src: url(data:font/woff2;base64,${readFileSync(join(FONTS, file)).toString('base64')}) format('woff2'); }`
  return [
    face('Montserrat', 'montserrat-latin.woff2', '500 900'),
    face('Source Sans 3', 'source-sans-3-latin.woff2', '400 700'),
  ].join('\n')
}

async function render(): Promise<void> {
  const out = arg('--out')
  const cards = buildDistrictCards(
    readJson(arg('--rankings')),
    readJson(arg('--awards'))
  )
  if (cards.length === 0)
    throw new Error('no district has both a ranking and an awards status')
  mkdirSync(out, { recursive: true })

  const { chromium } = await import('@playwright/test')
  const css = fontCss()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: OG_CARD_WIDTH, height: OG_CARD_HEIGHT },
      deviceScaleFactor: 1,
    })
    for (const card of cards) {
      await page.setContent(renderDistrictCardHtml(card, css), {
        waitUntil: 'load',
      })
      await page.evaluate('document.fonts.ready')
      // Layout check: no text may spill past the card's edges (a long
      // status or a 3-digit district must still fit at 1200x630).
      const spill =
        (await page.evaluate(`[...document.querySelectorAll('.wrap *')]
        .map(e => e.getBoundingClientRect())
        .some(r => r.right > ${OG_CARD_WIDTH} - 24 || r.bottom > ${OG_CARD_HEIGHT} - 16)`)) as boolean
      if (spill)
        throw new Error(
          `card ${card.districtId}: text overflows the 1200x630 card`
        )
      await page.screenshot({
        path: join(out, `${card.districtId}.png`),
        type: 'png',
      })
    }
  } finally {
    await browser.close()
  }

  const ids = cards.map(c => c.districtId)
  writeFileSync(
    join(out, 'cards.json'),
    JSON.stringify({ date: cards[0]!.asOf, ids }, null, 2)
  )
  const files = new Map(
    readdirSync(out)
      .filter(f => f.endsWith('.png'))
      .map(f => [f, readFileSync(join(out, f))] as const)
  )
  const check = verifyCardSet(ids, files)
  if (!check.ok) {
    for (const p of check.problems) console.error(`[og-cards] ✗ ${p}`)
    throw new Error(
      `${check.problems.length} card problem(s); nothing to upload`
    )
  }
  console.error(
    `[og-cards] rendered and checked ${ids.length} cards as of ${cards[0]!.asOf}`
  )
}

function check(): void {
  const plan = readJson(arg('--plan')) as { ids?: unknown }
  if (!Array.isArray(plan.ids)) throw new Error('cards.json: no ids')
  const ids = plan.ids as string[]
  const manifest = parseRunManifest(readFileSync(arg('--manifest'), 'utf8'))
  const dir = arg('--dir')
  const staged = new Map(
    readdirSync(dir)
      .filter(f => f.endsWith('.png'))
      .map(f => [f, readFileSync(join(dir, f))] as const)
  )
  const r = verifyStagedCards(ids, manifest, staged)
  if (!r.ok) {
    for (const p of r.problems) console.error(`[og-cards] ✗ ${p}`)
    throw new Error(
      `${r.problems.length} staged card problem(s); nothing to promote`
    )
  }
  console.error(`[og-cards] staging holds the ${ids.length} checked cards`)
}

function gate(): void {
  const env = (k: string) => (process.env[k] ?? '').trim()
  const verdict = decideCardPromotion({
    stagingRankings: env('STAGING_RANKINGS_MD5'),
    prodRankings: env('PROD_RANKINGS_MD5'),
    stagingAwards: env('STAGING_AWARDS_MD5'),
    prodAwards: env('PROD_AWARDS_MD5'),
  })
  console.error(
    verdict.promote
      ? '[og-cards] prod serves the cards’ source data: promote'
      : `[og-cards] hold: ${verdict.reason}`
  )
  writeFileSync(arg('--verdict'), JSON.stringify({ promote: verdict.promote }))
  process.stdout.write(`promote=${verdict.promote}\nreason=${verdict.reason}\n`)
}

async function main(): Promise<void> {
  const cmd = process.argv[2]
  if (cmd === 'rankings-date') {
    const r = readJson(process.argv[3] ?? '') as { date?: unknown }
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      throw new Error('rankings: no YYYY-MM-DD date')
    }
    process.stdout.write(`${r.date}\n`)
  } else if (cmd === 'render') {
    await render()
  } else if (cmd === 'check') {
    check()
  } else if (cmd === 'gate') {
    gate()
  } else {
    throw new Error(
      `unknown command ${JSON.stringify(cmd)} (rankings-date | render | check | gate)`
    )
  }
}

main().catch(err => {
  console.error(`[og-cards] ${(err as Error).message}`)
  process.exit(1)
})
