import { createClient } from '@/lib/supabase/server'
import { generateDownloadUrl } from '@/lib/r2/upload'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ownership is enforced here (and by RLS); the storage key is never taken from the client.
    const { data: document } = await supabase
      .from('documents')
      .select('storage_key, filename, status')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.status === 'uploading') {
      return NextResponse.json({ error: 'Document is still uploading' }, { status: 409 })
    }

    const url = await generateDownloadUrl(document.storage_key, document.filename)

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Error generating download URL:', error)
    return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
  }
}
