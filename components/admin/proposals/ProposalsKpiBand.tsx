import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { formatProposalMoney } from '@/lib/proposals'
import type { ProposalLedgerTiles } from '@/lib/proposals/ledger'

// Server component on purpose: see ProposalsLedger for the PII rationale — the
// whole /proposals subtree stays server-rendered so no raw Proposal doc (token,
// signature.ip, signature.signer_email, pending_signature) is ever serialized
// into the client bundle.

interface ProposalsKpiBandProps {
  tiles: ProposalLedgerTiles
}

export function ProposalsKpiBand({ tiles }: ProposalsKpiBandProps) {
  const { outstandingCount } = tiles
  return (
    <KpiBand>
      {/* "Out for signature" sums each proposal's ceiling while "Accepted" sums
          locked floors — two different aggregations sitting side by side. Three
          tiered $1,000–$9,000 proposals read $27,000 against a $3,000 floor, so
          the note says out loud that this figure is the best case, not a forecast. */}
      <StatTile
        label="Out for signature"
        value={formatProposalMoney(tiles.outstandingValue)}
        tone="money"
        note={`ceiling · ${outstandingCount} ${outstandingCount === 1 ? 'proposal' : 'proposals'}`}
      />
      <StatTile
        label="Needs attention"
        value={String(tiles.needsAttention)}
        tone={tiles.needsAttention > 0 ? 'alert' : 'default'}
      />
      <StatTile
        label="Accepted"
        value={formatProposalMoney(tiles.acceptedValue)}
        tone="money"
        note={`${tiles.acceptedCount} won`}
      />
      <StatTile
        label="Deposits due"
        value={formatProposalMoney(tiles.depositsDue)}
        tone={tiles.depositsDue > 0 ? 'alert' : 'default'}
      />
    </KpiBand>
  )
}
