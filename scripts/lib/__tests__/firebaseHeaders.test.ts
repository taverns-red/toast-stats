import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Contract test for #783 — Firebase Hosting security headers + CSP.
 *
 * A public marketing surface should emit a Content-Security-Policy plus the
 * standard hardening headers. This test pins the contract on BOTH hosting
 * targets (production AND staging) — staging matters because per-PR preview
 * channels inherit the staging site's hosting config, so the CSP must allow
 * the staging CDN bucket or previews go data-blank (cf. Lesson 093: the GCS
 * staging bucket is the preview channels' data source).
 *
 * Pure-text/JSON assertions, no runtime: firebase.json is strict JSON.
 */

const ROOT = join(__dirname, '..', '..', '..')

interface HeaderKV {
  key: string
  value: string
}
interface HeaderRule {
  source: string
  headers: HeaderKV[]
}
interface HostingTarget {
  target: string
  headers?: HeaderRule[]
}

function loadHosting(): HostingTarget[] {
  const raw = readFileSync(join(ROOT, 'firebase.json'), 'utf8')
  return JSON.parse(raw).hosting as HostingTarget[]
}

/** Every header rule for a named target, in declaration order. */
function rulesFor(targetName: string): HeaderRule[] {
  const target = loadHosting().find(t => t.target === targetName)
  expect(target, `hosting target "${targetName}" must exist`).toBeDefined()
  expect(
    target!.headers,
    `target "${targetName}" must declare header rules`
  ).toBeDefined()
  return target!.headers!
}

/** The catch-all (`source: "**"`) header rule for a named target. */
function catchAllHeaders(targetName: string): HeaderKV[] {
  const rule = rulesFor(targetName).find(r => r.source === '**')
  expect(
    rule,
    `target "${targetName}" must have a catch-all (source "**") header rule`
  ).toBeDefined()
  return rule!.headers
}

/** Index of the first rule declaring `source`, or -1. */
function ruleIndex(targetName: string, source: string): number {
  return rulesFor(targetName).findIndex(r => r.source === source)
}

/**
 * Cache-Control that Hosting will actually serve for a request matching
 * `sources` — the value from the LAST matching rule that declares the key.
 *
 * The precedence is LAST-match-wins, not first. The public docs say the
 * opposite ("Hosting applies the header defined by the first rule with a URL
 * pattern that matches the requested path"), and that wording is what makes
 * this the easiest thing in the file to get backwards. Measured against the
 * Firebase Hosting emulator, which runs superstatic — the same config engine
 * Hosting itself uses:
 *
 *   rules: ** (security) | js/css immutable | img | font | *.html no-cache | ** no-cache
 *   GET /assets/index-B5NVCpKe.js  ->  cache-control: no-cache      <- immutable LOST
 *
 * Moving the bare-`**` no-cache rule ahead of the asset rules restored it:
 *
 *   rules: ** (security) | ** no-cache | js/css immutable | img | font | *.html no-cache
 *   GET /                          ->  no-cache
 *   GET /districts                 ->  no-cache
 *   GET /assets/index-B5NVCpKe.js  ->  public, max-age=31536000, immutable
 *
 * Rules are merged per key, so the leading security rule's CSP/XFO still
 * reach every response either way (5/5 security headers on all paths above).
 */
function resolveCacheControl(
  targetName: string,
  sources: string[]
): string | undefined {
  let resolved: string | undefined
  for (const rule of rulesFor(targetName)) {
    if (!sources.includes(rule.source)) continue
    const cc = headerValue(rule.headers, 'Cache-Control')
    if (cc !== undefined) resolved = cc
  }
  return resolved
}

function headerValue(headers: HeaderKV[], key: string): string | undefined {
  return headers.find(h => h.key.toLowerCase() === key.toLowerCase())?.value
}

describe('firebase.json security headers (#783)', () => {
  it('keeps the production and staging CSP byte-identical (no drift)', () => {
    // The CSP is duplicated verbatim across both targets (JSON has no
    // variables). Per-target regex checks below can't catch a one-sided edit
    // that still matches the loose patterns — this equality assertion does.
    const cspFor = (t: string) =>
      headerValue(catchAllHeaders(t), 'Content-Security-Policy')
    expect(cspFor('production')).toBe(cspFor('staging'))
  })

  for (const targetName of ['production', 'staging']) {
    describe(`target: ${targetName}`, () => {
      const headers = () => catchAllHeaders(targetName)

      it('sets X-Content-Type-Options: nosniff', () => {
        expect(headerValue(headers(), 'X-Content-Type-Options')).toBe('nosniff')
      })

      it('sets a Referrer-Policy', () => {
        expect(headerValue(headers(), 'Referrer-Policy')).toBe(
          'strict-origin-when-cross-origin'
        )
      })

      it('denies framing (X-Frame-Options)', () => {
        expect(headerValue(headers(), 'X-Frame-Options')).toBe('DENY')
      })

      it('sets a restrictive Permissions-Policy', () => {
        const pp = headerValue(headers(), 'Permissions-Policy')
        expect(pp, 'Permissions-Policy must be present').toBeDefined()
        // Powerful features the app does not use are denied.
        expect(pp).toMatch(/camera=\(\)/)
        expect(pp).toMatch(/microphone=\(\)/)
        expect(pp).toMatch(/geolocation=\(\)/)
      })

      describe('Content-Security-Policy', () => {
        const csp = () => {
          const v = headerValue(headers(), 'Content-Security-Policy')
          expect(v, 'CSP header must be present').toBeDefined()
          return v!
        }

        it('defaults to self', () => {
          expect(csp()).toMatch(/default-src 'self'/)
        })

        it('blocks plugins and base-tag/frame hijacking', () => {
          expect(csp()).toMatch(/object-src 'none'/)
          expect(csp()).toMatch(/base-uri 'self'/)
          expect(csp()).toMatch(/frame-ancestors 'none'/)
        })

        it('allows Google Fonts (stylesheet + woff2)', () => {
          expect(csp()).toMatch(
            /style-src[^;]*https:\/\/fonts\.googleapis\.com/
          )
          expect(csp()).toMatch(/font-src[^;]*https:\/\/fonts\.gstatic\.com/)
        })

        it('allows BOTH CDN origins in connect-src (staging GCS + prod)', () => {
          // Lesson 093: previews read the staging GCS bucket; prod reads
          // cdn.taverns.red. Dropping either silently breaks data fetches.
          expect(csp()).toMatch(
            /connect-src[^;]*https:\/\/storage\.googleapis\.com/
          )
          expect(csp()).toMatch(/connect-src[^;]*https:\/\/cdn\.taverns\.red/)
        })

        it('allows Google Analytics origins', () => {
          // GA4 loads only on the prod hostname, but the policy must permit
          // it there: tag-manager script + analytics beacons.
          expect(csp()).toMatch(
            /script-src[^;]*https:\/\/www\.googletagmanager\.com/
          )
          expect(csp()).toMatch(
            /connect-src[^;]*https:\/\/www\.google-analytics\.com/
          )
        })
      })
    })
  }
})

/**
 * Contract test for #1365 — the entry document must revalidate.
 *
 * The hashed bundles are correctly `immutable`, but `index.html` is the only
 * document mapping a URL to those hashed names. With no HTML rule it fell
 * through to Firebase's default `max-age=3600` and no validator directive, so
 * a returning visitor inside the hour got the previous deploy's HTML and
 * therefore — because the bundles really are immutable — the previous
 * deploy's JavaScript, with the ETag never consulted.
 *
 * Two things this pins that are easy to get wrong:
 *
 * 1. `**​/*.html` alone is NOT enough. Firebase matches header `source` globs
 *    against the REQUEST path, before rewrites are applied. `/` and every SPA
 *    deep route (`/districts`, `/district/61/clubs`) are extensionless, so they
 *    never match `*.html` even though they all serve index.html via the `**`
 *    rewrite. The document default has to be a bare `**` rule.
 * 2. That `**` rule must come BEFORE the hashed-asset rules — see
 *    `resolveCacheControl` above for the measurement. Last match wins, so a
 *    no-cache `**` placed after them strips `immutable` off every bundle and
 *    turns the whole app into a re-download on each navigation.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable'

const ASSET_SOURCES = [
  '**/*.@(js|css)',
  '**/*.@(jpg|jpeg|gif|png|svg|webp|ico)',
  '**/*.@(woff|woff2|ttf|otf|eot)',
]

