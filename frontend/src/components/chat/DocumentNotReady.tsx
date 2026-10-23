import Link from 'next/link'

export default function DocumentNotReady({
  document,
}: {
  document: { filename: string; status: string; error_message: string | null }
}) {
  return (
    <div className="max-w-3xl">
      <Link href="/documents" className="text-sm text-indigo-600 hover:text-indigo-800">
        ← All documents
      </Link>
      <h2 className="mt-2 mb-6 text-2xl font-bold break-words">{document.filename}</h2>
      <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-700">
        {document.status === 'failed' ? (
          <>
            <p className="font-medium text-red-700">This document could not be processed.</p>
            {document.error_message && <p className="mt-1">{document.error_message}</p>}
            <p className="mt-2">Retry it from the documents page.</p>
          </>
        ) : (
          <p>
            This document is still being prepared (<span className="capitalize">{document.status}</span>). You can ask
            questions once it&apos;s ready.
          </p>
        )}
      </div>
    </div>
  )
}
