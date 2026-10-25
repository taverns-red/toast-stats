/**
 * Video palette and fonts — the app's legacy light-theme tokens (#2080: until
 * Phase 2, no --rt-stats amber and no new colours). Values are copied, not
 * imported, because Remotion renders outside the app's CSS; the theme test
 * fails if they drift from frontend/src/styles/tokens/.
 */
export const THEME = {
  /** --tm-loyal-blue: accent, highlights, title band. */
  accent: '#004165',
  /** --ink / --ink-2 / --ink-3: text. */
  ink: '#0f1720',
  ink2: '#344052',
  ink3: '#5b6675',
  /** --surface / --surface-2 / --line: cards and neutrals. */
  surface: '#ffffff',
  surface2: '#f9fafb',
  line: '#e5e7eb',
  /** The app's self-hosted faces (frontend/src/assets/fonts). */
  fontBody: "'Inter', system-ui, sans-serif",
  fontDisplay: "'Montserrat', 'Inter', system-ui, sans-serif",
}
