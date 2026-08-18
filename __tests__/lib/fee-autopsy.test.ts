import { computeFeeAutopsy, HOTPLATE_FEE, formatUsd } from '@/lib/fee-autopsy'

test('computes Hot Plate fees and the amount BrewTrax lets you keep', () => {
  // 30 orders/drop × 4 drops/mo = 120 orders/mo; avg $20 → $2,400/mo revenue
  const r = computeFeeAutopsy({ ordersPerDrop: 30, dropsPerMonth: 4, avgOrderValue: 20 })
  expect(r.monthlyOrders).toBe(120)
  expect(r.monthlyRevenue).toBe(2400)
  // Hot Plate: 5% of $2,400 = $120, + $0.55 × 120 = $66 → $186/mo
  expect(r.hotplateMonthlyFee).toBeCloseTo(186, 2)
  expect(r.hotplateAnnualFee).toBeCloseTo(2232, 2)
  expect(r.brewtraxFee).toBe(0)
  expect(r.monthlyKept).toBeCloseTo(186, 2)
  expect(r.annualKept).toBeCloseTo(2232, 2)
})

test('HOTPLATE_FEE matches the published rate', () => {
  expect(HOTPLATE_FEE).toEqual({ rate: 0.05, perOrder: 0.55 })
})

test('formatUsd renders whole dollars with a thousands separator and no cents', () => {
  expect(formatUsd(3912.4)).toBe('$3,912')
  expect(formatUsd(0)).toBe('$0')
})
