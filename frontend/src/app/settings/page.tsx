import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-gray-600">Manage your account</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-sm text-gray-900">{user.email}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
