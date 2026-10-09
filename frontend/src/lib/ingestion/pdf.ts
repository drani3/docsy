import { extractText, getDocumentProxy } from 'unpdf'

// A failure we can explain to the user (stored in documents.error_message).
export class IngestionError extends Error {}

export interface PdfPage {
  pageNumber: number // 1-based
  text: string
}

// Pages with fewer characters than this are treated as having no text layer.
const MIN_CHARS_PER_TEXT_PAGE = 20
// If fewer than this share of pages have text, the PDF is most likely scanned.
const MIN_TEXT_PAGE_RATIO = 0.2

export async function extractPdfPages(data: Uint8Array): Promise<PdfPage[]> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    pdf = await getDocumentProxy(data)
  } catch (error: any) {
    if (error?.name === 'PasswordException') {
      throw new IngestionError('This PDF is password-protected. Remove the password and upload it again.')
    }
    throw new IngestionError('This file could not be read as a PDF. It may be corrupted.')
  }

  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false })

    if (totalPages === 0) {
      throw new IngestionError('This PDF has no pages.')
    }

    const pages = text.map((pageText, i) => ({ pageNumber: i + 1, text: normalizeText(pageText) }))
    const textPages = pages.filter(p => p.text.length >= MIN_CHARS_PER_TEXT_PAGE)

    if (textPages.length === 0 || textPages.length / totalPages < MIN_TEXT_PAGE_RATIO) {
      throw new IngestionError(
        'This PDF appears to be scanned (it has no selectable text). Scanned PDFs are not supported yet.'
      )
    }

    return pages
  } finally {
    await pdf.loadingTask.destroy()
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, '') // Postgres text can't store NUL
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
