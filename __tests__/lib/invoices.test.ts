import { describe, it, expect } from 'vitest'
import {
  lineItemSubtotal, amountPaid, invoiceBalance, tipsTotal,
  linesSubtotal, invoiceDiscountAmount, invoiceTaxAmount, creditsTotal, invoiceGross, invoiceAmountDue,
} from '@/lib/invoices'
import type { Invoice, InvoiceLineItem, InvoicePayment } from '@/lib/types'

const li = (quantity: number, unit_price: number): InvoiceLineItem => ({ description: 'x', quantity, unit_price })
const pay = (amount: number): InvoicePayment => ({ amount, recorded_at: '' })

describe('lineItemSubtotal / linesSubtotal', () => {
  it('multiplies and sums, rounded to cents; non-positive → 0', () => {
    expect(lineItemSubtotal(li(3, 45.99))).toBe(137.97)
    expect(lineItemSubtotal(li(-1, 50))).toBe(0)
    expect(linesSubtotal([li(2, 50), li(1, 45.99)])).toBe(145.99)
    expect(linesSubtotal([])).toBe(0)
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

describe('invoice breakdown', () => {
  const inv = (o: Partial<Invoice>): Invoice => ({
    id: 'i', org_id: 'o', lead_id: 'l', token: 't', type: 'quick', lifecycle: 'draft',
    delivery: 'not_sent', accounting: 'not_connected', dispute: 'none',
    line_items: [], payments: [], created_at: '', ...o,
  })
  it('linesSubtotal sums line subtotals', () => {
    expect(linesSubtotal([li(2, 50), li(1, 45.99)])).toBe(145.99)
  })
  it('discount percent and fixed, capped at subtotal', () => {
    expect(invoiceDiscountAmount(1000, { type: 'percent', value: 10 })).toBe(100)
    expect(invoiceDiscountAmount(1000, { type: 'fixed', value: 1500 })).toBe(1000)
    expect(invoiceDiscountAmount(1000, undefined)).toBe(0)
  })
  it('tax on the discounted base', () => {
    expect(invoiceTaxAmount(900, 10)).toBe(90)
    expect(invoiceTaxAmount(900, undefined)).toBe(0)
  })
  it('creditsTotal sums positive credits', () => {
    expect(creditsTotal([{ description: 'a', amount: 200 }, { description: 'b', amount: 0 }])).toBe(200)
  })
  it('invoiceGross = subtotal - discount + tax; invoiceAmountDue subtracts credits', () => {
    const v = inv({ line_items: [li(1, 1000)], discount: { type: 'percent', value: 10 }, tax_rate: 10,
      credits: [{ description: 'deposit', amount: 300 }] })
    expect(invoiceGross(v)).toBe(990)      // 1000 -100 +90
    expect(invoiceAmountDue(v)).toBe(690)  // 990 - 300
  })
  it('invoiceBalance uses amount due (net of discount/tax/credits)', () => {
    const v = inv({ line_items: [li(1, 1000)], discount: { type: 'percent', value: 10 }, tax_rate: 10,
      credits: [{ description: 'd', amount: 300 }], payments: [pay(90)] })
    expect(invoiceBalance(v)).toBe(600) // due 690 - paid 90
  })
})
