export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicOrder } from '@/actions/storefront-public'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  pending: { title: 'Confirming your payment…', body: 'This usually takes a few seconds. Refresh this page to check again.' },
  confirmed: { title: 'Order confirmed', body: 'Show this page at pickup.' },
  picked_up: { title: 'Picked up', body: 'Enjoy! This order has been handed off.' },
  canceled: { title: 'Order canceled', body: 'This order was canceled.' },
  refunded: { title: 'Order refunded', body: 'This order was canceled and refunded to your card.' },
}

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const order = await getPublicOrder(token)
  if (!order) notFound()
  const copy = STATUS_COPY[order.status] ?? STATUS_COPY.confirmed

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-10">
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="mt-1 text-sm text-gray-600">{copy.body}</p>

      {order.number !== undefined && (
        <p className="mt-6 text-center text-5xl font-bold">#{order.number}</p>
      )}
      <p className="mt-2 text-center text-sm text-gray-600">
        {order.drop_title} — {order.buyer_name}
      </p>
      <p className="mt-1 text-center text-sm text-gray-600">
        {order.pickup.day} · {order.pickup.slot ?? `${order.pickup.start}–${order.pickup.end}`} · {order.pickup.location_name}
      </p>

      <div className="mt-8 rounded-2xl border p-4">
        {order.lines.map((l) => (
          <div key={l.product_id} className="flex items-center justify-between py-1 text-sm">
            <span>{l.qty} × {l.name}</span>
            <span>{money(l.price * l.qty)}</span>
          </div>
        ))}
        <div className="mt-2 border-t pt-2 text-sm text-gray-600">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
          {order.tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{money(order.tax)}</span></div>}
          {order.tip !== undefined && <div className="flex justify-between"><span>Tip</span><span>{money(order.tip)}</span></div>}
          <div className="mt-1 flex justify-between font-semibold text-gray-900"><span>Total</span><span>{money(order.total)}</span></div>
        </div>
      </div>
    </div>
  )
}
