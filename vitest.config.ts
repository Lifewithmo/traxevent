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
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
