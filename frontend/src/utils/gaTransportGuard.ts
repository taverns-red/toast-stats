/* Transport guard for Google Analytics (#2827).

   When a visitor lowers consent after GA ran in the page, gtag.js can still
   flush a hit it already queued (a `scroll` event) by fetch or sendBeacon
   while the page unloads, even with `ga-disable-<id>` set. consent.ts
   installs this guard as the first step of that downgrade. It drops requests
   to Google Analytics collect and googletagmanager hosts on every transport
   gtag uses, and nothing else. Any other request passes through unchanged.

   It also drops `document.cookie` writes that set a `_ga*` cookie (#2923):
   gtag stays alive in the page and rewrites `_ga_<id>` whenever it handles an
   event. Every other cookie, including `rt_consent`, and any write that
   expires a `_ga*` cookie, passes through.

   The guard stays on until the page reloads. So choosing "all" again in the
   same page view counts nothing until the next page load: gtag does not start
   a second time and its cookie writes stay dropped. That is the safe
   direction for privacy. */

const GTM_DOMAIN = 'googletagmanager.com'
const GA_DOMAIN = 'google-analytics.com'
const GA_ALT_DOMAIN = 'analytics.google.com'
const COLLECT_PATHS = new Set(['/collect', '/g/collect'])

function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/** True for a GA collect endpoint or any googletagmanager.com URL. */
export function isGaCollectUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url, window.location.href)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase()
  if (onDomain(host, GTM_DOMAIN)) return true
  if (onDomain(host, GA_DOMAIN) || onDomain(host, GA_ALT_DOMAIN)) {
    return COLLECT_PATHS.has(u.pathname)
  }
  return false
}

/** True for a `document.cookie` write that sets a `_ga*` cookie. A write that
 *  expires one (Max-Age=0 or a past Expires) passes: that is how we clear. */
export function isGaCookieSet(cookie: string): boolean {
  const [pair = '', ...attrs] = cookie.split(';')
  const name = pair.split('=')[0]?.trim() ?? ''
  if (!name.startsWith('_ga')) return false
  for (const attr of attrs) {
    const [k = '', v = ''] = attr.split('=')
    const key = k.trim().toLowerCase()
    if (key === 'max-age' && Number(v.trim()) <= 0) return false
    if (key === 'expires' && Date.parse(v.trim()) <= Date.now()) return false
  }
  return true
}

function inputUrl(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (input && typeof (input as { url?: unknown }).url === 'string') {
    return (input as { url: string }).url
  }
  return String(input)
}

let active: (() => void) | null = null

/** Install the guard. Idempotent. Returns a function that removes it. */
export function installGaTransportGuard(): () => void {
  if (active) return active

  const restores: Array<() => void> = []

  const origFetch = window.fetch
  if (typeof origFetch === 'function') {
    window.fetch = function (
      this: unknown,
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ): Promise<Response> {
      if (isGaCollectUrl(inputUrl(input))) {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      return origFetch.call(window, input, init)
    }
    restores.push(() => {
      window.fetch = origFetch
    })
  }

  const origBeacon = navigator.sendBeacon
  if (typeof origBeacon === 'function') {
    navigator.sendBeacon = function (
      url: string | URL,
      data?: Parameters<Navigator['sendBeacon']>[1]
    ): boolean {
      if (isGaCollectUrl(inputUrl(url))) return true
      return origBeacon.call(navigator, url, data)
    }
    restores.push(() => {
      navigator.sendBeacon = origBeacon
    })
  }

  const xhrProto = XMLHttpRequest.prototype
  const origOpen = xhrProto.open
  const origSend = xhrProto.send
  const dropped = new WeakSet<XMLHttpRequest>()
  xhrProto.open = function (this: XMLHttpRequest, ...args: unknown[]): void {
    if (isGaCollectUrl(inputUrl(args[1]))) dropped.add(this)
    else dropped.delete(this)
    return (origOpen as (...a: unknown[]) => void).apply(this, args)
  } as typeof xhrProto.open
  xhrProto.send = function (
    this: XMLHttpRequest,
    body?: Parameters<XMLHttpRequest['send']>[0]
  ): void {
    if (dropped.has(this)) return
    return origSend.call(this, body)
  }
  restores.push(() => {
    xhrProto.open = origOpen
    xhrProto.send = origSend
  })

  const imgProto = HTMLImageElement.prototype
  const srcDescriptor = Object.getOwnPropertyDescriptor(imgProto, 'src')
  if (srcDescriptor?.set && srcDescriptor.get) {
    const { get, set } = srcDescriptor
    Object.defineProperty(imgProto, 'src', {
      ...srcDescriptor,
      set(this: HTMLImageElement, value: string) {
        if (isGaCollectUrl(String(value))) return
        set.call(this, value)
      },
      get,
    })
    restores.push(() => Object.defineProperty(imgProto, 'src', srcDescriptor))
  }
  const origSetAttribute = imgProto.setAttribute
  imgProto.setAttribute = function (
    this: HTMLImageElement,
    name: string,
    value: string
  ): void {
    if (name.toLowerCase() === 'src' && isGaCollectUrl(String(value))) return
    origSetAttribute.call(this, name, value)
  }
  restores.push(() => {
    delete (imgProto as { setAttribute?: unknown }).setAttribute
  })

  // #2923: gtag stays alive and rewrites `_ga*` when it handles a later event.
  // That is a cookie write, not a request, so drop it here. Find the accessor
  // on the prototype chain (Document.prototype in Chromium and WebKit).
  let cookieOwner: object | null = document
  let cookieDescriptor: PropertyDescriptor | undefined
  while (cookieOwner && !cookieDescriptor) {
    cookieDescriptor = Object.getOwnPropertyDescriptor(cookieOwner, 'cookie')
    if (!cookieDescriptor) cookieOwner = Object.getPrototypeOf(cookieOwner)
  }
  if (cookieOwner && cookieDescriptor?.get && cookieDescriptor.set) {
    const { get, set } = cookieDescriptor
    const owner = cookieOwner
    Object.defineProperty(owner, 'cookie', {
      ...cookieDescriptor,
      get(this: Document) {
        return get.call(this)
      },
      set(this: Document, value: string) {
        if (isGaCookieSet(String(value))) return
        set.call(this, value)
      },
    })
    restores.push(() =>
      Object.defineProperty(owner, 'cookie', cookieDescriptor)
    )
  }

  const remove = (): void => {
    if (active !== remove) return
    active = null
    for (const r of restores.reverse()) r()
  }
  active = remove
  return remove
}

/** Remove the installed guard, if any (tests). */
export function uninstallGaTransportGuard(): void {
  active?.()
}
