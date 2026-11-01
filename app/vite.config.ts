import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tauri expects a fixed port and doesn't want the screen cleared
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // HPC_HUB_PLAIN_ICONS=1: the stock robot for every agent, no brand logos (src/assets/agents/README.md)
  define: { 'import.meta.env.HPC_HUB_PLAIN_ICONS': JSON.stringify(process.env.HPC_HUB_PLAIN_ICONS ?? '') },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
})
