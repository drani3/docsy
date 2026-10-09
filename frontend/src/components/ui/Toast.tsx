'use client'

import { useEffect, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

let toasts: Toast[] = []
let listeners: ((toasts: Toast[]) => void)[] = []

export function showToast(type: ToastType, message: string) {
  const id = Date.now().toString()
  const toast: Toast = { id, type, message }
  toasts.push(toast)
  listeners.forEach(listener => listener([...toasts]))
  
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    listeners.forEach(listener => listener([...toasts]))
  }, 3000)
}

export default function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([])

  useEffect(() => {
    listeners.push(setCurrentToasts)
    return () => {
      listeners = listeners.filter(l => l !== setCurrentToasts)
    }
  }, [])

  const getBackgroundColor = (type: ToastType) => {
    switch (type) {
      case 'success': return 'bg-green-50'
      case 'error': return 'bg-red-50'
      case 'info': return 'bg-blue-50'
    }
  }

  const getTextColor = (type: ToastType) => {
    switch (type) {
      case 'success': return 'text-green-800'
      case 'error': return 'text-red-800'
      case 'info': return 'text-blue-800'
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {currentToasts.map(toast => (
        <div
          key={toast.id}
          className={`${getBackgroundColor(toast.type)} ${getTextColor(toast.type)} px-4 py-3 rounded-lg shadow-lg text-sm`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
