'use client'

import { useState } from 'react'
import type { Family } from '@/lib/types'
import { updateAdminFamily } from '@/actions/admin-families'

interface FamilyPaymentTabProps {
  family: Family
  orgId: string
  campId: string
  onSaved: (updates: Partial<Family>) => void
}

export function FamilyPaymentTab({ family, orgId, campId, onSaved }: FamilyPaymentTabProps) {
  const [amountDue, setAmountDue] = useState(String(family.amount_due ?? 0))
  const [amountPaid, setAmountPaid] = useState(String(family.amount_paid ?? 0))
  const [paymentNotes, setPaymentNotes] = useState(family.payment_notes ?? '')
  const [saving, setSaving] = useState(false)

  const due = parseFloat(amountDue) || 0
  const paid = parseFloat(amountPaid) || 0
  const balance = due - paid

  const dirty =
    String(family.amount_due ?? 0) !== amountDue ||
    String(family.amount_paid ?? 0) !== amountPaid ||
    (family.payment_notes ?? '') !== paymentNotes

  async function handleSave() {
    setSaving(true)
    const updates: Partial<Family> = {
      amount_due: due,
      amount_paid: paid,
      payment_notes: paymentNotes,
      payment_status:
        paid === 0 ? 'unpaid' : paid >= due ? 'paid' : 'partial',
    }
    await updateAdminFamily(orgId, campId, family.id, updates)
    setSaving(false)
    onSaved(updates)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="amount-due" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Amount due
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1.5 text-sm text-gray-400">$</span>
            <input
              id="amount-due"
              type="number"
              min="0"
              step="0.01"
              value={amountDue}
              onChange={e => setAmountDue(e.target.value)}
              className="w-full pl-6 pr-3 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
        </div>
        <div>
          <label htmlFor="amount-paid" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Amount paid
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1.5 text-sm text-gray-400">$</span>
            <input
              id="amount-paid"
              type="number"
              min="0"
              step="0.01"
              value={amountPaid}
              onChange={e => setAmountPaid(e.target.value)}
              className="w-full pl-6 pr-3 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between border border-gray-200">
        <span className="text-sm font-semibold text-gray-600">Balance</span>
        <span
          className={`text-lg font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}
        >
          ${balance.toFixed(2)}
        </span>
      </div>

      <div>
        <label htmlFor="payment-notes" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Payment notes
        </label>
        <textarea
          id="payment-notes"
          value={paymentNotes}
          onChange={e => setPaymentNotes(e.target.value)}
          rows={3}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
          placeholder="e.g. Scholarship applied, payment plan…"
        />
      </div>

      {dirty && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      )}
    </div>
  )
}
