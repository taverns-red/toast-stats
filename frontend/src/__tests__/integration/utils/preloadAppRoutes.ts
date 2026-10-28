/* Preload App's lazy route graph before a test renders <App /> (#2373).

   Call it in a top-level beforeAll (the appRoutePreload census enforces
   this). The hook then pays Vite's cold compile of every lazy route page and
   the lazy chunks inside them, so a findBy window measures the app, not the
   transform (#2248). The module set comes from App.tsx itself
   (lazyModuleGraph), so a new route or journey needs no list. */

import { lazyModuleGraph } from '../../guards/appRouteScan'

export async function preloadAppRoutes(): Promise<void> {
  await Promise.all(
    lazyModuleGraph().map(file => import(/* @vite-ignore */ file))
  )
}
