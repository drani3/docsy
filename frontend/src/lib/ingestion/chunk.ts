import type { PdfPage } from './pdf'

// Character-based sizes (~4 chars per token): ~400-token chunks with ~50 tokens
// of overlap. Revisit in Phase 18 (RAG quality).
export const CHUNK_SIZE = 1600
export const CHUNK_OVERLAP = 200

export interface Chunk {
  chunkIndex: number
  pageNumber: number
  content: string
}

// Chunks never span pages, so every chunk maps to exactly one page for citations.
export function chunkPages(pages: PdfPage[]): Chunk[] {
  const chunks: Chunk[] = []
  for (const page of pages) {
    for (const content of splitText(page.text)) {
      chunks.push({ chunkIndex: chunks.length, pageNumber: page.pageNumber, content })
    }
  }
  return chunks
}

// Prefer breaking at a paragraph, then a line, then a sentence, then a word.
const SEPARATORS = ['\n\n', '\n', '. ', ' ']

export function splitText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const parts: string[] = []
  let start = 0

  while (start < text.length) {
    let end = Math.min(start + size, text.length)

    if (end < text.length) {
      const window = text.slice(start, end)
      for (const sep of SEPARATORS) {
        const at = window.lastIndexOf(sep)
        // Only accept a break in the second half, so chunks don't get tiny
        if (at > size / 2) {
          end = start + at + sep.length
          break
        }
      }
    }

    const part = text.slice(start, end).trim()
    if (part) parts.push(part)

    if (end >= text.length) break
    // Step back for overlap, then forward to a word boundary so we don't start mid-word
    let next = Math.max(end - overlap, start + 1)
    const space = text.indexOf(' ', next)
    if (space !== -1 && space < end) next = space + 1
    start = next
  }

  return parts
}
