import { describe, it, expect } from 'vitest'
import {
  lineItemSubtotal, invoiceTotal, amountPaid, invoiceBalance, tipsTotal,
} from '@/lib/invoices'
import type { Invoice, InvoiceLineItem, InvoicePayment } from '@/lib/types'

const li = (quantity: number, unit_price: number): InvoiceLineItem => ({ description: 'x', quantity, unit_price })
const pay = (amount: number): InvoicePayment => ({ amount, recorded_at: '' })

describe('lineItemSubtotal / invoiceTotal', () => {
  it('multiplies and sums, rounded to cents; non-positive → 0', () => {
    expect(lineItemSubtotal(li(3, 45.99))).toBe(137.97)
    expect(lineItemSubtotal(li(-1, 50))).toBe(0)
    expect(invoiceTotal([li(2, 50), li(1, 45.99)])).toBe(145.99)
    expect(invoiceTotal([])).toBe(0)
  })
})

describe('amountPaid / invoiceBalance', () => {
  it('sums payments and computes balance', () => {
    const inv = { line_items: [li(2, 50)], payments: [pay(30), pay(20)] } as Invoice
    expect(amountPaid(inv.payments)).toBe(50)
    expect(invoiceBalance(inv)).toBe(50)   // 100 total - 50 paid
  })
  it('balance never goes negative below zero rounding', () => {
    const inv = { line_items: [li(1, 100)], payments: [pay(120)] } as Invoice
    expect(invoiceBalance(inv)).toBe(-20)  // overpayment shows as negative balance
  })
})

describe('tips', () => {
  const payTip = (amount: number, tip: number): InvoicePayment => ({ amount, tip_amount: tip, recorded_at: '' })

  it('tipsTotal sums positive tip_amount only; missing tip counts as 0', () => {
    expect(tipsTotal([payTip(100, 15), payTip(50, 0), pay(25)])).toBe(15)
    expect(tipsTotal([payTip(100, -5)])).toBe(0)
  })

  it('amountPaid and invoiceBalance ignore tips entirely', () => {
    const inv = { line_items: [li(1, 100)], payments: [payTip(100, 20)] } as Invoice
    expect(amountPaid(inv.payments)).toBe(100)     // tip not counted as payment
    expect(invoiceBalance(inv)).toBe(0)            // balance ignores the $20 tip
  })
})
