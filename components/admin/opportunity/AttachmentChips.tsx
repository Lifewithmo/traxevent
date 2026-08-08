import { attachmentChips } from '@/lib/opportunity-detail'
import type { Proposal, Invoice, Contract, Vendor, Task } from '@/lib/types'

interface AttachmentChipsProps {
  tasks: Task[]
  proposals: Proposal[]
  invoices: Invoice[]
  contracts: Contract[]
  vendors: Vendor[]
  today: string
}

export function AttachmentChips(props: AttachmentChipsProps) {
  const chips = attachmentChips(props)
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.kind}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
            c.count === 0 ? 'border-border text-muted-foreground' : 'border-border bg-muted/50'
          }`}
        >
          <span className="font-medium">{c.label}</span>
          <span>{c.count}</span>
          {c.hint && <span className="text-muted-foreground">· {c.hint}</span>}
        </span>
      ))}
    </div>
  )
}
