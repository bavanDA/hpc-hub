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
    // one copy of each: shared code imports them from app/, phone code from mobile/ (two copies of CodeMirror break it)
    dedupe: ['react', 'react-dom', '@tauri-apps/api', '@xterm/xterm', '@xterm/addon-fit', 'lucide-react',
      '@codemirror/autocomplete', '@codemirror/commands', '@codemirror/lang-cpp', '@codemirror/lang-json',
      '@codemirror/lang-markdown', '@codemirror/lang-python', '@codemirror/lang-yaml', '@codemirror/language',
      '@codemirror/legacy-modes', '@codemirror/merge', '@codemirror/search', '@codemirror/state', '@codemirror/view',
      '@lezer/common', '@lezer/highlight', '@lezer/lr', 'pdfjs-dist', '@tauri-apps/plugin-notification'],
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
