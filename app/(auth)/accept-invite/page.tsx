'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { acceptInvitation } from '@/actions/members'
import { establishSession } from '@/lib/auth/establish-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function AcceptInviteInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, loading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  // If not logged in, redirect to login preserving token
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?next=/accept-invite?token=${token}`)
    }
  }, [authLoading, user, router, token])

  async function handleAccept() {
    if (!user) return
    setError(null)
    setAccepting(true)
    try {
      await acceptInvitation(token, user.uid, user.displayName ?? '', user.email ?? '')
      await user.getIdToken(true) // refresh claims
      const result = await user.getIdTokenResult()
      const orgSlug = result.claims.orgSlug as string | undefined
      await establishSession()
      router.push(orgSlug ? `/${orgSlug}` : '/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  if (authLoading) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;ve been invited to TraxEvent</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          Click below to join the organization and access your camps.
        </p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <Button className="w-full" onClick={handleAccept} disabled={accepting}>
          {accepting ? 'Joining…' : 'Accept invitation'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  )
}
