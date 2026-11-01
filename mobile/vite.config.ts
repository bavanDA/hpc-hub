import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// @shared: the desktop app's backend link, hooks and types (docs/design/android.md). The phone (tauri android dev)
// reaches the dev server over the network, so it listens on TAURI_DEV_HOST when Tauri sets it.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: '../app/public',  // theme.js: light or dark before the first paint, shared with the desktop
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../app/src', import.meta.url)) },
    dedupe: ['react', 'react-dom', '@tauri-apps/api', '@xterm/xterm', '@xterm/addon-fit', 'lucide-react'],
  },
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5175 } : undefined,
    fs: { allow: ['..'] },
  },
})
