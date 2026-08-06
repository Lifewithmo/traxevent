'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createComplianceDoc, updateComplianceDoc, deleteComplianceDoc } from '@/actions/compliance'
import type { ComplianceDoc } from '@/lib/types'

interface ComplianceClientProps {
  orgId: string
  isAdmin: boolean
  docs: ComplianceDoc[]
}

const THIRTY_DAYS = 30 * 86_400_000

function status(d: ComplianceDoc, today: string): { label: string; variant: 'destructive' | 'secondary' } | null {
  if (d.expires_on === undefined) return null
  if (d.expires_on < today) return { label: 'expired', variant: 'destructive' }
  const soonCutoff = new Date(new Date(`${today}T00:00:00Z`).getTime() + THIRTY_DAYS).toISOString().slice(0, 10)
  if (d.expires_on <= soonCutoff) return { label: 'expiring soon', variant: 'destructive' }
  return { label: 'valid', variant: 'secondary' }
}

export function ComplianceClient({ orgId, isAdmin, docs: initial }: ComplianceClientProps) {
  const [docs, setDocs] = useState(initial)
  const [name, setName] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true); setError(null)
    try {
      const created = await createComplianceDoc(orgId, {
        name: name.trim(),
        ...(expiresOn ? { expires_on: expiresOn } : {}),
        ...(linkUrl.trim() ? { link_url: linkUrl.trim() } : {}),
      })
      setDocs((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setName(''); setExpiresOn(''); setLinkUrl('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleExpiryChange(d: ComplianceDoc, value: string) {
    if (value === (d.expires_on ?? '')) return
    try {
      await updateComplianceDoc(orgId, d.id, { expires_on: value || null })
      setDocs((prev) => prev.map((x) => (x.id === d.id ? { ...x, expires_on: value || undefined } : x)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function handleDelete(d: ComplianceDoc) {
    if (!confirm(`Delete ${d.name}?`)) return
    setSaving(true); setError(null)
    try {
      await deleteComplianceDoc(orgId, d.id)
      setDocs((prev) => prev.filter((x) => x.id !== d.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Compliance</h1>
      <p className="text-sm text-gray-500 mb-4">Permits, insurance, certifications. Documents expiring before an event warn on that event&apos;s ops screen.</p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2">Document</th><th>Expires</th><th>Status</th><th />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const s = status(d, today)
            return (
              <tr key={d.id} className="border-b last:border-0">
                <td className="py-2 font-medium">
                  {d.link_url ? <a href={d.link_url} target="_blank" rel="noreferrer" className="underline">{d.name}</a> : d.name}
                </td>
                <td>
                  {isAdmin ? (
                    <Input aria-label={`Expiry for ${d.name}`} type="date" className="w-40"
                      defaultValue={d.expires_on ?? ''} onBlur={(e) => handleExpiryChange(d, e.target.value)} />
                  ) : (d.expires_on ?? '—')}
                </td>
                <td>{s ? <Badge variant={s.variant}>{s.label}</Badge> : '—'}</td>
                <td className="text-right">
                  {isAdmin && (
                    <Button variant="ghost" size="sm" aria-label={`Delete ${d.name}`} disabled={saving} onClick={() => handleDelete(d)}>
                      Delete
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
          {docs.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-gray-500">No documents tracked yet.</td></tr>
          )}
        </tbody>
      </table>

      {isAdmin && (
        <div className="flex items-end gap-3 flex-wrap border-t pt-4 mt-4">
          <div>
            <Label htmlFor="cd-name">Name</Label>
            <Input id="cd-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cd-expiry">Expires on</Label>
            <Input id="cd-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cd-link">Link (optional)</Label>
            <Input id="cd-link" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </div>
          <Button onClick={handleAdd} disabled={saving || !name.trim()}>Add document</Button>
        </div>
      )}
    </div>
  )
}
