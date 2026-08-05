'use client'

import { useState } from 'react'
import type { PublicProposal } from '@/actions/proposals-public'
import { respondToProposal } from '@/actions/proposals-public'
import { lineItemSubtotal, computeSelectedTotal, depositAmount } from '@/lib/proposals'
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
  const packaged = (proposal.packages?.length ?? 0) > 0
  const [packageId, setPackageId] = useState<string | undefined>(
    proposal.selection?.package_id ?? proposal.packages?.find((p) => p.recommended)?.id,
  )
  const [optionalIds, setOptionalIds] = useState<string[]>(
    proposal.selection?.optional_item_ids ?? [],
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Outcome | null>(null)

  const requiredItems = proposal.line_items.filter((i) => i.optional !== true)
  const optionalItems = proposal.line_items.filter((i) => i.optional === true && i.id)

  function toggleOptional(id: string) {
    setOptionalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function respond(response: Outcome) {
    if (response === 'accepted' && packaged && !packageId) {
      setError('Please choose an option before accepting.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await respondToProposal(
        token,
        response,
        response === 'accepted' ? { package_id: packageId, optional_item_ids: optionalIds } : undefined,
      )
      setResult(response)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Effective status: once the client responds in this session, reflect it.
  const status = result ?? proposal.status
  const editable = status === 'sent'
  const total =
    status === 'accepted' && proposal.selection
      ? proposal.selection.selected_total
      : computeSelectedTotal(proposal, { package_id: packageId, optional_item_ids: optionalIds })

  return (
    <main className="min-h-screen bg-gray-50 py-10 pb-40">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{proposal.title || 'Proposal'}</h1>

        {packaged && (
          <Card>
            <CardHeader>
              <CardTitle>Choose an option</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {proposal.packages!.map((pkg) => {
                  const selected = packageId === pkg.id
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      disabled={!editable}
                      onClick={() => editable && setPackageId(pkg.id)}
                      aria-pressed={selected}
                      className={`relative rounded-lg border p-4 text-left transition ${
                        selected ? 'border-gray-900 ring-2 ring-gray-900' : 'border-gray-200'
                      } ${editable ? 'cursor-pointer hover:border-gray-400' : 'cursor-default'}`}
                    >
                      {pkg.recommended && (
                        <span className="absolute right-3 top-3 rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
                          Recommended
                        </span>
                      )}
                      <p className="font-semibold text-gray-900">{pkg.name}</p>
                      {pkg.description && (
                        <p className="mt-1 text-sm text-gray-500">{pkg.description}</p>
                      )}
                      <p className="mt-2 text-lg font-bold text-gray-900">{money(pkg.price)}</p>
                      {pkg.includes && pkg.includes.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm text-gray-700">
                          {pkg.includes.map((line, i) => (
                            <li key={i} className="flex gap-2">
                              <span aria-hidden="true">✓</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {requiredItems.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>What&apos;s included</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {requiredItems.map((item, i) => (
                  <li key={item.id ?? i} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-900">
                      {item.description}{' '}
                      <span className="text-gray-500">× {item.quantity}</span>
                    </span>
                    <span className="text-gray-900">{money(lineItemSubtotal(item))}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {optionalItems.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Optional add-ons</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {optionalItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                    <label className="flex items-center gap-3 text-gray-900">
                      <input
                        type="checkbox"
                        checked={optionalIds.includes(item.id as string)}
                        disabled={!editable}
                        onChange={() => toggleOptional(item.id as string)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span>
                        {item.description}{' '}
                        <span className="text-gray-500">× {item.quantity}</span>
                      </span>
                    </label>
                    <span className="text-gray-900">{money(lineItemSubtotal(item))}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

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
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900">{money(total)}</p>
              {proposal.deposit && (
                <p className="text-sm text-gray-600">
                  Deposit due on acceptance: {money(depositAmount(total, proposal.deposit))}
                </p>
              )}
              {proposal.expires_at && (
                <p className="text-xs text-gray-400">
                  This proposal expires {new Date(proposal.expires_at).toLocaleDateString()}
                </p>
              )}
            </div>

            {status === 'sent' ? (
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
            ) : status === 'accepted' ? (
              <p className="text-sm font-medium text-green-700">
                Thanks — you&apos;ve accepted this proposal.
              </p>
            ) : status === 'rejected' ? (
              <p className="text-sm font-medium text-gray-700">
                You&apos;ve declined this proposal.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
