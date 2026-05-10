import React from 'react'

/* Placeholder for #355. Real History page (year strip + per-year cards
   + TI archive callout) ships in #367. */

const HistoryPage: React.FC = () => {
  return (
    <div
      className="max-w-[1280px] mx-auto"
      style={{ padding: '40px 24px', fontFamily: 'var(--sans)' }}
    >
      <p
        style={{
          fontFamily: 'var(--serif)',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--maroon-500)',
          margin: 0,
        }}
      >
        Archive
      </p>
      <h1
        style={{
          fontFamily: 'var(--serif)',
          fontWeight: 800,
          fontSize: 28,
          letterSpacing: '-0.015em',
          margin: '8px 0 12px',
          color: 'var(--ink)',
        }}
      >
        Program Year History
      </h1>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0 }}>
        Coming soon — multi-year archive (issue #367).
      </p>
    </div>
  )
}

export default HistoryPage
