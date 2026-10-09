import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFile } from '@/lib/r2/upload'
import { embedTexts } from '@/lib/ai/openai'
import { deleteStaleVectors, namespaceForUser, upsertVectors, vectorId } from '@/lib/vector/pinecone'
import { extractPdfPages, IngestionError } from './pdf'
import { chunkPages } from './chunk'
import type { Database } from '@shared/types/database'

type DocumentUpdate = Database['public']['Tables']['documents']['Update']

const INSERT_BATCH_SIZE = 500
// Chunks are embedded and upserted in groups so a 500-page PDF doesn't hold
// thousands of 1536-dim vectors in memory at once
const EMBED_GROUP_SIZE = 200

// Runs the pipeline for one document:
//   R2 → text per page → chunks → Postgres  (status: processing)
//   chunks → OpenAI embeddings → Pinecone    (status: embedding)
//   → ready
// Idempotent: chunks upsert on (document_id, chunk_index) and vectors use
// deterministic ids, so a retry overwrites instead of duplicating.
// Caller must have already verified the user owns the document.
export async function ingestDocument(documentId: string): Promise<{ status: 'ready' | 'failed'; error?: string }> {
  const supabase = createAdminClient()
  const startedAt = Date.now()

  const { data: document, error: loadError } = await supabase
    .from('documents')
    .select('id, user_id, storage_key')
    .eq('id', documentId)
    .single()

  if (loadError || !document) {
    throw new Error(`Document ${documentId} not found`)
  }

  const setStatus = async (fields: Pick<DocumentUpdate, 'status' | 'page_count' | 'error_message'>) => {
    const { error } = await supabase.from('documents').update(fields).eq('id', documentId)
    if (error) throw new Error(`Failed to set status ${fields.status}: ${error.message}`)
  }

  try {
    await setStatus({ status: 'processing', error_message: null })

    // 1. Extract and chunk
    const data = await downloadFile(document.storage_key)
    const pages = await extractPdfPages(data)
    const chunks = chunkPages(pages)

    // 2. Save chunks, then drop any leftovers from a previous run
    const chunkIds = new Map<number, string>()
    for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + INSERT_BATCH_SIZE).map(c => ({
        document_id: documentId,
        chunk_index: c.chunkIndex,
        page_number: c.pageNumber,
        content: c.content,
        metadata: { char_count: c.content.length },
      }))
      const { data: saved, error } = await supabase
        .from('document_chunks')
        .upsert(batch, { onConflict: 'document_id,chunk_index' })
        .select('id, chunk_index')
      if (error || !saved) throw new Error(`Failed to save chunks: ${error?.message}`)
      for (const row of saved) chunkIds.set(row.chunk_index, row.id)
    }

    const { error: cleanupError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)
      .gte('chunk_index', chunks.length)
    if (cleanupError) throw new Error(`Failed to remove old chunks: ${cleanupError.message}`)

    // 3. Embed and index in Pinecone
    await setStatus({ status: 'embedding', page_count: pages.length })

    const namespace = namespaceForUser(document.user_id)
    let embeddingTokens = 0
    for (let i = 0; i < chunks.length; i += EMBED_GROUP_SIZE) {
      const group = chunks.slice(i, i + EMBED_GROUP_SIZE)
      const { embeddings, tokens } = await embedTexts(group.map(c => c.content))
      embeddingTokens += tokens
      await upsertVectors(
        namespace,
        group.map((c, j) => ({
          id: vectorId(documentId, c.chunkIndex),
          values: embeddings[j],
          metadata: {
            user_id: document.user_id,
            document_id: documentId,
            chunk_id: chunkIds.get(c.chunkIndex)!,
            chunk_index: c.chunkIndex,
            page_number: c.pageNumber,
          },
        }))
      )
    }
    const staleVectors = await deleteStaleVectors(namespace, documentId, chunks.length)

    // 4. Done
    await setStatus({ status: 'ready', error_message: null })

    console.info('[ingestion] ready', {
      documentId,
      pages: pages.length,
      chunks: chunks.length,
      embeddingTokens,
      staleVectors,
      ms: Date.now() - startedAt,
    })
    return { status: 'ready' }
  } catch (error: any) {
    const userMessage =
      error instanceof IngestionError ? error.message : 'Processing failed. Please try again.'

    // Log the real cause, never the document's contents
    console.error('[ingestion] failed', { documentId, ms: Date.now() - startedAt, error: error?.message })

    const { error: failError } = await supabase
      .from('documents')
      .update({ status: 'failed', error_message: userMessage })
      .eq('id', documentId)
    if (failError) {
      console.error('[ingestion] could not mark document failed', { documentId, error: failError.message })
    }

    return { status: 'failed', error: userMessage }
  }
}
