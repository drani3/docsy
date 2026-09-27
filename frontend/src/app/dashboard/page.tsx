import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold">Docsy</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <form action={async () => {
                'use server'
                const supabase = await createClient()
                await supabase.auth.signOut()
                redirect('/')
              }}>
                <button className="text-sm text-gray-600 hover:text-gray-900">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-gray-600">Manage your documents</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500">No documents yet. Upload a PDF to get started.</p>
        </div>
      </div>
    </div>
  )
}
