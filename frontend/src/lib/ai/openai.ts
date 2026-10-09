import 'server-only'
import { fetchJson, requireEnv } from './http'

const OPENAI_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

// Must match the Pinecone index dimension
export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

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
