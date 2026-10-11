import React, { useState } from 'react'
import { useDistrictExport } from '../hooks/useDistrictExport'

/* The district header's "⋯" actions (Export CSV, Copy link — #676) as plain
   buttons for the phone context sheet (#1831). Inside a sheet there is no
   menu-button to open: the actions are simply listed. Same hook and the same
   clipboard contract as `HeaderActionsMenu`; feedback is a polite live region
   (errors assertive) so it survives for screen-reader users. */

export const DistrictSheetActions: React.FC<{ districtId: string }> = ({
  districtId,
}) => {
  const [copied, setCopied] = useState(false)
  const { isExporting, error, exportToCSV, clearError } =
    useDistrictExport(districtId)

  const copyLink = async () => {
    try {
      // Undefined on insecure (HTTP) contexts — guard, and let the try/catch
      // absorb a rejected write.
      if (!navigator.clipboard) return
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard unavailable; nothing to report in v1 (same as the menu).
    }
  }

  return (
    <>
      <button
        type="button"
        className="context-sheet__action"
        onClick={() => {
          clearError()
          exportToCSV()
        }}
      >
        Export CSV
      </button>
      <button
        type="button"
        className="context-sheet__action"
        onClick={copyLink}
      >
        Copy link
      </button>
      <span role="status" aria-live="polite" className="context-sheet__status">
        {isExporting ? 'Exporting…' : copied ? 'Link copied' : ''}
      </span>
      {error && (
        <span role="alert" className="context-sheet__status">
          {error.message}
        </span>
      )}
    </>
  )
}

export default DistrictSheetActions
