import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm text-center">
        <h1 className="text-4xl font-bold mb-4">Docsy</h1>
        <p className="text-lg text-gray-600">AI Document Assistant</p>
        <p className="mt-4 text-gray-500">Upload PDFs and ask questions with AI</p>
        <Link
          href="/login"
          className="mt-8 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Get Started
        </Link>
      </div>
    </main>
  )
}
