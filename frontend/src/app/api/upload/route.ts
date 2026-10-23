import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStorageKey, generateUploadUrl } from '@/lib/r2/upload'
import { validateUpload } from '@/lib/uploads'
import { checkEntitlement } from '@/lib/billing/entitlements'
import { rateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/log'
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

    const limited = await rateLimit('upload', user.id)
    if (limited) return limited

    const body = await request.json().catch(() => null)
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : ''
    const fileSize = Number(body?.fileSize)
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : ''

    if (!fileName || !Number.isSafeInteger(fileSize)) {
      return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 })
    }

    const entitlement = await checkEntitlement(user.id, 'upload_document', { fileSize })
    if (!entitlement.allowed) {
      return NextResponse.json({ error: entitlement.reason, upgrade: entitlement.upgrade }, { status: 403 })
    }

    const validationError = validateUpload({ name: fileName, size: fileSize, type: mimeType }, entitlement.limits.maxFileSize)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const documentId = crypto.randomUUID()
    const storageKey = generateStorageKey(user.id, documentId)

    // Counts the user's documents and inserts under a per-user lock, so
    // parallel uploads can't exceed the plan's document limit
    const { data: created, error: dbError } = await createAdminClient().rpc('create_document', {
      p_id: documentId,
      p_user_id: user.id,
      p_filename: fileName.slice(0, 255),
      p_storage_key: storageKey,
      p_file_size: fileSize,
      p_max_documents: entitlement.limits.documents,
    })

    if (dbError) {
      log.error('upload.create_failed', { user_id: user.id, error: dbError.message })
      return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
    }
    if (!created) {
      return NextResponse.json(
        {
          error: `Your plan allows ${entitlement.limits.documents} documents. Delete one to upload another${
            entitlement.plan === 'free' ? ', or upgrade to Pro' : ''
          }.`,
          upgrade: entitlement.plan === 'free',
        },
        { status: 403 }
      )
    }

    const uploadUrl = await generateUploadUrl(storageKey, mimeType)

    log.info('upload.started', { user_id: user.id, document_id: documentId, bytes: fileSize })
    return NextResponse.json({ documentId, uploadUrl })
  } catch (error) {
    log.error('upload.failed', { error })
    return NextResponse.json({ error: 'Failed to start upload' }, { status: 500 })
  }
}
