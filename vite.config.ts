import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the build works from any sub-path (GitHub Pages, a USB stick behind a local server, …).
  base: './',
  test: {
    // Hardware tests talk to a real device; give them room.
    testTimeout: 30000,
  },
})
