'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Navbar() {
  const [showMenu, setShowMenu] = useState(false)
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <nav className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <h1 className="text-xl font-bold">Docsy</h1>
          
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-indigo-600 font-medium">U</span>
              </div>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border py-1">
                <button
                  onClick={() => {
                    setShowMenu(false)
                    window.location.href = '/settings'
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Settings
                </button>
                <hr className="my-1" />
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
