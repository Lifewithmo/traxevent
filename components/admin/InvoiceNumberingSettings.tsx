'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateInvoiceNumbering } from '@/actions/invoices'

interface InvoiceNumberingSettingsProps {
  orgId: string
  initial: { prefix?: string; next_number: number }
}

export function InvoiceNumberingSettings({ orgId, initial }: InvoiceNumberingSettingsProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [prefix, setPrefix] = useState(initial.prefix ?? '')
  const [nextNumber, setNextNumber] = useState(String(initial.next_number))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setPrefix(initial.prefix ?? '')
      setNextNumber(String(initial.next_number))
      setError(null)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const parsed = Number(nextNumber)
      await updateInvoiceNumbering(orgId, {
        prefix,
        next_number: Number.isNaN(parsed) ? undefined : parsed,
      })
      setOpen(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save numbering settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>
        <Settings2 className="size-4" />
        Numbering
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invoice numbering</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoice-numbering-prefix">Prefix</Label>
            <Input
              id="invoice-numbering-prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="e.g. INV-"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoice-numbering-next">Next invoice number</Label>
            <Input
              id="invoice-numbering-next"
              type="number"
              value={nextNumber}
              onChange={(e) => setNextNumber(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
