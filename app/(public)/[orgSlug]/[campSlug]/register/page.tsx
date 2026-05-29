export default async function RegisterPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center text-gray-400">
        <h1 className="text-2xl font-bold text-gray-700 mb-2">Registration</h1>
        <p className="text-sm">
          {orgSlug} / {campSlug}
        </p>
        <p className="mt-4">Public registration form — Phase 1b.</p>
      </div>
    </main>
  )
}
