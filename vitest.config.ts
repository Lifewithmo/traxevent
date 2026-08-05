import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
    env: {
      RESEND_API_KEY: 'test-key',
      RESEND_FROM_EMAIL: 'test@example.com',
      // Pinned so lib/brands.ts's APP_ORIGIN fallback ('https://traxevent.com')
      // is deterministic in tests regardless of what's exported in the host
      // shell/CI environment — the signupUrl test asserts a full-URL equality.
      NEXT_PUBLIC_APP_ORIGIN: 'https://traxevent.com',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` throws when imported outside an RSC graph. In tests we
      // load server modules directly, so map it to the package's empty shim.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
})
