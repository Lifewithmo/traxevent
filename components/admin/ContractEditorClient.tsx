'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { updateContract, sendContract, deleteContract } from '@/actions/contracts'
import { CONTRACT_STATUS_LABELS } from '@/lib/contracts'
import type { Contract, ContractStatus } from '@/lib/types'

interface ContractEditorClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  contract: Contract
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function ContractEditorClient({ orgId, orgSlug, leadId, contract }: ContractEditorClientProps) {
  const router = useRouter()

  const [title, setTitle] = useState(contract.title ?? '')
  const [documentUrl, setDocumentUrl] = useState(contract.document_url ?? '')
  const [body, setBody] = useState(contract.body ?? '')
  const [status, setStatus] = useState<ContractStatus>(contract.status)

  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showLink, setShowLink] = useState(contract.status !== 'draft')
  const [copied, setCopied] = useState(false)

  const shareLink =
    typeof window !== 'undefined' ? `${window.location.origin}/contracts/${contract.token}` : `/contracts/${contract.token}`

  async function handleSave() {
    setSaving(true); setError(null); setNotice(null)
    try {
      await updateContract(orgId, contract.id, {
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        document_url: documentUrl.trim() || undefined,
      })
      setNotice('Saved.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleSend() {
    setSending(true); setError(null); setNotice(null)
    try {
      await sendContract(orgId, contract.id)
      setStatus('sent')
      setShowLink(true)
      setNotice('Sent for signature.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally { setSending(false) }
  }

  async function handleDelete() {
    if (!confirm('Delete this contract? This cannot be undone.')) return
    setDeleting(true); setError(null); setNotice(null)
    try {
      await deleteContract(orgId, contract.id)
      router.push(`/${orgSlug}/leads/${leadId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  async function handleCopy() {
    setError(null)
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
    } catch {
      setError('Could not copy link.')
    }
  }

  const busy = saving || sending || deleting

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <Link href={`/${orgSlug}/leads/${leadId}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to lead
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contract</h1>
        <Badge variant="secondary">{CONTRACT_STATUS_LABELS[status]}</Badge>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="contractTitle">Title</Label>
            <Input id="contractTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contract title" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contractDocUrl">Document URL</Label>
            <Input id="contractDocUrl" value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} placeholder="https://…" />
            <p className="text-xs text-muted-foreground">Link to a hosted PDF/Doc — optional</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="contractBody">Contract terms</Label>
            <textarea
              id="contractBody"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Contract terms"
              className="flex min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
      </Card>

      {status === 'signed' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Signature</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Signed by {contract.signed_by}{contract.signed_at ? ` on ${formatDate(contract.signed_at)}` : ''}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={busy}>{saving ? 'Saving…' : 'Save'}</Button>
        <Button variant="outline" onClick={handleSend} disabled={busy}>{sending ? 'Sending…' : 'Send for signature'}</Button>
        <Button variant="destructive" onClick={handleDelete} disabled={busy}>{deleting ? 'Deleting…' : 'Delete'}</Button>
      </div>

      {showLink && (
        <Card>
          <CardHeader><CardTitle className="text-base">Client link</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Share this link with the client to review and sign the contract.</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareLink} className="flex-1" />
              <Button size="sm" variant="outline" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
