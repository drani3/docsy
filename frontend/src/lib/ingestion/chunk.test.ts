import { describe, expect, it } from 'vitest'
import { CHUNK_OVERLAP, CHUNK_SIZE, chunkPages, splitText } from './chunk'

const sentence = (i: number) => `Sentence number ${i} talks about quarterly revenue and growth.`
const longText = Array.from({ length: 200 }, (_, i) => sentence(i)).join(' ')

describe('splitText', () => {
  it('keeps short text as one chunk', () => {
    expect(splitText('  Hello world.  ')).toEqual(['Hello world.'])
  })

  it('returns nothing for empty text', () => {
    expect(splitText('')).toEqual([])
  })

  it('never exceeds the chunk size', () => {
    for (const chunk of splitText(longText)) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })

  it('covers all the text, with overlap between neighbours', () => {
    const chunks = splitText(longText)
    expect(chunks.length).toBeGreaterThan(1)
    // Every sentence appears in some chunk
    for (let i = 0; i < 200; i++) {
      expect(chunks.some(c => c.includes(sentence(i)))).toBe(true)
    }
    // Consecutive chunks share text
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1].slice(-CHUNK_OVERLAP / 2)
      expect(chunks[i].includes(tail.slice(tail.indexOf(' ') + 1, tail.indexOf(' ') + 20))).toBe(true)
    }
  })

  it('prefers paragraph breaks', () => {
    const para = 'a'.repeat(1000)
    const chunks = splitText(`${para}\n\n${para}`)
    expect(chunks[0]).toBe(para)
  })

  it('does not start chunks mid-word', () => {
    for (const chunk of splitText(longText).slice(1)) {
      expect(longText.includes(` ${chunk.split(' ')[0]} `) || longText.startsWith(chunk.split(' ')[0])).toBe(true)
    }
  })

  it('terminates on text without separators', () => {
    const chunks = splitText('x'.repeat(5000))
    expect(chunks.join('').length).toBeGreaterThanOrEqual(5000)
  })
})

describe('chunkPages', () => {
  it('numbers chunks across pages and never spans pages', () => {
    const chunks = chunkPages([
      { pageNumber: 1, text: longText },
      { pageNumber: 2, text: '' },
      { pageNumber: 3, text: 'Short last page.' },
    ])
    expect(chunks.map(c => c.chunkIndex)).toEqual(chunks.map((_, i) => i))
    expect(chunks.at(-1)).toEqual({ chunkIndex: chunks.length - 1, pageNumber: 3, content: 'Short last page.' })
    expect(chunks.some(c => c.pageNumber === 2)).toBe(false)
  })
})
