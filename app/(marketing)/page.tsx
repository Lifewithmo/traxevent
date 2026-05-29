import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function MarketingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <h1 className="text-5xl font-bold text-gray-900 mb-4">TraxEvent</h1>
      <p className="text-xl text-gray-500 mb-8 text-center max-w-md">
        Camp registration and management for churches and ministries.
      </p>
      <div className="flex gap-3">
        <Link href="/signup">
          <Button size="lg">Get started</Button>
        </Link>
        <Link href="/login">
          <Button size="lg" variant="outline">Sign in</Button>
        </Link>
      </div>
    </main>
  )
}
