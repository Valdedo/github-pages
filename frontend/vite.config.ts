import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    // Legacy bundle for old Android browsers (5/6/7) — generates ES5
    // fallback with <script nomodule> so modern browsers ignore it
    legacy({
      targets: ['android >= 5', 'chrome >= 49', 'ios_saf >= 10'],
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
