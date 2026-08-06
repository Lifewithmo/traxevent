export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicProposal } from '@/actions/proposals-public'
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import { PrintButton } from '@/components/admin/ops/PrintButton'
import { lineItemSubtotal } from '@/lib/proposals'

export default async function ProposalPrintPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  // Same lookup as the main public page: the token is the authorization,
  // and drafts return null.
  const proposal = await getPublicProposal(token)
  if (!proposal) notFound()

  return (
    <main className="mx-auto max-w-3xl px-8 py-10 text-gray-900">
      <div className="mb-6 flex items-start justify-between">
        <h1 className="text-2xl font-bold">{proposal.title || 'Proposal'}</h1>
        <PrintButton />
      </div>

      <ProposalDocument blocks={proposal.blocks} />

      {proposal.line_items.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">Pricing</h2>
          <table className="w-full text-sm">
            <tbody>
              {proposal.line_items.map((li, i) => (
                <tr key={i} className="border-b">
                  <td className="py-1">{li.description}</td>
                  <td className="py-1 text-right">
                    {li.quantity} × ${li.unit_price.toFixed(2)}
                  </td>
                  <td className="py-1 text-right">${lineItemSubtotal(li).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {proposal.notes && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{proposal.notes}</p>
        </section>
      )}
    </main>
  )
}
