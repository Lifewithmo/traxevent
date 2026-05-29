'use client'

// Thin wrapper — add providers here as the app grows (SWR, Jotai, etc.)
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
