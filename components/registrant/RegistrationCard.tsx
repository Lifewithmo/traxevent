import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import type { Family } from '@/lib/types'

interface RegistrationCardProps {
  family: Family
}

const statusColor: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-800',
  pending:   'bg-yellow-100 text-yellow-800',
  waitlisted:'bg-blue-100 text-blue-800',
  cancelled: 'bg-red-100 text-red-800',
}

export function RegistrationCard({ family }: RegistrationCardProps) {
  return (
    <Link href={`/${family.org_slug}/${family.camp_slug}/my-registration`}>
      <Card className="border-[#DDD6FE] hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="py-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[#4C1D95]">{family.camp_name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{family.org_name}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${statusColor[family.registration_status]}`}>
            {family.registration_status}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}
