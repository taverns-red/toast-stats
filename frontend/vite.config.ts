import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { deadlinesIcsPlugin } from './src/utils/deadlinesIcsPlugin'
import { bundleCdnBaseUrl, PROD_CDN_BASE_URL } from '../scripts/lib/cdnTarget'
import { cdnTargetPlugin } from '../scripts/lib/viteCdnTargetPlugin'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // #3000: the CDN the bundle reads from, as a build-time constant
  // (`__CDN_BASE_URL__`) instead of a module that reads `import.meta.env`.
  // A shared module became a 0.17 kB chunk that index.html modulepreloaded,
  // and this config would have had to import a browser module. Vite's own
  // load order applies: process env first, then .env files.
  const bundleCdnUrl = bundleCdnBaseUrl(
    // eslint-disable-next-line no-undef
    loadEnv(mode, process.cwd(), 'VITE_')['VITE_CDN_BASE_URL'],
    PROD_CDN_BASE_URL
  )
  return {
    // #2429: deadlines.ics, built from the cited deadline table.
    // #2994: a CI build must name its CDN target (process env, not .env files).
    plugins: [
      react(),
      deadlinesIcsPlugin(),
      // eslint-disable-next-line no-undef
      cdnTargetPlugin(process.env, PROD_CDN_BASE_URL, bundleCdnUrl),
    ],
    define: {
      // eslint-disable-next-line no-undef
      __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || 'dev'),
      __CDN_BASE_URL__: JSON.stringify(bundleCdnUrl),
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          // #1830: explicit groups with priorities. The old `manualChunks`
          // function is converted by rolldown into ONE group whose members pull
          // in their dependencies recursively — so React itself landed in the
          // `charts` chunk, every module imported it, and the 96 KB Recharts
          // chunk was modulepreloaded on every route. Higher priority claims a
          // module first; `charts` keeps only what nothing above already took.
          // `scripts/check-critical-path.ts` (lighthouse-ci.yml) guards this.
          codeSplitting: {
            groups: [
              {
                // `use-sync-external-store` is shared by Recharts and by
                // @tanstack/react-table v9 (via react-store). Left to `charts`,
                // the clubs table imported its one binding from the Recharts
                // chunk and the clubs route paid 112 KB gzip for it (#1830).
                name: 'vendor',
                test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store)[\\/]/,
                priority: 30,
              },
              {
                name: 'query',
                test: /node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/,
                priority: 20,
              },
              {
                name: 'charts',
                test: /node_modules[\\/]recharts[\\/]/,
                priority: 10,
              },
              {
                // #1786: the basemap renderer. Map routes only — reached
                // through LazyBasemapMap's dynamic import, never preloaded.
                name: 'maplibre',
                // pmtiles is left out (#2173): BasemapMap loads it lazily, in
                // parallel with the map, so it is its own chunk, not a fixed
                // byte of every map route.
                test: /node_modules[\\/](maplibre-gl|@maplibre|@mapbox|@protomaps)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  }
})
