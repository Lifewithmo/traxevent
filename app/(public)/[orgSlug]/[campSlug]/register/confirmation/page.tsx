import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
  searchParams: Promise<{ email?: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { email } = await searchParams

  return (
    <div className="min-h-screen bg-[#FAF5FF] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-4">&#10003;</div>
        <h1 className="text-2xl font-bold text-[#4C1D95] mb-3">You&apos;re registered!</h1>
        <p className="text-gray-600 mb-2">
          A confirmation email with a link to your registration has been sent to{' '}
          <strong>{email ?? 'your email address'}</strong>.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Use that link to view your registration, check your room assignment, and update your info.
        </p>
        <Link href={`/${orgSlug}/${campSlug}/register/create-account`}>
          <Button className="bg-[#7C3AED] hover:bg-[#6D28D9]">
            Create a free account to manage all your registrations
          </Button>
        </Link>
      </div>
    </div>
  )
}
