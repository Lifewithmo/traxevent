'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { sendEmailBlast } from '@/actions/communicate'
import { deriveLocalPart } from '@/lib/resend'
import type { CommunicationLogEntry } from '@/lib/types'

interface CommunicateClientProps {
  orgId: string
  eventId: string
  eventName: string
  fromDisplayName?: string
  log: CommunicationLogEntry[]
  members: { uid: string; name: string; email: string }[]
  verifiedDomain: string | null
}

const FILTER_LABELS: Record<string, string> = {
  all: 'All registrants (excl. cancelled)',
  confirmed: 'Confirmed only',
  pending: 'Pending only',
  waitlisted: 'Waitlisted only',
}

const SELECT_CLASS = 'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'

export function CommunicateClient({
  orgId,
  eventId,
  eventName,
  fromDisplayName,
  log,
  members,
  verifiedDomain,
}: CommunicateClientProps) {
  const [subject, setSubject] = useState(`${eventName} — Update`)
  const [htmlBody, setHtmlBody] = useState('')
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'waitlisted'>('all')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recentLog, setRecentLog] = useState<CommunicationLogEntry[]>(log)
  const [senderUid, setSenderUid] = useState('')

  const staffOptions = verifiedDomain
    ? members
        .map((m) => ({ uid: m.uid, name: m.name, localPart: deriveLocalPart(m.email) }))
        .filter((m) => m.localPart !== '')
    : []
  const selectedStaff = staffOptions.find((m) => m.uid === senderUid)
  const staffSender =
    selectedStaff && verifiedDomain
      ? { name: selectedStaff.name, email: `${selectedStaff.localPart}@${verifiedDomain}` }
      : undefined

  async function handleSend() {
    if (!subject.trim() || !htmlBody.trim()) return
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const res = await sendEmailBlast(orgId, eventId, {
        subject,
        htmlBody,
        filter,
        ...(senderUid ? { sentByUid: senderUid } : {}),
      })
      setResult(res)
      setRecentLog((prev) => [
        {
          id: `new-${Date.now()}`,
          subject,
          html_body: htmlBody,
          filter,
          recipient_count: res.sent,
          sent_at: new Date().toISOString(),
        },
        ...prev,
      ])
      setSubject(`${eventName} — Update`)
      setHtmlBody('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const fromPreview = staffSender
    ? `"${staffSender.name}" <${staffSender.email}>`
    : fromDisplayName
      ? `"${fromDisplayName}" <${verifiedDomain ? `noreply@${verifiedDomain}` : 'noreply@traxevent.com'}>`
      : verifiedDomain ? `noreply@${verifiedDomain}` : 'noreply@traxevent.com'

  return (
    <div className="p-5">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Send email blast</CardTitle>
            <CardDescription>Sending from: {fromPreview}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="sender">Send from</Label>
              <select
                id="sender"
                className={SELECT_CLASS}
                value={senderUid}
                onChange={(e) => setSenderUid(e.target.value)}
              >
                <option value="">{fromDisplayName ? `${fromDisplayName} (event default)` : 'Event default'}</option>
                {staffOptions.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.name} &lt;{m.localPart}@{verifiedDomain}&gt;
                  </option>
                ))}
              </select>
              {!verifiedDomain && (
                <p className="text-xs text-muted-foreground">
                  Verify a custom sending domain (Email Domain settings) to let staff send from their own address.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject line"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="htmlBody">Message (HTML)</Label>
              <textarea
                id="htmlBody"
                className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm font-mono min-h-[160px] transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                placeholder="<p>Hi there,</p><p>Here's an update...</p>"
              />
              <p className="text-xs text-muted-foreground">HTML is supported. Use plain text if unsure.</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="filter">Send to</Label>
              <select
                id="filter"
                className={SELECT_CLASS}
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                {Object.entries(FILTER_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div aria-live="polite" aria-atomic="true">
              {error && <p className="text-sm text-destructive">{error}</p>}
              {result && (
                <p className="text-sm text-[var(--money-green)]">
                  Sent to {result.sent} recipient{result.sent !== 1 ? 's' : ''}.
                </p>
              )}
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !htmlBody.trim()}
            >
              {sending ? 'Sending…' : 'Send email blast'}
            </Button>
          </CardContent>
        </Card>

        <Card className="self-start lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sent emails</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLog.length === 0 ? (
              <EmptyState title="No emails sent yet." />
            ) : (
              <ul className="divide-y divide-border">
                {recentLog.map((entry) => (
                  <li key={entry.id} className="space-y-1.5 py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{entry.subject}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone="neutral">{FILTER_LABELS[entry.filter] ?? entry.filter}</StatusPill>
                      <span className="text-xs text-muted-foreground">
                        {entry.recipient_count} recipient{entry.recipient_count !== 1 ? 's' : ''} ·{' '}
                        {new Date(entry.sent_at).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
