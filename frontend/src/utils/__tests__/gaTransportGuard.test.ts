import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installGaTransportGuard, isGaCollectUrl } from '../gaTransportGuard'

/* The transport guard (#2827). After a downgrade, gtag.js can still flush a
   queued hit (scroll) by fetch or sendBeacon while the page unloads. The
   guard drops requests to Google Analytics collect and googletagmanager
   hosts, on every transport gtag uses, and nothing else. */

const GA = [
  'https://www.google-analytics.com/g/collect?v=2&tid=G-CDWQYHC2Z3',
  'https://region1.google-analytics.com/g/collect?v=2',
  'https://www.google-analytics.com/collect?v=1',
  'https://www.googletagmanager.com/gtag/js?id=G-CDWQYHC2Z3',
  'https://www.googletagmanager.com/a?id=G-CDWQYHC2Z3',
]
const NOT_GA = [
  'https://cdn.taverns.red/snapshots/latest.json',
  'https://google-analytics.com.evil.test/g/collect',
  'https://evil-googletagmanager.com/gtag/js',
  'https://www.google-analytics.com/other',
  'https://example.com/?u=https://www.google-analytics.com/g/collect',
]

describe('isGaCollectUrl', () => {
  it.each(GA)('matches %s', url => {
    expect(isGaCollectUrl(url)).toBe(true)
  })
  it.each(NOT_GA)('does not match %s', url => {
    expect(isGaCollectUrl(url)).toBe(false)
  })
})

describe('installGaTransportGuard', () => {
  const win = window as unknown as Record<string, unknown>
  let uninstall: () => void = () => {}
  let origFetch: ReturnType<typeof vi.fn>
  let origBeacon: ReturnType<typeof vi.fn>
  let origOpen: ReturnType<typeof vi.spyOn>
  let origSend: ReturnType<typeof vi.spyOn>
  const saved = {
    fetch: win['fetch'],
    beacon: navigator.sendBeacon,
  }

  beforeEach(() => {
    origFetch = vi.fn(async () => new Response('real', { status: 200 }))
    win['fetch'] = origFetch
    origBeacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', {
      value: origBeacon,
      configurable: true,
      writable: true,
    })
    origOpen = vi
      .spyOn(XMLHttpRequest.prototype, 'open')
      .mockImplementation(() => {})
    origSend = vi
      .spyOn(XMLHttpRequest.prototype, 'send')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    uninstall()
    uninstall = () => {}
    origOpen.mockRestore()
    origSend.mockRestore()
    win['fetch'] = saved.fetch
    Object.defineProperty(navigator, 'sendBeacon', {
      value: saved.beacon,
      configurable: true,
      writable: true,
    })
  })

  it.each(GA)('drops fetch to %s with an empty 204', async url => {
    uninstall = installGaTransportGuard()
    const res = await window.fetch(url, { method: 'POST', keepalive: true })
    expect(res.status).toBe(204)
    expect(origFetch).not.toHaveBeenCalled()
  })

  it('drops a fetch given a Request or a URL object', async () => {
    uninstall = installGaTransportGuard()
    await window.fetch(new Request(GA[0]!))
    await window.fetch(new URL(GA[1]!))
    expect(origFetch).not.toHaveBeenCalled()
  })

  it.each(GA)('drops sendBeacon to %s and returns true', url => {
    uninstall = installGaTransportGuard()
    expect(navigator.sendBeacon(url, 'x')).toBe(true)
    expect(origBeacon).not.toHaveBeenCalled()
  })

  it.each(GA)('drops an XMLHttpRequest to %s', url => {
    uninstall = installGaTransportGuard()
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.send('x')
    expect(origSend).not.toHaveBeenCalled()
  })

  it.each(GA)('drops an Image beacon to %s', url => {
    uninstall = installGaTransportGuard()
    const img = new Image()
    img.src = url
    expect(img.getAttribute('src')).toBeNull()
    const img2 = document.createElement('img')
    img2.setAttribute('src', url)
    expect(img2.getAttribute('src')).toBeNull()
  })

  it.each(NOT_GA)('passes every transport through for %s', async url => {
    uninstall = installGaTransportGuard()
    const res = await window.fetch(url)
    expect(res.status).toBe(200)
    expect(origFetch).toHaveBeenCalledTimes(1)
    navigator.sendBeacon(url, 'x')
    expect(origBeacon).toHaveBeenCalledTimes(1)
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.send()
    expect(origOpen).toHaveBeenCalledTimes(1)
    expect(origSend).toHaveBeenCalledTimes(1)
    const img = new Image()
    img.src = url
    expect(img.getAttribute('src')).toBe(url)
  })

  it('is idempotent and uninstalls cleanly', async () => {
    const first = installGaTransportGuard()
    const second = installGaTransportGuard()
    second()
    first()
    const res = await window.fetch(GA[0]!)
    expect(res.status).toBe(200)
    expect(origFetch).toHaveBeenCalledTimes(1)
  })
})

/* #2923: gtag stays alive after a downgrade and rewrites `_ga*` cookies when
   it handles a later event. That write is not a network request, so the guard
   also drops `document.cookie` writes for `_ga*` names. */
describe('installGaTransportGuard: _ga cookie writes (#2923)', () => {
  let uninstall: () => void = () => {}
  const names = ['_ga', '_ga_CDWQYHC2Z3', '_gid', 'rt_consent', 'keepme']
  const wipe = () => {
    for (const n of names) document.cookie = `${n}=; Max-Age=0; Path=/`
  }
  const has = (name: string) =>
    document.cookie.split(';').some(p => p.trim().startsWith(`${name}=`))

  beforeEach(wipe)
  afterEach(() => {
    uninstall()
    uninstall = () => {}
    wipe()
  })

  it('drops a later _ga_<id> write', () => {
    uninstall = installGaTransportGuard()
    document.cookie = '_ga_CDWQYHC2Z3=GS2.1.s1; Path=/; Max-Age=63072000'
    document.cookie = '_ga=GA1.1.1.2; Path=/; Max-Age=63072000'
    expect(has('_ga_CDWQYHC2Z3')).toBe(false)
    expect(has('_ga')).toBe(false)
  })

  it('passes other cookies through, including the consent cookie', () => {
    uninstall = installGaTransportGuard()
    document.cookie = 'keepme=1; Path=/'
    document.cookie = 'rt_consent=v1.minimal; Path=/'
    expect(has('keepme')).toBe(true)
    expect(has('rt_consent')).toBe(true)
  })

  it('still lets a _ga cookie be expired', () => {
    document.cookie = '_ga=GA1.1.1.2; Path=/'
    uninstall = installGaTransportGuard()
    expect(has('_ga')).toBe(true)
    document.cookie = '_ga=; Max-Age=0; Path=/'
    expect(has('_ga')).toBe(false)
  })

  it('writes _ga cookies normally when not installed', () => {
    document.cookie = '_ga=GA1.1.1.2; Path=/'
    expect(has('_ga')).toBe(true)
  })

  it('writes _ga cookies again after uninstall', () => {
    installGaTransportGuard()()
    document.cookie = '_ga=GA1.1.1.2; Path=/'
    expect(has('_ga')).toBe(true)
  })
})
