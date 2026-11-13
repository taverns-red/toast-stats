import React, { useEffect, useRef, useState } from 'react'
import type { DistrictKpiStripData } from './DistrictKpiStrip'
import { formatCompact, formatSignedCompact } from '../utils/formatCompact'

/* #2708 (D4) — the KPI block (strip or phone hub) is tall, so it scrolls away.
   Once it has, this one opaque line of the four headline figures pins under
   the top bar (district-narrative.css). It takes no layout space (a zero-height
   sticky wrapper), so showing or hiding it cannot shift the page. It is
   aria-hidden: the same figures are in the block above. */

const PIN_FALLBACK_PX = 56

/** True once `sentinel` has scrolled above the wrapper's pin line. */
function useStuck(
  sentinel: React.RefObject<HTMLDivElement | null>,
  wrapper: React.RefObject<HTMLDivElement | null>,
  enabled: boolean
): boolean {
  const [stuck, setStuck] = useState(false)
  const [pin, setPin] = useState(PIN_FALLBACK_PX)

  // The pin line moves below 768 (the phone context bar); follow resizes.
  useEffect(() => {
    if (!enabled) return
    const read = () => {
      const top = parseFloat(
        wrapper.current ? getComputedStyle(wrapper.current).top : ''
      )
      setPin(Number.isFinite(top) ? top : PIN_FALLBACK_PX)
    }
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [enabled, wrapper])

  useEffect(() => {
    const el = sentinel.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top < pin)
      },
      { rootMargin: `-${pin}px 0px 0px 0px` }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, pin, sentinel])

  return stuck
}

export interface DistrictKpiStickyLineProps {
  kpis: DistrictKpiStripData | null
}

export const DistrictKpiStickyLine: React.FC<DistrictKpiStickyLineProps> = ({
  kpis,
}) => {
  const sentinel = useRef<HTMLDivElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const stuck = useStuck(sentinel, wrapper, kpis !== null)

  if (!kpis) return null

  const provisional = kpis.distinguishedClubs.provisional ?? 0

  return (
    <>
      <div
        ref={sentinel}
        aria-hidden="true"
        className="district-kpi-stuck__sentinel"
      />
      <div
        ref={wrapper}
        className="district-kpi-stuck"
        data-testid="district-kpi-stuck"
        data-stuck={stuck ? 'true' : 'false'}
      >
        <div
          className="district-kpi-stuck__line"
          data-testid="district-kpi-stuck-line"
          aria-hidden="true"
        >
          <span className="district-kpi-stuck__item">
            <span className="district-kpi-stuck__label">Paid</span>{' '}
            <strong>{formatCompact(kpis.paidClubs.current)}</strong>
          </span>
          <span className="district-kpi-stuck__item">
            <span className="district-kpi-stuck__label">Pmts</span>{' '}
            <strong>{formatCompact(kpis.membershipPayments.current)}</strong>
          </span>
          <span className="district-kpi-stuck__item">
            <span className="district-kpi-stuck__label">Dist</span>{' '}
            <strong>{formatCompact(kpis.distinguishedClubs.current)}</strong>
            {provisional > 0 && (
              <span className="district-kpi-stuck__label">
                {' '}
                +{formatCompact(provisional)}
              </span>
            )}
          </span>
          <span className="district-kpi-stuck__item">
            <span className="district-kpi-stuck__label">Net</span>{' '}
            <strong>{formatSignedCompact(kpis.netMemberChange.current)}</strong>
          </span>
        </div>
      </div>
    </>
  )
}
