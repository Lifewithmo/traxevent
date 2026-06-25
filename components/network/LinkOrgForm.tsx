'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { linkOrgToNetworkBySlug } from '@/actions/networks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LinkOrgFormProps {
  networkId: string
}

export function LinkOrgForm({ networkId }: LinkOrgFormProps) {
  const router = useRouter()
  const [slug, setSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await linkOrgToNetworkBySlug(networkId, slug)
      setSlug('')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to link organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor="orgSlug">Add an organization</Label>
        <p className="text-xs text-muted-foreground">
          Enter the slug of an organization you administer to add it to this network.
        </p>
        <div className="flex gap-2">
          <Input
            id="orgSlug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="org-slug"
            required
          />
          <Button type="submit" disabled={loading || !slug}>
            {loading ? 'Linking…' : 'Link organization'}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
