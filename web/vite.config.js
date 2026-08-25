import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /**
         * React and the Supabase auth/PostgREST pair get their own chunks, and the reason is deploy
         * cost rather than launch cost.
         *
         * Everything used to land in one 232.5kB entry chunk whose name carries a
         * content hash, so every deploy renamed it and every deploy re-downloaded
         * React. Measured on a real build:
         *
         *   vendor-react  141.8kB  (45.4kB gz)  changes when React does
         *   vendor-db     119.2kB  (29.5kB gz)  changes when Supabase does
         *   app entry      75.3kB  (24.2kB gz)  changes when you deploy
         *
         * The auth cost is isolated from ordinary app deploys. It costs one extra request
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
