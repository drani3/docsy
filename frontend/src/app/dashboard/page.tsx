import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-gray-600">Manage your documents</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">No documents yet. Upload a PDF to get started.</p>
      </div>
    </AppLayout>
  )
}