describe('firebase.json cache headers (#1365)', () => {
  it('keeps the production and staging header rules identical (no drift)', () => {
    // The two targets are copy-paste twins with no variable mechanism, and
    // per-PR preview channels deploy the STAGING target — so a rule that
    // exists only on production is unverifiable on a preview. Assert whole-
    // array equality rather than re-listing each rule: this catches the next
    // one-sided edit too. If the targets ever need to diverge on purpose,
    // that divergence should be a deliberate edit to this expectation.
    expect(rulesFor('staging')).toEqual(rulesFor('production'))
  })

  for (const targetName of ['production', 'staging']) {
    describe(`target: ${targetName}`, () => {
      // `/`, `/districts`, `/district/61/clubs` — everything the SPA rewrite
      // turns into index.html — matches only the bare `**` rules.
      it('revalidates the entry document instead of caching it for an hour', () => {
        // `no-cache`, not `no-store`: the response is still stored, but must
        // be revalidated against the ETag before reuse. Verified against prod:
        // a conditional GET with the current ETag returns 304, a stale one 200.
        expect(resolveCacheControl(targetName, ['**'])).toBe('no-cache')
      })

      it('revalidates literal .html paths too', () => {
        expect(resolveCacheControl(targetName, ['**', '**/*.html'])).toBe(
          'no-cache'
        )
      })

      it('keeps every hashed asset immutable despite the no-cache catch-all', () => {
        // A hashed asset matches BOTH `**` and its own extension rule. This is
        // the assertion that would have caught the first attempt at this fix.
        for (const source of ASSET_SOURCES) {
          expect(
            resolveCacheControl(targetName, ['**', source]),
            `${targetName}: a request matching "${source}" must resolve immutable`
          ).toBe(IMMUTABLE)
        }
      })

      it('orders the no-cache document default ahead of every asset rule', () => {
        // The structural invariant behind the assertion above. Stated
        // separately so a reordering failure names the cause, not a symptom.
        const docDefault = rulesFor(targetName).findIndex(
          r =>
            r.source === '**' &&
            headerValue(r.headers, 'Cache-Control') !== undefined
        )
        expect(
          docDefault,
          'a bare `**` rule carrying Cache-Control must exist'
        ).toBeGreaterThan(-1)

        for (const source of ASSET_SOURCES) {
          const assetIdx = ruleIndex(targetName, source)
          expect(
            assetIdx,
            `${targetName} must declare "${source}"`
          ).toBeGreaterThan(-1)
          expect(
            assetIdx,
            `"${source}" must come AFTER the no-cache "**" rule to win`
          ).toBeGreaterThan(docDefault)
        }
      })

      it('keeps cache policy out of the security catch-all rule', () => {
        // The #783 helper resolves the security headers via the FIRST `**`
        // rule. Keeping Cache-Control in its own sibling rule means neither
        // contract can be broken by an edit aimed at the other.
        const securityRule = rulesFor(targetName).find(
          r => r.source === '**' && headerValue(r.headers, 'X-Frame-Options')
        )
        expect(securityRule).toBeDefined()
        expect(
          headerValue(securityRule!.headers, 'Cache-Control')
        ).toBeUndefined()
      })
    })
  }
})
