import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // eslint-disable-next-line no-undef
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || 'dev'),
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
              test: /node_modules[\\/](maplibre-gl|@maplibre|@mapbox|pmtiles|@protomaps)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
