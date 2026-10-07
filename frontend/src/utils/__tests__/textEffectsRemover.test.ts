/**
 * textEffectsRemover — behavioural tests against a jsdom fixture (#1687).
 *
 * `setupFontLoadingOptimization` runs at boot from `main.tsx` and mutates the
 * live document (classes on <html>, an injected <style>). The scan/remove/
 * inject helpers walk and rewrite the DOM. Each test builds its own fixture
 * and tears down what it added, so the shared jsdom stays clean.
 *
 * jsdom's computed `text-shadow` is not browser-faithful: it reports
 * `rgba(0, 0, 0, 0)` for every element, including `text-shadow: none`
 * (measured in a canary run; a browser reports `none`). Against raw jsdom
 * every element would read as a violation, so `getComputedStyle` is stubbed
 * to the element's inline declaration — the computed value a browser yields
 * for these fixtures, which set the properties inline and have no
 * stylesheet.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  PROHIBITED_TEXT_EFFECTS,
  generateTextEffectPreventionCSS,
  generateTextEffectsReport,
  injectTextEffectPreventionCSS,
  optimizeFontLoading,
  removeTextEffectsFromElement,
  removeTextEffectsFromPage,
  scanElementForTextEffects,
  scanPageForTextEffects,
  setupFontLoadingOptimization,
} from '../textEffectsRemover'

const html = document.documentElement

function fixture(markup: string): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute('data-testid', 'tefx-fixture')
  host.innerHTML = markup
  document.body.appendChild(host)
  return host
}

let headSnapshot: Node[]
let fontsDescriptor: PropertyDescriptor | undefined

/** Browser-faithful stand-in: computed = inline for stylesheet-free fixtures. */
const inlineComputedStyle = (el: Element): CSSStyleDeclaration =>
  (el as HTMLElement).style

beforeEach(() => {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(inlineComputedStyle)
  headSnapshot = Array.from(document.head.childNodes)
  fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts')
  html.classList.remove('fonts-loading', 'fonts-loaded')
})

afterEach(() => {
  document.body.innerHTML = ''
  for (const node of Array.from(document.head.childNodes)) {
    if (!headSnapshot.includes(node)) node.remove()
  }
  if (fontsDescriptor) {
    Object.defineProperty(document, 'fonts', fontsDescriptor)
  } else {
    delete (document as unknown as { fonts?: unknown }).fonts
  }
  html.classList.remove('fonts-loading', 'fonts-loaded')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('scanElementForTextEffects', () => {
  it('flags an inline text-shadow with the property, value and an #id selector', () => {
    const host = fixture('<p id="glowy" style="text-shadow: 0 0 4px red">x</p>')
    const el = host.querySelector('p') as HTMLElement

    const violations = scanElementForTextEffects(el)

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      element: el,
      property: 'text-shadow',
      selector: '#glowy',
    })
    expect(violations[0]!.value).toContain('red')
  })

  it('flags a prohibited filter (drop-shadow) but not an allowed one (grayscale)', () => {
    const host = fixture(
      '<span class="a b c" style="filter: drop-shadow(2px 2px 2px black)">x</span>' +
        '<span style="filter: grayscale(1)">y</span>'
    )
    const [shadowed, gray] = Array.from(host.querySelectorAll('span'))

    const flagged = scanElementForTextEffects(shadowed as HTMLElement)
    expect(flagged).toHaveLength(1)
    expect(flagged[0]!.property).toBe('filter')
    // Class selector uses at most the first two classes.
    expect(flagged[0]!.selector).toBe('.a.b')

    expect(scanElementForTextEffects(gray as HTMLElement)).toEqual([])
  })

  it('matches prohibited filter names case-insensitively', () => {
    const host = fixture('<div style="filter: BLUR(2px)">x</div>')
    const violations = scanElementForTextEffects(
      host.querySelector('div') as HTMLElement
    )
    expect(violations.map(v => v.property)).toEqual(['filter'])
  })

  it.each(['none', 'initial', 'unset', 'inherit'])(
    'treats text-shadow: %s as compliant',
    keyword => {
      const host = fixture(`<p style="text-shadow: ${keyword}">x</p>`)
      expect(
        scanElementForTextEffects(host.querySelector('p') as HTMLElement)
      ).toEqual([])
    }
  )

  it('reports a clean element as having no violations and falls back to the tag name', () => {
    const host = fixture('<em>plain</em>')
    expect(
      scanElementForTextEffects(host.querySelector('em') as HTMLElement)
    ).toEqual([])
  })

  it('uses the tag name as the selector for an element without id or class', () => {
    const host = fixture('<b style="text-shadow: 1px 1px blue">x</b>')
    const [v] = scanElementForTextEffects(
      host.querySelector('b') as HTMLElement
    )
    expect(v!.selector).toBe('b')
  })
})

