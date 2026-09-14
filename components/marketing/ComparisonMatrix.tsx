const ROWS: { label: string; brewtrax: string; hotplate: string }[] = [
  { label: 'Per-order fee', brewtrax: '$0 per order', hotplate: '5% + 55¢' },
  { label: 'Surcharge shown to your customer', brewtrax: 'None', hotplate: '~$2.30 on a $20 order' },
  { label: 'Bookings, proposals, invoices', brewtrax: 'Included', hotplate: 'Not offered' },
  { label: 'Event-day checklists', brewtrax: 'Included', hotplate: 'Not offered' },
  { label: 'Runs on your phone', brewtrax: 'Yes', hotplate: 'Yes' },
  { label: 'Export your data / no contract', brewtrax: 'Yes', hotplate: 'Limited' },
]

export function ComparisonMatrix() {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-left">
          <th className="py-2"></th>
          <th className="py-2 text-copper-700">BrewTrax</th>
          <th className="py-2 text-muted-foreground">Hot Plate</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.label} className="border-t border-border">
            <td className="py-3 pr-4 text-muted-foreground">{r.label}</td>
            <td className="py-3 pr-4 font-medium text-foreground">{r.brewtrax}</td>
            <td className="py-3 text-muted-foreground">{r.hotplate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
