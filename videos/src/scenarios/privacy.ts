/**
 * What a capture must never show (#2353, storyboard §0 and §7).
 *
 * Club pages carry a street address (in the hero and under the mini-map) and
 * links to the club's website and its toastmasters.org contact page. The
 * how-to videos zoom into these pages, so the capture hides them before any
 * frame is taken. `visibility: hidden` keeps their space, so the scripted
 * scroll targets land where they would on the live page.
 *
 * The selectors key on the app's own markup; `privacy.test.ts` fails if the
 * frontend renames them.
 */
export const PRIVACY_MASK_SELECTORS: readonly string[] = [
  // Hero "where it meets" line: the item with the map-pin icon.
  '.club-meets__item:has(path[d^="M8 14s"])',
  // Website and "Contact on toastmasters.org" links.
  '.club-meets__links',
  // Phone layout: the club's own website as an external "More about this
  // club" row.
  '.club-more a.mobile-row[target="_blank"]',
  // Address line under the Location mini-map.
  '.club-minimap__place',
]

/** One stylesheet that hides every masked element, injected on each page. */
export function privacyMaskCss(): string {
  return `${PRIVACY_MASK_SELECTORS.join(',\n')} {\n  visibility: hidden !important;\n}\n`
}

/** Id of the `<style>` element the mask script adds. */
export const PRIVACY_STYLE_ID = 'video-privacy-mask'

/**
 * Browser init-script source that adds the mask stylesheet to every
 * document before the app renders. It is plain source text, not a function,
 * so no bundler helper can leak into it.
 */
export function privacyMaskScript(): string {
  return `(() => {
  const add = () => {
    if (document.getElementById(${JSON.stringify(PRIVACY_STYLE_ID)})) return
    const style = document.createElement('style')
    style.id = ${JSON.stringify(PRIVACY_STYLE_ID)}
    style.textContent = ${JSON.stringify(privacyMaskCss())}
    ;(document.head || document.documentElement).appendChild(style)
  }
  if (document.head) add()
  else document.addEventListener('DOMContentLoaded', add, { once: true })
})()
`
}