describe('scanPageForTextEffects / removeTextEffectsFromPage', () => {
  it('scans every element in the document and collects all violations', () => {
    fixture(
      '<h1 id="h" style="text-shadow: 1px 1px red">t</h1>' +
        '<p style="filter: drop-shadow(1px 1px 1px black)">p</p>' +
        '<span>clean</span>'
    )

    const result = scanPageForTextEffects()

    expect(result.totalElements).toBe(document.querySelectorAll('*').length)
    expect(result.violations.map(v => v.property).sort()).toEqual([
      'filter',
      'text-shadow',
    ])
    expect(result.violationsRemoved).toBe(0)
    expect(result.errors).toEqual([])
  })

  it('records a per-element error instead of aborting the scan', () => {
    fixture('<p style="text-shadow: 1px 1px red">x</p>')
    let calls = 0
    vi.spyOn(window, 'getComputedStyle').mockImplementation(el => {
      calls++
      if (calls === 1) throw new Error('detached')
      return inlineComputedStyle(el)
    })

    const result = scanPageForTextEffects()

    expect(result.errors).toEqual(['Element 0: detached'])
    expect(result.violations).toHaveLength(1)
  })

  it('neutralises every violating element with !important none and counts removals', () => {
    const host = fixture(
      '<h2 style="text-shadow: 2px 2px red">a</h2>' +
        '<h3 style="filter: glow(3)">b</h3>'
    )

    const result = removeTextEffectsFromPage()

    expect(result.violations.length).toBeGreaterThanOrEqual(1)
    expect(result.violationsRemoved).toBe(result.violations.length)
    const h2 = host.querySelector('h2') as HTMLElement
    expect(h2.style.getPropertyValue('text-shadow')).toBe('none')
    expect(h2.style.getPropertyPriority('text-shadow')).toBe('important')
    // A second scan finds nothing left to fix.
    expect(scanPageForTextEffects().violations).toEqual([])
  })
})

describe('removeTextEffectsFromElement', () => {
  it('sets every prohibited property to none !important and returns true', () => {
    const el = fixture('<p style="text-shadow: 1px 1px red">x</p>')
      .firstElementChild as HTMLElement

    expect(removeTextEffectsFromElement(el)).toBe(true)
    expect(el.style.getPropertyValue('text-shadow')).toBe('none')
    expect(el.style.getPropertyPriority('text-shadow')).toBe('important')
  })

  it('returns false (and does not throw) when the style cannot be written', () => {
    const fake = {
      style: {
        setProperty: () => {
          throw new Error('read-only')
        },
      },
    } as unknown as HTMLElement

    expect(removeTextEffectsFromElement(fake)).toBe(false)
  })
})

describe('prevention CSS', () => {
  it('declares every prohibited property as none !important', () => {
    const css = generateTextEffectPreventionCSS()
    for (const property of PROHIBITED_TEXT_EFFECTS) {
      expect(css).toContain(`${property}: none !important;`)
    }
    expect(css).toContain('box-shadow: none !important;')
  })

  it('injects exactly one #text-effects-prevention style, replacing an earlier one', () => {
    injectTextEffectPreventionCSS()
    injectTextEffectPreventionCSS()

    const styles = document.head.querySelectorAll('#text-effects-prevention')
    expect(styles).toHaveLength(1)
    expect(styles[0]!.textContent).toBe(generateTextEffectPreventionCSS())
  })
})

