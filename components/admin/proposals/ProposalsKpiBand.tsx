import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import type { ProposalLedgerTiles } from '@/lib/proposals/ledger'

// Server component on purpose: see ProposalsLedger for the PII rationale — the
// whole /proposals subtree stays server-rendered so no raw Proposal doc (token,
// signature.ip, signature.signer_email, pending_signature) is ever serialized
// into the client bundle.

interface ProposalsKpiBandProps {
  tiles: ProposalLedgerTiles
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

export function ProposalsKpiBand({ tiles }: ProposalsKpiBandProps) {
  return (
    <KpiBand>
      <StatTile
        label="Out for signature"
        value={money(tiles.outstandingValue)}
        tone="money"
        note={`${tiles.outstandingCount} ${tiles.outstandingCount === 1 ? 'proposal' : 'proposals'}`}
      />
      <StatTile
        label="Needs attention"
        value={String(tiles.needsAttention)}
        tone={tiles.needsAttention > 0 ? 'alert' : 'default'}
      />
      <StatTile
        label="Accepted"
        value={money(tiles.acceptedValue)}
        tone="money"
        note={`${tiles.acceptedCount} won`}
      />
      <StatTile
        label="Deposits due"
        value={money(tiles.depositsDue)}
        tone={tiles.depositsDue > 0 ? 'alert' : 'default'}
      />
    </KpiBand>
  )
}
