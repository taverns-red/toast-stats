import { afterEach, describe, expect, it } from 'vitest'
import { lockScroll } from '../scrollLock'

describe('lockScroll (#2638)', () => {
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('restores the original overflow only when the last lock is released', () => {
    document.body.style.overflow = 'auto'
    const a = lockScroll()
    const b = lockScroll()
    expect(document.body.style.overflow).toBe('hidden')
    a()
    expect(document.body.style.overflow).toBe('hidden')
    b()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('is order-independent and ignores a double release', () => {
    const a = lockScroll()
    const b = lockScroll()
    b()
    b()
    expect(document.body.style.overflow).toBe('hidden')
    a()
    expect(document.body.style.overflow).toBe('')
  })
})
