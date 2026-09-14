export const HOTPLATE_FEE = { rate: 0.05, perOrder: 0.55 } as const

export interface FeeAutopsyInput {
  ordersPerDrop: number
  dropsPerMonth: number
  avgOrderValue: number
}

export function computeFeeAutopsy(input: FeeAutopsyInput) {
  const monthlyOrders = input.ordersPerDrop * input.dropsPerMonth
  const monthlyRevenue = monthlyOrders * input.avgOrderValue
  const hotplateMonthlyFee = monthlyRevenue * HOTPLATE_FEE.rate + monthlyOrders * HOTPLATE_FEE.perOrder
  const hotplateAnnualFee = hotplateMonthlyFee * 12
  return {
    monthlyOrders,
    monthlyRevenue,
    hotplateMonthlyFee,
    hotplateAnnualFee,
    brewtraxFee: 0 as const,
    monthlyKept: hotplateMonthlyFee, // what BrewTrax's 0% lets you keep vs Hot Plate
    annualKept: hotplateAnnualFee,
  }
}

export function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Math.round(n))
}

export function formatUsdCents(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
