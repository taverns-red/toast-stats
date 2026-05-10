import React from 'react'

/* Placeholder for #355. Real Methodology page (anchor TOC + 8 numbered
   sections sourced from analytics-core) ships in #368. */

const MethodologyPage: React.FC = () => {
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
        Reference
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
        Methodology
      </h1>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0 }}>
        Coming soon — data sources, scoring, and definitions (issue #368).
      </p>
    </div>
  )
}

export default MethodologyPage
