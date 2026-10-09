import 'server-only'
import { fetchJson, requireEnv } from '@/lib/ai/http'

// Pinecone REST data plane. Isolation model:
//  * every user gets their own namespace, so a query can only ever see that user's vectors
//  * every query is additionally filtered by document_id
//  * vector ids are `${documentId}#${chunkIndex}`: re-ingesting overwrites, and a
//    document's vectors can be listed by prefix for deletion
const API_VERSION = '2025-04'
const UPSERT_BATCH_SIZE = 100
const DELETE_BATCH_SIZE = 1000

export interface VectorMetadata {
  user_id: string
  document_id: string
  chunk_id: string
  chunk_index: number
  page_number: number
}

export interface VectorMatch {
  id: string
  score: number
  metadata: VectorMetadata
}

export function namespaceForUser(userId: string) {
  return `user-${userId}`
}

export function vectorId(documentId: string, chunkIndex: number) {
  return `${documentId}#${chunkIndex}`
}

export function isPineconeConfigured() {
  return Boolean(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME)
}

function headers() {
  return {
    'Api-Key': requireEnv('PINECONE_API_KEY'),
    'X-Pinecone-API-Version': API_VERSION,
    'Content-Type': 'application/json',
  }
}

let cachedHost: string | null = process.env.PINECONE_INDEX_HOST || null

async function indexHost(): Promise<string> {
  if (cachedHost) return cachedHost
  const index = await fetchJson<{ host: string }>(
    `https://api.pinecone.io/indexes/${encodeURIComponent(requireEnv('PINECONE_INDEX_NAME'))}`,
    { headers: headers() },
    { timeoutMs: 10_000 }
  )
  cachedHost = `https://${index.host}`
  return cachedHost
}

export async function upsertVectors(
  namespace: string,
  vectors: { id: string; values: number[]; metadata: VectorMetadata }[]
) {
  const host = await indexHost()
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    await fetchJson(
      `${host}/vectors/upsert`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ namespace, vectors: vectors.slice(i, i + UPSERT_BATCH_SIZE) }),
      },
      { timeoutMs: 30_000 }
    )
  }
}

export async function queryVectors(params: {
  namespace: string
  vector: number[]
  topK: number
  documentId: string
}): Promise<VectorMatch[]> {
  const host = await indexHost()
  const result = await fetchJson<{ matches?: VectorMatch[] }>(
    `${host}/query`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        namespace: params.namespace,
        vector: params.vector,
        topK: params.topK,
        filter: { document_id: { $eq: params.documentId } },
        includeMetadata: true,
        includeValues: false,
      }),
    },
    { timeoutMs: 15_000 }
  )
  return result.matches ?? []
}

async function listIdsByPrefix(namespace: string, prefix: string): Promise<string[]> {
  const host = await indexHost()
  const ids: string[] = []
  let token: string | undefined

  do {
    const params = new URLSearchParams({ namespace, prefix, limit: '100' })
    if (token) params.set('paginationToken', token)
    const page = await fetchJson<{ vectors?: { id: string }[]; pagination?: { next?: string } }>(
      `${host}/vectors/list?${params}`,
      { headers: headers() },
      { timeoutMs: 15_000 }
    )
    ids.push(...(page.vectors ?? []).map(v => v.id))
    token = page.pagination?.next
  } while (token)

  return ids
}

async function deleteIds(namespace: string, ids: string[]) {
  const host = await indexHost()
  for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    await fetchJson(
      `${host}/vectors/delete`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ namespace, ids: ids.slice(i, i + DELETE_BATCH_SIZE) }),
      },
      { timeoutMs: 15_000 }
    )
  }
}

// Removes vectors left over from an earlier run that produced more chunks
export async function deleteStaleVectors(namespace: string, documentId: string, chunkCount: number) {
  const ids = await listIdsByPrefix(namespace, `${documentId}#`)
  const stale = ids.filter(id => Number(id.slice(documentId.length + 1)) >= chunkCount)
  if (stale.length) await deleteIds(namespace, stale)
  return stale.length
}

export async function deleteDocumentVectors(namespace: string, documentId: string) {
  const ids = await listIdsByPrefix(namespace, `${documentId}#`)
  if (ids.length) await deleteIds(namespace, ids)
  return ids.length
}
