'use client'

import { useMemo, useState } from 'react'
import { bulkOnboardOrgs } from '@/actions/networks'
import type { BulkOnboardResult } from '@/actions/networks'
import { parseOnboardRows } from '@/lib/bulk-onboard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

const MAX_ROWS = 200

interface BulkOnboardClientProps {
  networkId: string
}

export function BulkOnboardClient({ networkId }: BulkOnboardClientProps) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<BulkOnboardResult[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  const rows = useMemo(() => parseOnboardRows(text), [text])
  const validCount = rows.filter((r) => !r.error).length
  const errorCount = rows.length - validCount
  const overCap = rows.length > MAX_ROWS

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      const res = await bulkOnboardOrgs(networkId, rows)
      setResults(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to onboard organizations')
    } finally {
      setLoading(false)
    }
  }

  async function copyLink(token: string) {
    const url = `${window.location.origin}/accept-invite?token=${token}`
    await navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Bulk onboard organizations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create multiple organizations at once. Each one gets an owner invitation linked to this network.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paste organizations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="onboard-text">One organization per line</Label>
            <p className="text-xs text-muted-foreground">
              Format: <code className="font-mono">Organization Name, admin@email.com</code>
            </p>
            <textarea
              id="onboard-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={'Acme Corp, owner@acme.com\nBeta LLC, admin@beta.com'}
              className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm">
                <span className="font-medium text-green-700">{validCount} valid</span>
                {errorCount > 0 && (
                  <>
                    {', '}
                    <span className="font-medium text-red-600">{errorCount} with errors</span>
                  </>
                )}
              </div>
              <ul className="divide-y rounded-lg border text-sm">
                {rows.map((row, i) => (
                  <li key={i} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-medium">{row.orgName || <span className="text-muted-foreground italic">(no name)</span>}</span>
                      {row.adminEmail && <span className="text-muted-foreground"> — {row.adminEmail}</span>}
                    </div>
                    {row.error && <span className="text-red-600">{row.error}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {overCap && (
            <p className="text-sm text-red-600">Too many rows (max {MAX_ROWS} per batch)</p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={handleSubmit} disabled={loading || validCount === 0 || overCap}>
            {loading ? 'Onboarding…' : `Onboard ${validCount} organization${validCount === 1 ? '' : 's'}`}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((res, i) => (
              <div key={i} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{res.orgName}</span>
                  <span className="text-muted-foreground">{res.adminEmail}</span>
                </div>
                {res.status === 'created' ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-xs text-green-700">Created · slug: <code className="font-mono">{res.slug}</code></div>
                    {res.inviteToken && (
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/accept-invite?token=${res.inviteToken}`}
                          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => copyLink(res.inviteToken!)}>
                          {copied === res.inviteToken ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-red-600">Error: {res.error}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
