import { createClient } from '@/lib/supabase/server'
import { deleteFile, getObjectSize } from '@/lib/r2/upload'
import { MAX_FILE_SIZE } from '@/lib/uploads'
import { NextResponse } from 'next/server'

// Step 2 of the upload flow: confirm the object actually landed in R2 with the
// size we expect (a presigned PUT can't enforce size), then mark it for processing.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: document } = await supabase
      .from('documents')
      .select('id, storage_key, file_size, status')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.status !== 'uploading') {
      return NextResponse.json({ error: 'Document upload already completed' }, { status: 409 })
    }

    const size = await getObjectSize(document.storage_key)

    if (size === null) {
      return NextResponse.json({ error: 'File was not uploaded' }, { status: 400 })
    }

    if (size !== document.file_size || size > MAX_FILE_SIZE) {
      await deleteFile(document.storage_key)
      await supabase.from('documents').update({ status: 'failed' }).eq('id', document.id)
      return NextResponse.json({ error: 'Uploaded file does not match the declared size' }, { status: 400 })
    }

    // Ingestion (Phase 7) will pick up documents in the "processing" state.
    const { error } = await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', document.id)

    if (error) {
      console.error('Error completing upload:', error)
      return NextResponse.json({ error: 'Failed to complete upload' }, { status: 500 })
    }

    return NextResponse.json({ id: document.id, status: 'processing' })
  } catch (error) {
    console.error('Error completing upload:', error)
    return NextResponse.json({ error: 'Failed to complete upload' }, { status: 500 })
  }
}
