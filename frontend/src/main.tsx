import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { setupFontLoadingOptimization } from './utils/textEffectsRemover'
import { queryClient } from './config/queryClient'
import { prefetchRouteData } from './services/routePrefetch'
import { installChunkReloadHandler } from './utils/chunkReload'

// #2415 — after a deploy, a tab on the old build can no longer load a lazy
// chunk (it was removed). Vite dispatches `vite:preloadError`; reload the
// target URL once, guarded so a chunk that is still broken can't loop.
installChunkReloadHandler(window)

// Initialize font loading optimization
setupFontLoadingOptimization()

// #1901 — start the club route's hero data (snapshot index, then the latest
// district snapshot) now, while the lazy route chunk downloads, instead of
// after it mounts. Seeds the page's own query entries; no-op on other routes.
prefetchRouteData(queryClient, window.location)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
