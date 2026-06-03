'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { sendEmailBlast } from '@/actions/communicate'
import type { CommunicationLogEntry } from '@/lib/types'

interface CommunicateClientProps {
  orgId: string
  campId: string
  campName: string
  fromDisplayName?: string
  log: CommunicationLogEntry[]
}

const FILTER_LABELS: Record<string, string> = {
  all: 'All registrants (excl. cancelled)',
  confirmed: 'Confirmed only',
  pending: 'Pending only',
  waitlisted: 'Waitlisted only',
}

export function CommunicateClient({
  orgId,
  campId,
  campName,
  fromDisplayName,
  log,
}: CommunicateClientProps) {
  const [subject, setSubject] = useState(`${campName} — Update`)
  const [htmlBody, setHtmlBody] = useState('')
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'waitlisted'>('all')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recentLog, setRecentLog] = useState<CommunicationLogEntry[]>(log)

  async function handleSend() {
    if (!subject.trim() || !htmlBody.trim()) return
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const res = await sendEmailBlast(orgId, campId, { subject, htmlBody, filter })
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
      setSubject(`${campName} — Update`)
      setHtmlBody('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const fromPreview = fromDisplayName
    ? `"${fromDisplayName}" <noreply@traxevent.com>`
    : 'noreply@traxevent.com'

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Communicate</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send email blast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Sending from: <span className="font-mono">{fromPreview}</span>
          </p>

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
              className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              <p className="text-sm text-accent">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sent emails</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails sent yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Subject</th>
                  <th className="pb-2 font-medium">To</th>
                  <th className="pb-2 font-medium text-right">Recipients</th>
                  <th className="pb-2 font-medium text-right">Sent</th>
                </tr>
              </thead>
              <tbody>
                {recentLog.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{entry.subject}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{FILTER_LABELS[entry.filter] ?? entry.filter}</Badge>
                    </td>
                    <td className="py-2 text-right">{entry.recipient_count}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {new Date(entry.sent_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
