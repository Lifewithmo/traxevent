export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicDrop } from '@/actions/storefront-public'
import { DropStorefront } from '@/components/storefront/DropStorefront'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; dropId: string }>
}): Promise<Metadata> {
  const { handle, dropId } = await params
  const drop = await getPublicDrop(handle, dropId)
  if (!drop) return {}
  const title = `${drop.title} — ${drop.org.display_name}`
  return {
    title,
    ...(drop.note ? { description: drop.note } : {}),
    openGraph: {
      title,
      ...(drop.note ? { description: drop.note } : {}),
      ...(drop.items.find((i) => i.photo_url) ? { images: [drop.items.find((i) => i.photo_url)!.photo_url!] } : {}),
    },
  }
}

export default async function PublicDropPage({
  params,
}: {
  params: Promise<{ handle: string; dropId: string }>
}) {
  const { handle, dropId } = await params
  const drop = await getPublicDrop(handle, dropId)
  if (!drop) notFound()
  return <DropStorefront drop={drop} />
}
