'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createMarketDay } from '@/actions/events'
import { getOrgBySlug } from '@/actions/orgs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function NewMarketDayPage() {
  const router = useRouter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [locationName, setLocationName] = useState('')
  const [address, setAddress] = useState('')
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('13:00')
  const [fee, setFee] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getOrgBySlug(orgSlug).then((org) => (org ? setOrgId(org.id) : setError('Organization not found')))
      .catch(() => setError('Failed to load organization'))
  }, [orgSlug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (!orgId) throw new Error('Organization not found')
      const event = await createMarketDay(orgId, {
        name, date,
        location: { name: locationName, ...(address.trim() ? { address } : {}) },
        ...(start && end ? { hours: { start, end } } : {}),
        ...(fee !== '' ? { booth_fee: Number(fee) } : {}),
      })
      router.push(`/${orgSlug}/${event.slug}/dashboard`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create market day')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">New market day</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="md-name">Name</Label>
              <Input id="md-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Boise Farmers Market" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-date">Date</Label>
              <Input id="md-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-loc">Location name</Label>
              <Input id="md-loc" value={locationName} onChange={(e) => setLocationName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-addr">Address (optional)</Label>
              <Input id="md-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="md-open">Opens</Label>
                <Input id="md-open" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="md-close">Closes</Label>
                <Input id="md-close" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-fee">Booth fee ($, optional)</Label>
              <Input id="md-fee" type="number" min="0" step="1" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create market day'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
