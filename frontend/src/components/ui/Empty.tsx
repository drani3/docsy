export default function Empty({ 
  title, 
  description, 
  actionText, 
  onAction 
}: { 
  title: string
  description: string
  actionText?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-gray-400 mb-4">
        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4 max-w-sm">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          {actionText}
        </button>
      )}
    </div>
  )
}
