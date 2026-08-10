import { adminDb } from '@/lib/firebase-admin'
import { assembleCalendarFeed } from '@/lib/calendar-feed'
import { CALENDAR_KINDS, filterFeed, type CalendarKind } from '@/lib/calendar'
import { buildIcs } from '@/lib/ics'

export const dynamic = 'force-dynamic'

// Unauthenticated by design: calendar apps can't log in. The token is the
// secret — compare it before revealing anything, and answer 404 (not 401)
// so a probe can't distinguish a wrong token from a missing org.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string; token: string }> }
) {
  const { orgSlug, token } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) return new Response('Not found', { status: 404 })
  const org = orgSnap.docs[0]
  const expected = org.data().ics_token as string | undefined
  if (!expected || token !== expected) return new Response('Not found', { status: 404 })

  const includeParam = new URL(request.url).searchParams.get('include')
  const kinds = includeParam
    ? (includeParam.split(',').filter((k): k is CalendarKind => (CALENDAR_KINDS as string[]).includes(k)))
    : CALENDAR_KINDS
  if (kinds.length === 0) return new Response('Not found', { status: 404 })

  const items = filterFeed(await assembleCalendarFeed(org.id, orgSlug), kinds)
  const name = `${org.data().name ?? 'TraxEvent'} — TraxEvent`
  return new Response(buildIcs(items, name, new Date()), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="traxevent.ics"',
      // Calendar apps poll on their own schedule; an hour of CDN caching is fine.
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
