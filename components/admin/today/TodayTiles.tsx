import { Card, CardContent } from '@/components/ui/card'

interface TodayTilesProps {
  tasksDue: number
  needsAttention: number
  openPipelineValue: number
}

const money = (n: number) => `$${n.toFixed(2)}`

export function TodayTiles({ tasksDue, needsAttention, openPipelineValue }: TodayTilesProps) {
  const tiles = [
    { label: 'Tasks due', value: String(tasksDue) },
    { label: 'Needs attention', value: String(needsAttention) },
    { label: 'Open pipeline', value: money(openPipelineValue) },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t.label}</p>
            <p className="text-2xl font-bold">{t.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
