'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRegion, assignOrgToRegion, assignCoordinator } from '@/actions/networks'
import type { Region, Org, NetworkMember } from '@/lib/types'

interface RegionsClientProps {
  networkId: string
  regions: Region[]
  orgs: Org[]
  members: NetworkMember[]
}

const selectClass =
  'w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function RegionsClient({ networkId, regions, orgs, members }: RegionsClientProps) {
  const router = useRouter()

  // Create region
  const [name, setName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Assign orgs
  const [assignLoading, setAssignLoading] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Coordinator
  const [coordEmail, setCoordEmail] = useState('')
  const [coordRegionIds, setCoordRegionIds] = useState<string[]>([])
  const [coordLoading, setCoordLoading] = useState(false)
  const [coordError, setCoordError] = useState<string | null>(null)

  const coordinators = members.filter((m) => m.role === 'coordinator')

  async function handleCreateRegion(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreateLoading(true)
    try {
      await createRegion(networkId, name)
      setName('')
      router.refresh()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create region')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleAssignOrg(orgId: string, value: string) {
    setAssignError(null)
    setAssignLoading(orgId)
    try {
      await assignOrgToRegion(networkId, orgId, value || null)
      router.refresh()
    } catch (err: unknown) {
      setAssignError(err instanceof Error ? err.message : 'Failed to assign organization')
    } finally {
      setAssignLoading(null)
    }
  }

  function toggleCoordRegion(regionId: string) {
    setCoordRegionIds((prev) =>
      prev.includes(regionId) ? prev.filter((id) => id !== regionId) : [...prev, regionId],
    )
  }

  async function handleAssignCoordinator(e: React.FormEvent) {
    e.preventDefault()
    setCoordError(null)
    setCoordLoading(true)
    try {
      await assignCoordinator(networkId, coordEmail, coordRegionIds)
      setCoordEmail('')
      setCoordRegionIds([])
      router.refresh()
    } catch (err: unknown) {
      setCoordError(err instanceof Error ? err.message : 'Failed to assign coordinator')
    } finally {
      setCoordLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Regions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Group member organizations into regions and assign coordinators to oversee them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create region</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRegion} className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="regionName">Region name</Label>
              <div className="flex gap-2">
                <Input
                  id="regionName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Pacific Northwest"
                  required
                />
                <Button type="submit" disabled={createLoading || !name.trim()}>
                  {createLoading ? 'Creating…' : 'Create region'}
                </Button>
              </div>
            </div>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign organizations to regions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organizations linked to this network yet.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Organization</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Region</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{o.name}</td>
                      <td className="px-3 py-2">
                        <select
                          className={selectClass}
                          value={o.region_id ?? ''}
                          disabled={assignLoading === o.id}
                          onChange={(e) => handleAssignOrg(o.id, e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {regions.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {assignError && <p className="text-sm text-red-600">{assignError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coordinators</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {coordinators.length === 0 ? (
            <p className="text-sm text-muted-foreground">No coordinators assigned yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {coordinators.map((m) => {
                const count = m.region_ids?.length ?? 0
                return (
                  <li key={m.uid} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium">{m.email}</span>
                    <span className="text-muted-foreground">{count} region{count !== 1 ? 's' : ''}</span>
                  </li>
                )
              })}
            </ul>
          )}

          <form onSubmit={handleAssignCoordinator} className="space-y-3 border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="coordEmail">Coordinator email</Label>
              <Input
                id="coordEmail"
                type="email"
                value={coordEmail}
                onChange={(e) => setCoordEmail(e.target.value)}
                placeholder="coordinator@example.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Regions</Label>
              {regions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Create a region first.</p>
              ) : (
                <div className="space-y-1">
                  {regions.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5"
                        checked={coordRegionIds.includes(r.id)}
                        onChange={() => toggleCoordRegion(r.id)}
                      />
                      {r.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" disabled={coordLoading || !coordEmail.trim()}>
              {coordLoading ? 'Assigning…' : 'Assign coordinator'}
            </Button>
            {coordError && <p className="text-sm text-red-600">{coordError}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
