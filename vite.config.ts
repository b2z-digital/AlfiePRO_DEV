import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10).replace(/-/g, '')),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // The icon picker needs every icon; the single-file bundle avoids parsing ~3900 modules and keeps build memory in check
      ...(command === 'build'
        ? [{ find: /^lucide-react$/, replacement: path.resolve(__dirname, "node_modules/lucide-react/dist/cjs/lucide-react.js") }]
        : [])
    ]
  },
  optimizeDeps: {
    include: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', 'react', 'react-dom']
  },
  server: {
    hmr: {
      overlay: true
    }
  },
  build: {
    copyPublicDir: true,
    reportCompressedSize: false,
    rollupOptions: {
      cache: false
    }
  }
}))
