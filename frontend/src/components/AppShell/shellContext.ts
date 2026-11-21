import { useOutletContext } from 'react-router-dom'

/** What AppShell shares with the page rendered in its outlet. */
export interface ShellOutletContext {
  openSearch: () => void
}

/** The shell's shared actions, or null when the page is rendered outside it. */
export function useShellContext(): ShellOutletContext | null {
  return useOutletContext<ShellOutletContext | undefined>() ?? null
}
