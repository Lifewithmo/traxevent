import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import type { TodayTiles } from '@/lib/today'

interface TodayKpiBandProps {
  tiles: TodayTiles
  eventsToday?: number
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

export function TodayKpiBand({ tiles, eventsToday }: TodayKpiBandProps) {
  return (
    <KpiBand>
      <StatTile label="Open pipeline" value={money(tiles.openPipelineValue)} tone="money" />
      <StatTile label="Tasks due" value={String(tiles.tasksDue)} />
      <StatTile
        label="Needs attention"
        value={String(tiles.needsAttention)}
        tone={tiles.needsAttention > 0 ? 'alert' : 'default'}
      />
      <StatTile label="Events today" value={String(eventsToday ?? 0)} />
    </KpiBand>
  )
}
