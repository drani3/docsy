import { createClient } from '@/lib/supabase/server'
import { deleteFile } from '@/lib/r2/upload'
import { deleteDocumentVectors, isPineconeConfigured, namespaceForUser } from '@/lib/vector/pinecone'
import { NextResponse } from 'next/server'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: document } = await supabase
      .from('documents')
      .select('id, storage_key')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete external copies first (vectors, then the file): if either fails the
    // record stays, so the user can retry instead of leaving orphans nobody can
    // see. Both deletes are idempotent. Chunks go with the row (on delete cascade).
    if (isPineconeConfigured()) {
      await deleteDocumentVectors(namespaceForUser(user.id), document.id)
    } else {
      console.warn('Pinecone is not configured; skipping vector deletion for', document.id)
    }
    await deleteFile(document.storage_key)

    const { error } = await supabase.from('documents').delete().eq('id', document.id)

    if (error) {
      console.error('Error deleting document:', error)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
