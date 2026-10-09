import { createClient } from '@/lib/supabase/server'
import { generateStorageKey, generateUploadUrl } from '@/lib/r2/upload'
import { validateUpload } from '@/lib/uploads'
import { NextResponse } from 'next/server'

// Step 1 of the upload flow: create the document record and hand back a
// presigned URL. The browser then PUTs the file straight to R2 and calls
// POST /api/documents/[id]/complete.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : ''
    const fileSize = Number(body?.fileSize)
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : ''

    if (!fileName || !Number.isFinite(fileSize)) {
      return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 })
    }

    const validationError = validateUpload({ name: fileName, size: fileSize, type: mimeType })
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const documentId = crypto.randomUUID()
    const storageKey = generateStorageKey(user.id, documentId)

    const { error: dbError } = await supabase.from('documents').insert({
      id: documentId,
      user_id: user.id,
      filename: fileName.slice(0, 255),
      storage_key: storageKey,
      file_size: fileSize,
      mime_type: mimeType,
      status: 'uploading',
    })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
    }

    const uploadUrl = await generateUploadUrl(storageKey, mimeType)

    return NextResponse.json({ documentId, uploadUrl })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to start upload' }, { status: 500 })
  }
}
