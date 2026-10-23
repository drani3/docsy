import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.OPENAI_API_KEY = 'test-key'
const { chatStream } = await import('./openai')

// A streaming response that delivers `body` in small, awkward pieces
function sseResponse(body: string, pieceSize = 7) {
  const encoder = new TextEncoder()
  let offset = 0
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset >= body.length) return controller.close()
        controller.enqueue(encoder.encode(body.slice(offset, offset + pieceSize)))
        offset += pieceSize
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )
}

const sse = (chunks: object[]) => chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
const delta = (content: string, finish: string | null = null) => ({ choices: [{ delta: { content }, finish_reason: finish }] })

async function collect(stream: AsyncGenerator<string>) {
  let text = ''
  for await (const piece of stream) text += piece
  return text
}

describe('chatStream', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reassembles text split across network chunks and reports usage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(sse([delta('Revenue grew '), delta('12% [1].', 'stop'), { choices: [], usage: { total_tokens: 42 } }]))))
    let info: unknown
    const text = await collect(chatStream({ messages: [], maxTokens: 10, onDone: i => (info = i) }))
    expect(text).toBe('Revenue grew 12% [1].')
    expect(info).toEqual({ tokens: 42, finishReason: 'stop' })
  })

  it('reports a cut-off answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(sse([delta('Partial', 'length')]))))
    let info: any
    await collect(chatStream({ messages: [], maxTokens: 1, onDone: i => (info = i) }))
    expect(info.finishReason).toBe('length')
  })

  it('throws on a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(sse([{ choices: [{ delta: { refusal: 'No.' }, finish_reason: null }] }]))))
    await expect(collect(chatStream({ messages: [], maxTokens: 10 }))).rejects.toThrow(/refused/)
  })

  it('surfaces API errors without retrying client errors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key' } }), { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(collect(chatStream({ messages: [], maxTokens: 10 }))).rejects.toThrow(/401 Incorrect API key/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a rate-limited request before streaming starts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '0.01' } }))
      .mockResolvedValueOnce(sseResponse(sse([delta('ok', 'stop')])))
    vi.stubGlobal('fetch', fetchMock)
    expect(await collect(chatStream({ messages: [], maxTokens: 10 }))).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops when aborted', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      // A stream that never ends unless aborted
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(delta('Hello'))}\n\n`))
            init.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
          },
        }),
        { status: 200 }
      )
    }))
    const controller = new AbortController()
    let text = ''
    await expect(
      (async () => {
        for await (const piece of chatStream({ messages: [], maxTokens: 10, signal: controller.signal })) {
          text += piece
          controller.abort()
        }
      })()
    ).rejects.toThrow()
    expect(text).toBe('Hello')
  })
})
