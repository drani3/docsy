'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Sidebar() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  const isActive = (path: string) => pathname === path

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed bottom-4 right-4 z-50 p-4 bg-indigo-600 text-white rounded-full shadow-lg"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 border-r bg-white transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <nav className="p-4 space-y-2 h-full">
          <Link
            href="/dashboard"
            onClick={() => setIsOpen(false)}
            className={`block px-4 py-2 rounded-lg text-sm font-medium ${
              isActive('/dashboard')
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            Dashboard
          </Link>
          <Link
            href="/documents"
            onClick={() => setIsOpen(false)}
            className={`block px-4 py-2 rounded-lg text-sm font-medium ${
              isActive('/documents') || pathname.startsWith('/documents/')
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            Documents
          </Link>
          <Link
            href="/conversations"
            onClick={() => setIsOpen(false)}
            className={`block px-4 py-2 rounded-lg text-sm font-medium ${
              isActive('/conversations') || pathname.startsWith('/conversations/')
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            Conversations
          </Link>
          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className={`block px-4 py-2 rounded-lg text-sm font-medium ${
              isActive('/settings')
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            Settings
          </Link>
        </nav>
      </aside>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
        />
      )}
    </>
  )
}
