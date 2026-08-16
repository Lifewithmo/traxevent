import type { DropItem, DropPhase, DropStatus, OrderLine, OrderStatus } from '@/lib/types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const MAX_LINE_QTY = 50
export const MAX_TIP = 500
export const PENDING_HOLD_MS = 15 * 60 * 1000

export interface CartLine { product_id: string; qty: number }

// Both instants are toISOString-normalized UTC, so lexicographic comparison
// is chronological. Cores normalize opens_at/closes_at on write (Task 4).
export function dropPhase(
  drop: { status: DropStatus; opens_at: string; closes_at: string },
  nowIso: string,
): DropPhase {
  if (drop.status === 'draft') return 'draft'
  if (drop.status === 'archived') return 'archived'
  if (drop.status === 'closed') return 'ended'
  if (nowIso < drop.opens_at) return 'upcoming'
  if (nowIso >= drop.closes_at) return 'ended'
  return 'open'
}

export interface OrderTotals {
  lines: OrderLine[]
  subtotal: number
  tax_rate?: number
  tax: number
  tip: number
  total: number
}

// Server-authoritative money math — client totals are never trusted.
export function computeOrderTotals(
  items: DropItem[],
  cart: CartLine[],
  opts?: { tax_rate?: number; tip?: number },
): OrderTotals {
  if (cart.length === 0) throw new Error('Your cart is empty')
  const byId = new Map(items.map((i) => [i.product_id, i]))
  const seen = new Set<string>()
  const lines: OrderLine[] = cart.map((c) => {
    const item = byId.get(c.product_id)
    if (!item) throw new Error('An item in your cart is no longer available')
    if (seen.has(c.product_id)) throw new Error('Duplicate item in cart')
    seen.add(c.product_id)
    if (!Number.isInteger(c.qty) || c.qty < 1 || c.qty > MAX_LINE_QTY) {
      throw new Error('Invalid quantity')
    }
    return { product_id: item.product_id, name: item.name, price: item.price, qty: c.qty }
  })
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0))
  const rate = opts?.tax_rate
  const hasTax = typeof rate === 'number' && rate > 0
  const tax = hasTax ? round2((subtotal * rate) / 100) : 0
  const tipRaw = opts?.tip ?? 0
  if (!Number.isFinite(tipRaw) || tipRaw < 0 || tipRaw > MAX_TIP) throw new Error('Invalid tip')
  const tip = round2(tipRaw)
  return {
    lines,
    subtotal,
    ...(hasTax ? { tax_rate: rate } : {}),
    tax,
    tip,
    total: round2(subtotal + tax + tip),
  }
}

export interface AvailabilityOrder {
  status: OrderStatus
  expires_at?: string
  lines: Array<Pick<OrderLine, 'product_id' | 'qty'>>
}

// available = stock − (confirmed + picked_up + unexpired pending). Expired
// pending orders simply stop counting — no cron, no cleanup job (spec §5.3).
export function soldByProduct(orders: AvailabilityOrder[], nowIso: string): Map<string, number> {
  const sold = new Map<string, number>()
  for (const o of orders) {
    const counts =
      o.status === 'confirmed' ||
      o.status === 'picked_up' ||
      (o.status === 'pending' && !!o.expires_at && o.expires_at > nowIso)
    if (!counts) continue
    for (const l of o.lines) sold.set(l.product_id, (sold.get(l.product_id) ?? 0) + l.qty)
  }
  return sold
}

/** null = unlimited. */
export function availableStock(item: DropItem, sold: Map<string, number>): number | null {
  if (item.stock === undefined) return null
  return Math.max(0, item.stock - (sold.get(item.product_id) ?? 0))
}

export function cartFits(
  items: DropItem[],
  cart: CartLine[],
  sold: Map<string, number>,
): { ok: true } | { ok: false; name: string } {
  const byId = new Map(items.map((i) => [i.product_id, i]))
  for (const c of cart) {
    const item = byId.get(c.product_id)
    if (!item) return { ok: false, name: 'an item' }
    const avail = availableStock(item, sold)
    if (avail !== null && c.qty > avail) return { ok: false, name: item.name }
  }
  return { ok: true }
}
