'use client'

import { useState } from 'react'
import type { PublicContract } from '@/actions/contracts-public'
import { signContract } from '@/actions/contracts-public'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function ContractSignClient({
  token,
  contract,
}: {
  token: string
  contract: PublicContract
}) {
  const [name, setName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signed, setSigned] = useState(false)

  async function sign() {
    setSubmitting(true)
    setError(null)
    try {
      await signContract(token, name)
      setSigned(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const alreadySigned = contract.status === 'signed'

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{contract.title || 'Contract'}</h1>

        {contract.document_url && (
          <Card className="mb-6">
            <CardContent className="py-4">
              <a
                href={contract.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-md border border-blue-600 bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open document
              </a>
            </CardContent>
          </Card>
        )}

        {contract.body && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700">
                {contract.body}
              </div>
            </CardContent>
          </Card>
        )}

        {signed ? (
          <p className="mt-8 text-sm font-medium text-green-700">Signed — thank you.</p>
        ) : alreadySigned ? (
          <p className="mt-8 text-sm font-medium text-gray-700">
            Signed by {contract.signed_by}
            {contract.signed_at ? ` on ${formatDate(contract.signed_at)}` : ''}
          </p>
        ) : contract.status === 'sent' ? (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Sign this contract</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signer-name">Type your full name to sign</Label>
                <Input
                  id="signer-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  disabled={submitting}
                />
              </div>
              <Label className="items-start">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5"
                />
                <span>I agree to the terms of this contract</span>
              </Label>
              {error && (
                <p className="text-sm text-red-600" role="alert" aria-live="assertive">
                  {error}
                </p>
              )}
              <Button onClick={sign} disabled={submitting || !name.trim() || !agreed}>
                {submitting ? 'Signing…' : 'Sign'}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  )
}
