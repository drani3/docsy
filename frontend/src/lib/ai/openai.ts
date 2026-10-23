import 'server-only'
import { fetchJson, fetchStream, requireEnv } from './http'

const OPENAI_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

// Must match the Pinecone index dimension. text-embedding-3-small natively
// returns 1536 values; OpenAI shortens them to 1024 on request with little
// loss in retrieval quality.
export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1024

export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini'

// OpenAI allows up to 2048 inputs per request; 100 keeps requests small and retries cheap
const EMBEDDING_BATCH_SIZE = 100

function headers() {
  return {
    Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
    'Content-Type': 'application/json',
  }
}

interface EmbeddingResponse {
  data: { index: number; embedding: number[] }[]
  usage: { total_tokens: number }
}

export async function embedTexts(texts: string[]): Promise<{ embeddings: number[][]; tokens: number }> {
  const embeddings: number[][] = []
  let tokens = 0

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE)
    const response = await fetchJson<EmbeddingResponse>(
      `${OPENAI_URL}/embeddings`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch, dimensions: EMBEDDING_DIMENSIONS }),
      },
      { timeoutMs: 30_000 }
    )
    // Responses are not guaranteed to be in input order
    for (const item of [...response.data].sort((a, b) => a.index - b.index)) {
      embeddings.push(item.embedding)
    }
    tokens += response.usage.total_tokens
  }

  return { embeddings, tokens }
}

export async function embedQuery(text: string): Promise<{ embedding: number[]; tokens: number }> {
  const { embeddings, tokens } = await embedTexts([text])
  return { embedding: embeddings[0], tokens }
}

interface ChatResponse {
  choices: { message: { content: string | null; refusal?: string | null }; finish_reason: string }[]
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

// Chat completion constrained to a JSON schema (OpenAI structured outputs)
export async function chatJson<T>(params: {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
  maxTokens: number
}): Promise<{ data: T; tokens: number }> {
  const response = await fetchJson<ChatResponse>(
    `${OPENAI_URL}/chat/completions`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: params.schemaName, strict: true, schema: params.schema },
        },
        max_completion_tokens: params.maxTokens,
      }),
    },
    { timeoutMs: 45_000, maxAttempts: 2 }
  )

  const choice = response.choices[0]
  if (choice.message.refusal) {
    throw new Error(`Model refused: ${choice.message.refusal}`)
  }
  if (choice.finish_reason === 'length' || !choice.message.content) {
    throw new Error('Model response was cut off')
  }

  return { data: JSON.parse(choice.message.content) as T, tokens: response.usage.total_tokens }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatChunk {
  choices: { delta: { content?: string | null; refusal?: string | null }; finish_reason: string | null }[]
  usage?: { total_tokens: number } | null
}

// Streaming chat completion. Yields text as it arrives; `onDone` receives
// the token count and finish reason. Aborting `signal` stops generation.
export async function* chatStream(params: {
  messages: ChatMessage[]
  maxTokens: number
  signal?: AbortSignal
  onDone?: (info: { tokens: number; finishReason: string | null }) => void
}): AsyncGenerator<string> {
  const response = await fetchStream(
    `${OPENAI_URL}/chat/completions`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: params.messages,
        max_completion_tokens: params.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
    },
    { timeoutMs: 30_000, signal: params.signal }
  )

  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let tokens = 0
  let finishReason: string | null = null

  try {
    while (true) {
      const { value, done } = await readWithIdleTimeout(reader, STREAM_IDLE_TIMEOUT_MS)
      if (done) break
      buffer += value

      // Server-sent events: one `data: {...}` line per chunk
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue

        const chunk = JSON.parse(data) as ChatChunk
        if (chunk.usage) tokens = chunk.usage.total_tokens
        const choice = chunk.choices[0]
        if (!choice) continue
        if (choice.delta.refusal) throw new Error(`Model refused: ${choice.delta.refusal}`)
        if (choice.finish_reason) finishReason = choice.finish_reason
        if (choice.delta.content) yield choice.delta.content
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  params.onDone?.({ tokens, finishReason })
}

// Give up if the model goes quiet mid-answer
const STREAM_IDLE_TIMEOUT_MS = 30_000

async function readWithIdleTimeout<T>(reader: ReadableStreamDefaultReader<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms without data`)), ms)
  })
  try {
    return await Promise.race([reader.read(), timeout])
  } finally {
    clearTimeout(timer)
  }
}
