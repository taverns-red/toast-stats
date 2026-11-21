import React from 'react'
import { couldntLoad } from '../utils/loadFailureText'

interface PartialFailureNoteProps {
  /** What failed, as a noun phrase with its determiner ("1 region"). */
  subject: string
  /** Re-run the failed load. Omit it when there is nothing to refetch. */
  onRetry?: (() => void) | undefined
  /** What is still shown, as a sentence ("The rest of the map is shown."). */
  children?: React.ReactNode
  /** False when the note sits inside a live region that already announces. */
  announce?: boolean
  className?: string
  /** Replaces the default button style, for a page's own pill. */
  buttonClassName?: string
}

/**
 * A notice for a load that failed while the rest of the page is shown. A
 * whole-panel failure uses ErrorDisplay; this is the same voice for the
 * partial case (sharedErrorPanelGuard.test.ts, PartialFailureNote.test.tsx).
 */
export const PartialFailureNote: React.FC<PartialFailureNoteProps> = ({
  subject,
  onRetry,
  children,
  announce = true,
  className = '',
  buttonClassName = 'tm-btn-secondary text-sm min-h-[44px]',
}) => (
  <div
    className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}
    {...(announce ? { role: 'alert' } : {})}
  >
    <p>
      {couldntLoad(subject)}
      {children ? <> {children}</> : null}
    </p>
    {onRetry && (
      <button type="button" className={buttonClassName} onClick={onRetry}>
        Try again
      </button>
    )}
  </div>
)
