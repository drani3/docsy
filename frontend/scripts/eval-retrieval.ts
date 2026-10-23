// Retrieval quality check (TODO Phase 18).
//
// For each question in a cases file, runs the same retrieval the chat uses
// (embedding → Pinecone, filtered to one document) and checks whether the
// pages that actually answer it come back. Use it to tune TOP_K and
// MIN_SIMILARITY in src/lib/rag/answer.ts, and the chunk settings in
// src/lib/ingestion/chunk.ts (re-process the document after changing those).
//
//   npm run eval:retrieval --workspace=frontend -- scripts/eval-cases.example.json
//
// Cases file:
//   {
//     "user_id": "...", "document_id": "...",
//     "cases": [
//       { "question": "What was revenue in 2023?", "expected_pages": [12] },
//       { "question": "Who won the 1998 World Cup?", "expected_pages": [] }   ← not in the document
//     ]
//   }
// Calls OpenAI (embeddings only, a fraction of a cent per run) and Pinecone.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(path.resolve(__dirname, '..'))

interface Case {
  question: string
  expected_pages: number[]
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: npm run eval:retrieval -- <cases.json>')
    process.exit(1)
  }

  const { embedQuery } = await import('../src/lib/ai/openai')
  const { namespaceForUser, queryVectors } = await import('../src/lib/vector/pinecone')
  const { MIN_SIMILARITY, TOP_K } = await import('../src/lib/rag/answer')

  const config = JSON.parse(readFileSync(file, 'utf8')) as { user_id: string; document_id: string; cases: Case[] }
  const namespace = namespaceForUser(config.user_id)

  const ranks: (number | null)[] = []
  let falsePositives = 0
  let unanswerable = 0
  let belowThreshold = 0

  for (const c of config.cases) {
    const { embedding } = await embedQuery(c.question)
    const matches = await queryVectors({ namespace, vector: embedding, topK: TOP_K, documentId: config.document_id })
    const kept = matches.filter(m => m.score >= MIN_SIMILARITY)

    if (c.expected_pages.length === 0) {
      // Nothing should clear the threshold for a question the document can't answer
      unanswerable++
      if (kept.length > 0) falsePositives++
      console.log(`${kept.length ? '✗' : '✓'} [no answer] ${c.question}  → ${kept.length} passages kept (best ${fmt(matches[0]?.score)})`)
      continue
    }

    const rank = kept.findIndex(m => c.expected_pages.includes(m.metadata.page_number))
    const rankAny = matches.findIndex(m => c.expected_pages.includes(m.metadata.page_number))
    if (rank === -1 && rankAny !== -1) belowThreshold++
    ranks.push(rank === -1 ? null : rank + 1)

    const pages = kept.map(m => `p${m.metadata.page_number}(${fmt(m.score)})`).join(' ')
    console.log(`${rank === -1 ? '✗' : '✓'} ${c.question}\n    expected p${c.expected_pages.join(',p')} · got ${pages || 'nothing above threshold'}`)
  }

  const answerable = ranks.length
  const recallAt = (k: number) => ranks.filter(r => r !== null && r <= k).length / Math.max(answerable, 1)
  const mrr = ranks.reduce<number>((sum, r) => sum + (r ? 1 / r : 0), 0) / Math.max(answerable, 1)

  console.log(`\nTOP_K=${TOP_K} MIN_SIMILARITY=${MIN_SIMILARITY}`)
  console.log(`Answerable questions: ${answerable}`)
  console.log(`  recall@1 ${pct(recallAt(1))}  recall@3 ${pct(recallAt(3))}  recall@${TOP_K} ${pct(recallAt(TOP_K))}  MRR ${mrr.toFixed(2)}`)
  if (belowThreshold) console.log(`  ${belowThreshold} correct page(s) were retrieved but scored below MIN_SIMILARITY`)
  if (unanswerable) console.log(`Unanswerable questions: ${unanswerable}, wrongly matched: ${falsePositives}`)
}

const fmt = (n?: number) => (n === undefined ? '-' : n.toFixed(2))
const pct = (n: number) => `${Math.round(n * 100)}%`

main().catch(error => {
  console.error(error)
  process.exit(1)
})