describe('font loading (runs at boot from main.tsx)', () => {
  function stubFonts(ready: Promise<unknown>): void {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready },
    })
  }

  it('marks <html> fonts-loading, then fonts-loaded once document.fonts.ready resolves', async () => {
    let resolve!: () => void
    stubFonts(new Promise<void>(r => (resolve = r)))

    optimizeFontLoading()
    expect(html.classList.contains('fonts-loading')).toBe(true)
    expect(html.classList.contains('fonts-loaded')).toBe(false)

    resolve()
    await vi.waitFor(() =>
      expect(html.classList.contains('fonts-loaded')).toBe(true)
    )
    expect(html.classList.contains('fonts-loading')).toBe(false)
  })

  it('falls back to a 3s timer when the Font Loading API is absent', () => {
    delete (document as unknown as { fonts?: unknown }).fonts
    // jsdom may define `fonts` on the prototype; hide it there too.
    const protoDesc = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'fonts'
    )
    if (protoDesc)
      delete (Document.prototype as unknown as { fonts?: unknown }).fonts
    vi.useFakeTimers()
    try {
      optimizeFontLoading()
      expect(html.classList.contains('fonts-loading')).toBe(true)

      vi.advanceTimersByTime(2999)
      expect(html.classList.contains('fonts-loaded')).toBe(false)

      vi.advanceTimersByTime(1)
      expect(html.classList.contains('fonts-loaded')).toBe(true)
      expect(html.classList.contains('fonts-loading')).toBe(false)
    } finally {
      if (protoDesc)
        Object.defineProperty(Document.prototype, 'fonts', protoDesc)
    }
  })

  it('is a no-op when fonts are already loaded', () => {
    html.classList.add('fonts-loaded')
    stubFonts(new Promise(() => {}))

    optimizeFontLoading()

    expect(html.classList.contains('fonts-loading')).toBe(false)
  })

  it('setupFontLoadingOptimization starts the loading cycle and injects the loading-state CSS', () => {
    stubFonts(new Promise(() => {}))

    setupFontLoadingOptimization()

    expect(html.classList.contains('fonts-loading')).toBe(true)
    const added = Array.from(document.head.querySelectorAll('style')).filter(
      s => !headSnapshot.includes(s)
    )
    expect(added).toHaveLength(1)
    expect(added[0]!.textContent).toContain('.fonts-loading')
    expect(added[0]!.textContent).toContain('visibility: hidden')
    expect(added[0]!.textContent).toContain('body:not(.fonts-loaded)')
  })
})

describe('generateTextEffectsReport', () => {
  it('lists each violation with its selector, property and value', () => {
    fixture('<p id="loud" style="text-shadow: 1px 1px red">x</p>')

    const report = generateTextEffectsReport()

    expect(report).toContain('# Text Effects Compliance Report')
    expect(report).toContain('**Violations Found:** 1')
    expect(report).toContain('### Violation 1')
    expect(report).toContain('- **Element:** #loud')
    expect(report).toContain('- **Property:** text-shadow')
    expect(report).not.toContain('No Violations Found')
  })

  it('reports compliance when the page is clean', () => {
    fixture('<p>quiet</p>')

    const report = generateTextEffectsReport()

    expect(report).toContain('**Violations Found:** 0')
    expect(report).toContain('No Violations Found')
    expect(report).not.toContain('## Errors')
  })

  it('appends scan errors under an Errors heading', () => {
    fixture('<p>x</p>')
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      throw new Error('boom')
    })

    const report = generateTextEffectsReport()

    expect(report).toContain('## Errors')
    expect(report).toContain('- Element 0: boom')
  })
})
