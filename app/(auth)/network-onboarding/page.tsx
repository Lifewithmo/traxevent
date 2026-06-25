'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createNetwork } from '@/actions/networks'
import { establishSession } from '@/lib/auth/establish-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NetworkOnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setLoading(true)
    try {
      const net = await createNetwork(
        user.uid,
        name,
        user.displayName ?? '',
        user.email ?? ''
      )
      // Force token refresh so new claims (networkId, networkSlug) are active
      await user.getIdToken(true)
      await establishSession()
      router.push(`/network/${net.slug}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create network')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your network</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="networkName">Network name</Label>
            <p className="text-xs text-gray-500">
              E.g. &quot;Mountain Region Camps&quot; or &quot;Statewide Ministries&quot;
            </p>
            <Input
              id="networkName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your network"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !user}>
            {loading ? 'Creating…' : 'Create network'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
