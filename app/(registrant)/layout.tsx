'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'

export default function RegistrantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const token = searchParams.get('token')

  useEffect(() => {
    if (!loading && !user && !token) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    }
  }, [loading, user, token, router])

  if (loading) return null

  return (
    <div className="min-h-screen bg-[#FAF5FF]">
      <header className="bg-white border-b border-[#DDD6FE] px-4 py-3 flex items-center justify-between">
        <Link href="/my-registrations" className="font-bold text-[#7C3AED] text-lg">
          TraxEvent
        </Link>
        {user && (
          <Link href="/account" className="text-sm text-gray-500 hover:text-[#7C3AED]">
            My account
          </Link>
        )}
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
