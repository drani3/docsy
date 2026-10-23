import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { IngestionError, MAX_PAGES, extractPdfPages, looksLikePdf } from './pdf'

// Builds a PDF where each entry is one page's text ('' = a blank page)
async function makePdf(pages: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const text of pages) {
    const page = pdf.addPage([612, 792])
    text.split('\n').forEach((line, i) => page.drawText(line, { x: 50, y: 740 - i * 16, size: 12, font }))
  }
  return pdf.save()
}

const paragraph = 'The company reported revenue growth of twelve percent in the third quarter.'

describe('extractPdfPages', () => {
  it('extracts text per page with 1-based page numbers', async () => {
    const pages = await extractPdfPages(await makePdf([paragraph, `Second page.\n${paragraph}`]))
    expect(pages).toHaveLength(2)
    expect(pages[0]).toMatchObject({ pageNumber: 1 })
    expect(pages[0].text).toContain('twelve percent')
    expect(pages[1].text).toContain('Second page.')
  })

  it('handles a one-page PDF', async () => {
    expect(await extractPdfPages(await makePdf([paragraph]))).toHaveLength(1)
  })

  it('keeps blank pages so page numbers stay right', async () => {
    const pages = await extractPdfPages(await makePdf([paragraph, '', paragraph]))
    expect(pages.map(p => p.pageNumber)).toEqual([1, 2, 3])
    expect(pages[1].text).toBe('')
  })

  it('rejects PDFs without a text layer as scanned', async () => {
    await expect(extractPdfPages(await makePdf(['', '', '']))).rejects.toThrow(/scanned/)
  })

  it('rejects non-PDF bytes', async () => {
    const html = new TextEncoder().encode('<html><body>not a pdf</body></html>')
    await expect(extractPdfPages(html)).rejects.toThrow(IngestionError)
    await expect(extractPdfPages(html)).rejects.toThrow(/not a PDF/)
  })

  it('rejects corrupted PDFs with a clear message', async () => {
    const corrupted = new TextEncoder().encode('%PDF-1.7\n' + 'garbage '.repeat(200))
    await expect(extractPdfPages(corrupted)).rejects.toThrow(IngestionError)
  })

  it(`rejects PDFs over ${MAX_PAGES} pages`, async () => {
    const big = await makePdf(Array.from({ length: MAX_PAGES + 1 }, () => 'Page text that is long enough.'))
    await expect(extractPdfPages(big)).rejects.toThrow(/at most/)
  }, 30_000)

  it('handles non-English text', async () => {
    // Standard fonts only cover Latin-1; accented text is enough to check decoding
    const pages = await extractPdfPages(await makePdf(['Le chiffre d’affaires a augmenté de douze pour cent.'.replace('’', "'")]))
    expect(pages[0].text).toContain('augmenté')
  })
})

describe('looksLikePdf', () => {
  it('checks the magic bytes', () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.4 ...'))).toBe(true)
    expect(looksLikePdf(new TextEncoder().encode('\n\n%PDF-1.4'))).toBe(true)
    expect(looksLikePdf(new TextEncoder().encode('PK\u0003\u0004 zip'))).toBe(false)
  })
})
