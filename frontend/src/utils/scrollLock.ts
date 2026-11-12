/* Ref-counted page scroll lock (#2638). Several surfaces can lock scroll at
   once (the phone menu under the command palette); each takes a lock and
   releases it, and the page's original `overflow` comes back only when the
   last lock is released, whatever order the releases run in. */

let count = 0
let original = ''

/** Lock page scroll. Returns a release function, safe to call twice. */
export function lockScroll(): () => void {
  if (count === 0) original = document.body.style.overflow
  count += 1
  document.body.style.overflow = 'hidden'
  let released = false
  return () => {
    if (released) return
    released = true
    count -= 1
    if (count === 0) document.body.style.overflow = original
  }
}
