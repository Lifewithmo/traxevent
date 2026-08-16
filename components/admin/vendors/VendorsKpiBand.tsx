import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { formatMoney } from '@/lib/utils'
import type { VendorLedgerTiles } from '@/lib/vendors'

interface VendorsKpiBandProps {
  tiles: VendorLedgerTiles
  total: number
}

export function VendorsKpiBand({ tiles, total }: VendorsKpiBandProps) {
  return (
    <KpiBand>
      <StatTile label="Committed" value={formatMoney(tiles.committed)} tone="money" note="confirmed vendors" />
      <StatTile label="Estimated total" value={formatMoney(tiles.estimated)} tone="money" note="incl. potential" />
      <StatTile
        label="To confirm"
        value={String(tiles.toConfirmCount)}
        tone={tiles.toConfirmCount > 0 ? 'alert' : 'default'}
        note={tiles.toConfirmCount > 0 ? formatMoney(tiles.toConfirmValue) : undefined}
      />
      <StatTile label="Vendors" value={String(total)} />
    </KpiBand>
  )
}
