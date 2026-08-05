'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createOrg } from '@/actions/orgs'
import { establishSession } from '@/lib/auth/establish-session'
import { validBrandParam } from '@/lib/brands'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string | string[] }>
}) {
  const { brand: brandParam } = use(searchParams)
  const brandId = validBrandParam(typeof brandParam === 'string' ? brandParam : null)
  const router = useRouter()
  const { user } = useAuth()
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setLoading(true)
    try {
      const org = await createOrg(
        user.uid,
        orgName,
        user.displayName ?? '',
        user.email ?? '',
        brandId ?? undefined
      )
      // Force token refresh so new claims (orgId, orgSlug, role) are active
      await user.getIdToken(true)
      await establishSession()
      router.push(`/${org.slug}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="orgName">Organization name</Label>
            <p className="text-xs text-gray-500">
              E.g. &quot;Riverside Catering&quot; or &quot;Summit Event Co.&quot;
            </p>
            <Input
              id="orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your business or organization"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !user}>
            {loading ? 'Creating…' : 'Create organization'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
