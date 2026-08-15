'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createSeries } from '@/actions/series'
import { getOrgBySlug } from '@/actions/orgs'
import { SERIES_OCCURRENCE_CAP } from '@/lib/occasions/series-logic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function NewSeriesPage() {
  const router = useRouter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [weekday, setWeekday] = useState(6)
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
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
      const { series, created } = await createSeries(orgId, {
        name,
        location: { name: locationName, ...(address.trim() ? { address } : {}) },
        hours: { start, end },
        recurrence: { freq: 'weekly', weekday, from, until },
        ...(fee !== '' ? { booth_fee: Number(fee) } : {}),
      })
      router.push(`/${orgSlug}/series/${series.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create series')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">New series</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="s-name">Name</Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Boise Farmers Market" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-weekday">Day of week</Label>
              <select id="s-weekday" className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="s-from">From</Label>
                <Input id="s-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="s-until">Until</Label>
                <Input id="s-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} required />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Generates every matching day up front (max {SERIES_OCCURRENCE_CAP}) — skip any week later by archiving that day.</p>
            <div className="space-y-1">
              <Label htmlFor="s-loc">Location name</Label>
              <Input id="s-loc" value={locationName} onChange={(e) => setLocationName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-addr">Address (optional)</Label>
              <Input id="s-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="s-open">Opens</Label>
                <Input id="s-open" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="s-close">Closes</Label>
                <Input id="s-close" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-fee">Booth fee ($, optional)</Label>
              <Input id="s-fee" type="number" min="0" step="1" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create series'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
