'use client'

import { TodayTiles } from '@/components/admin/today/TodayTiles'
import { NeedsAttentionList } from '@/components/admin/today/NeedsAttentionList'
import { DueTasksList } from '@/components/admin/today/DueTasksList'
import { WaitingList } from '@/components/admin/today/WaitingList'
import type { TodayData } from '@/lib/today'

interface TodayClientProps {
  orgId: string
  orgSlug: string
  data: TodayData
}

export function TodayClient({ orgId, orgSlug, data }: TodayClientProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Today</h1>
      <TodayTiles
        tasksDue={data.tiles.tasksDue}
        needsAttention={data.tiles.needsAttention}
        openPipelineValue={data.tiles.openPipelineValue}
      />
      <NeedsAttentionList orgId={orgId} orgSlug={orgSlug} items={data.needsAttention} />
      <DueTasksList orgId={orgId} orgSlug={orgSlug} items={data.dueTasks} />
      <WaitingList orgId={orgId} orgSlug={orgSlug} items={data.waiting} />
    </div>
  )
}
