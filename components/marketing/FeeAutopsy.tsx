'use client'
import { useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { Card } from '@/components/ui/card'
import { computeFeeAutopsy, formatUsd, type FeeAutopsyInput } from '@/lib/fee-autopsy'

const FALLBACK: FeeAutopsyInput = { ordersPerDrop: 25, dropsPerMonth: 4, avgOrderValue: 18 }

export function FeeAutopsy({ defaults, heading = 'How much are fees costing you?' }:
  { defaults?: Partial<FeeAutopsyInput>; heading?: string }) {
  const [input, setInput] = useState<FeeAutopsyInput>({ ...FALLBACK, ...defaults })
  const r = computeFeeAutopsy(input)
  const set = (k: keyof FeeAutopsyInput) => (v: number) => setInput((s) => ({ ...s, [k]: v }))

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-foreground">{heading}</h3>
      <div className="mt-4 space-y-5">
        <Field label="Orders per drop" value={input.ordersPerDrop}
          min={5} max={200} onChange={set('ordersPerDrop')} format={(n) => `${n}`} />
        <Field label="Drops per month" value={input.dropsPerMonth}
          min={1} max={30} onChange={set('dropsPerMonth')} format={(n) => `${n}`} />
        <Field label="Average order value" value={input.avgOrderValue}
          min={5} max={80} onChange={set('avgOrderValue')} format={formatUsd} />
      </div>
      {/* Permanently-dark result panel: force the `dark` scope so the semantic
          fg tokens (money-green, status-alert-fg) resolve to their dark-mode,
          WCAG-AA-legible values regardless of the page's own theme. */}
      <div className="dark mt-6 rounded-lg bg-[color:var(--warm-950)] p-4 text-[color:var(--warm-50)]">
        <div className="flex items-baseline justify-between text-sm">
          <span>Hot Plate takes per year</span>
          <span className="text-lg font-bold text-[color:var(--status-alert-fg)]">−{formatUsd(r.hotplateAnnualFee)}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between text-sm">
          <span>On BrewTrax you keep</span>
          <span data-testid="autopsy-annual-kept" className="text-lg font-bold text-[color:var(--money-green)]">
            {formatUsd(r.annualKept)}
          </span>
        </div>
        <p className="mt-3 text-xs text-[color:var(--warm-300)]">
          Flat monthly subscription, 0% per order. Only Stripe’s processing (2.9% + 30¢) passes
          straight through — we add nothing on top.
        </p>
      </div>
    </Card>
  )
}

function Field({ label, value, min, max, onChange, format }: {
  label: string; value: number; min: number; max: number
  onChange: (v: number) => void; format: (n: number) => string
}) {
  return (
    <div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <label>{label}</label>
        <span className="font-medium text-foreground">{format(value)}</span>
      </div>
      <Slider aria-label={label} value={value} min={min} max={max} onValueChange={onChange} />
    </div>
  )
}
