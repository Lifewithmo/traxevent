export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getIntakeFormInfo } from '@/actions/intake-public'
import { IntakeForm } from '@/components/public/IntakeForm'

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const info = await getIntakeFormInfo(token)
  if (!info) notFound()
  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">{info.org_name}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Tell us about your event and we&apos;ll get back to you.
      </p>
      <IntakeForm token={token} orgName={info.org_name} />
    </div>
  )
}
