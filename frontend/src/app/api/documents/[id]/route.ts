import { createClient } from '@/lib/supabase/server'
import { deleteFile } from '@/lib/r2/upload'
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

    // Delete the object first: if R2 fails the record stays, so the user can retry
    // instead of leaving an orphaned file nobody can see. R2 deletes are idempotent.
    await deleteFile(document.storage_key)

    const { error } = await supabase.from('documents').delete().eq('id', document.id)

    if (error) {
      console.error('Error deleting document:', error)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    // TODO (Phase 8): delete this document's vectors from Pinecone.

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
