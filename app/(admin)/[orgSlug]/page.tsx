import { getOrgBySlug } from '@/actions/orgs'
import { DEFAULT_EVENT_TYPE_ID, resolveTerminology } from '@/lib/event-types'
import { listCamps } from '@/actions/camps'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DuplicateEventButton } from '@/components/admin/DuplicateEventButton'
import Link from 'next/link'

export default async function OrgHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const org = await getOrgBySlug(orgSlug)
  if (!org) redirect('/login')

  const camps = await listCamps(org.id)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{org.name}</h1>
        <Link href={`/${orgSlug}/new-camp`}>
          <Button>New event</Button>
        </Link>
      </div>

      {camps.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No events yet</p>
          <p className="mt-1 text-sm">Create your first event to get started.</p>
          <Link href={`/${orgSlug}/new-camp`} className="mt-4 inline-block">
            <Button>Create an event</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {camps.map((camp) => (
            <Card key={camp.id} className="hover:shadow-md transition-shadow h-full flex flex-col">
              <Link href={`/${orgSlug}/${camp.slug}/dashboard`} className="block cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-base">{camp.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{camp.year}</Badge>
                    <Badge variant={camp.status === 'active' ? 'default' : 'secondary'}>
                      {camp.status}
                    </Badge>
                    <Badge variant="outline">{resolveTerminology(camp.event_type_id ?? DEFAULT_EVENT_TYPE_ID, camp.event_type_terminology).eventLabel}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {camp.camp_start} → {camp.camp_end}
                  </p>
                </CardContent>
              </Link>
              <CardContent className="pt-0 mt-auto">
                <DuplicateEventButton orgId={org.id} orgSlug={orgSlug} sourceCampId={camp.id} sourceName={camp.name} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
