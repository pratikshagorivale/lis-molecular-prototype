import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts: the tests are plain TypeScript and need no
// React or Tailwind plugin, and Vitest's bundled Vite types differ from Vite 8's.
export default defineConfig({
  test: {
    environment: 'jsdom',
    // jsdom's default about:blank origin provides no localStorage.
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    setupFiles: ['src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
