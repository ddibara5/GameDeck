import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /**
         * React and postgrest-js get their own chunks, and the reason is deploy
         * cost rather than launch cost.
         *
         * Everything used to land in one 232.5kB entry chunk whose name carries a
         * content hash, so every deploy renamed it and every deploy re-downloaded
         * React. Measured on a real build:
         *
         *   vendor-react  141.8kB  (45.4kB gz)  changes when React does
         *   vendor-db      16.3kB  ( 5.1kB gz)  changes when postgrest-js does
         *   app entry      75.3kB  (24.2kB gz)  changes when you deploy
         *
         * A deploy goes from 74.3kB gzipped to 24.2kB. It costs one extra request
         * on a genuinely cold launch and nothing at all after that, because
         * sw.js cache-firsts /assets/* and a chunk whose name did not change is
         * never fetched twice.
         *
         * Deliberately only these two. Splitting per-package produces a long tail
         * of 2kB chunks, which trades a download nobody makes for a request
         * everybody does.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'vendor-react'
          if (id.includes('node_modules/@supabase')) return 'vendor-db'
          return undefined
        },
      },
    },
  },
})
