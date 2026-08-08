import '@testing-library/jest-dom'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load .env.local for Firebase initialization in tests
try {
  const envPath = join(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const lines = envContent.split('\n')
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue
    const [key, ...rest] = line.split('=')
    const value = rest.join('=').trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
} catch {
  // .env.local not found or not readable; tests may fail if they need these vars
}
