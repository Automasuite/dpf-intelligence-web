import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))

// DPF has two independent entry points:
// - index.html: public property intelligence site
// - workspace.html: private lead intelligence workspace
// Keep both in the same deployment without replacing either application.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        workspace: resolve(root, 'workspace.html'),
      },
    },
  },
})
