'use client'

import { useState } from 'react'
import type { PublicProposal } from '@/actions/proposals-public'
import { respondToProposal } from '@/actions/proposals-public'
import { lineItemSubtotal, proposalTotal } from '@/lib/proposals'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

type Outcome = 'accepted' | 'rejected'

export function ProposalResponseClient({
  token,
  proposal,
}: {
  token: string
  proposal: PublicProposal
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Outcome | null>(null)

  async function respond(response: Outcome) {
    setSubmitting(true)
    setError(null)
    try {
      await respondToProposal(token, response)
      setResult(response)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Effective status: once the client responds in this session, reflect it.
  const status = result ?? proposal.status
  const total = proposalTotal(proposal.line_items)

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{proposal.title || 'Proposal'}</h1>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 px-4 text-right font-medium">Qty</th>
                  <th className="py-2 px-4 text-right font-medium">Unit price</th>
                  <th className="py-2 pl-4 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {proposal.line_items.map((item, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 text-gray-900">{item.description}</td>
                    <td className="py-2 px-4 text-right text-gray-900">{item.quantity}</td>
                    <td className="py-2 px-4 text-right text-gray-900">{money(item.unit_price)}</td>
                    <td className="py-2 pl-4 text-right text-gray-900">
                      {money(lineItemSubtotal(item))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-3 pr-4 text-right font-semibold text-gray-900">
                    Total
                  </td>
                  <td className="py-3 pl-4 text-right font-semibold text-gray-900">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {proposal.notes && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{proposal.notes}</p>
            </CardContent>
          </Card>
        )}

        <div className="mt-8">
          {status === 'sent' ? (
            <>
              {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
              <div className="flex gap-3">
                <Button onClick={() => respond('accepted')} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Accept'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => respond('rejected')}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting…' : 'Decline'}
                </Button>
              </div>
            </>
          ) : status === 'accepted' ? (
            <p className="text-sm font-medium text-green-700">
              Thanks — you&apos;ve accepted this proposal.
            </p>
          ) : status === 'rejected' ? (
            <p className="text-sm font-medium text-gray-700">You&apos;ve declined this proposal.</p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
