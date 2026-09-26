Absolutely — here is **only `ARCHITECTURE_BRIEF.md`**, ready to put in the repo.

# AI Document QA SaaS — Architecture Brief

## 1. Product

An AI-powered SaaS that allows users to:

1. Sign in with Google.
2. Upload PDF documents.
3. Store PDFs securely.
4. Process PDFs into chunks.
5. Generate embeddings.
6. Store embeddings in a vector database.
7. Ask natural-language questions about documents.
8. Retrieve relevant document context using RAG.
9. Generate answers with citations.
10. Continue conversations with persistent history.
11. Upgrade from Free to Pro using Stripe.

The initial architecture should prioritize **simplicity, security, and fast iteration**.

---

# 2. High-Level Architecture

```text
                         ┌─────────────────────┐
                         │      Browser        │
                         │   Next.js Frontend  │
                         └──────────┬──────────┘
                                    │
                         HTTPS / authenticated
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Supabase Auth     │
                         │    Google OAuth     │
                         └──────────┬──────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────┐
│                     Application Backend                       │
│                                                               │
│                 Supabase Edge Functions                       │
│                                                               │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
│  │ Document API│ │  Chat / RAG  │ │ Stripe Webhook         │ │
│  └──────┬──────┘ └──────┬───────┘ └───────────┬────────────┘ │
│         │               │                     │              │
└─────────┼───────────────┼─────────────────────┼──────────────┘
          │               │                     │
          ▼               ▼                     ▼
 ┌──────────────┐  ┌──────────────┐     ┌──────────────┐
 │ Cloudflare   │  │   Pinecone   │     │    Stripe    │
 │     R2       │  │ Vector Store │     │   Billing    │
 └──────────────┘  └──────┬───────┘     └──────────────┘
                           │
                           │ retrieved chunks
                           ▼
                    ┌──────────────┐
                    │    OpenAI    │
                    │ Embeddings + │
                    │     LLM      │
                    └──────────────┘

                         ┌──────────────┐
                         │  Supabase    │
                         │  PostgreSQL  │
                         └──────────────┘
```

---

# 3. Technology Stack

## Frontend

* Next.js
* TypeScript
* TailwindCSS

Responsibilities:

* Authentication UI
* Dashboard
* PDF upload
* Document status
* Chat UI
* Conversation history
* Citations
* Billing UI
* Usage display
* Settings

The frontend must never contain private API keys.

---

## Authentication

Use:

* Supabase Auth
* Google OAuth

Authentication flow:

```text
Browser
   ↓
Google OAuth
   ↓
Supabase Auth
   ↓
Authenticated session
   ↓
Next.js
   ↓
Supabase Edge Functions
```

Every backend request must authenticate the user.

---

# 4. Backend

Use **Supabase Edge Functions**.

Backend responsibilities:

* Authenticate requests
* Authorize resource ownership
* Generate signed R2 URLs
* Create/update documents
* Trigger ingestion
* Generate embeddings
* Query Pinecone
* Run RAG
* Call OpenAI
* Save conversations/messages
* Track usage
* Check entitlements
* Handle Stripe webhooks

Business logic should remain server-side.

Do not trust the frontend for:

* user IDs
* subscription plans
* usage counts
* document ownership
* Stripe status
* permissions

---

# 5. Database

Use **Supabase PostgreSQL**.

Core tables:

```text
profiles
documents
document_chunks
conversations
messages
subscriptions
usage
```

Relationships:

```text
profiles
   │
   ├── documents
   │      │
   │      └── document_chunks
   │
   ├── conversations
   │      │
   │      └── messages
   │
   ├── subscriptions
   │
   └── usage
```

All user-owned data must be protected using **Row Level Security (RLS)**.

Users must never be able to access another user's:

* documents
* chunks
* conversations
* messages
* usage
* subscription information

---

# 6. File Storage

Use **Cloudflare R2** for original PDFs.

Storage key:

```text
{user_id}/{document_id}/original.pdf
```

Postgres stores the storage key, not the PDF itself.

Flow:

```text
Browser
   ↓
Backend requests upload
   ↓
Signed upload URL
   ↓
Cloudflare R2
   ↓
Document record updated
```

Use signed URLs for downloads.

Never expose R2 credentials to the browser.

---

# 7. Document Processing Pipeline

```text
PDF Upload
    ↓
R2
    ↓
Download PDF
    ↓
Extract text
    ↓
Split by pages
    ↓
Chunk text
    ↓
Store chunks in PostgreSQL
    ↓
Generate OpenAI embeddings
    ↓
Upsert vectors into Pinecone
    ↓
Mark document READY
```

Document states:

```text
uploading
processing
embedding
ready
failed
```

Processing must be:

* retryable
* idempotent
* observable

A failed document should not leave inconsistent vectors or database state.

---

# 8. Vector Database

Use **Pinecone Serverless**.

Each vector represents a document chunk.

Vector metadata:

```json
{
  "user_id": "...",
  "document_id": "...",
  "chunk_id": "...",
  "page_number": 14
}
```

Retrieval:

```text
question
   ↓
OpenAI embedding
   ↓
Pinecone similarity search
   ↓
relevant chunks
   ↓
RAG context
```

Retrieval must always be scoped to the authenticated user's documents.

---

# 9. RAG Architecture

Chat request:

```text
POST /api/chat
```

Example:

```json
{
  "conversation_id": "...",
  "document_id": "...",
  "question": "What was the company's revenue?"
}
```

Pipeline:

```text
User question
      ↓
Authenticate
      ↓
Authorize document
      ↓
Check subscription
      ↓
Check usage
      ↓
Generate question embedding
      ↓
Pinecone search
      ↓
Top-K chunks
      ↓
Similarity filtering
      ↓
Conversation context
      ↓
Prompt construction
      ↓
OpenAI
      ↓
Answer + citations
      ↓
Save message
      ↓
Return response
```

The LLM should answer using retrieved evidence.

If sufficient evidence cannot be found, the system should explicitly indicate that the document does not provide enough information.

---

# 10. Citations

Every retrieved chunk should contain enough metadata to identify:

```text
document
page
chunk
```

Example response:

```json
{
  "answer": "Revenue increased by 12%.",
  "citations": [
    {
      "document_id": "...",
      "page": 27,
      "chunk_id": "..."
    }
  ]
}
```

The UI should allow the user to understand where the answer came from.

The model should not fabricate citations.

---

# 11. Conversation Architecture

Conversation data is stored in PostgreSQL.

```text
conversation
     │
     ├── summary
     │
     └── messages
            ├── user
            ├── assistant
            ├── user
            └── assistant
```

For each question:

```text
Conversation summary
        +
Recent messages
        +
Retrieved document chunks
        ↓
      OpenAI
```

Long conversations should not blindly send every historical message to the LLM.

Use:

* conversation summaries
* recent messages
* retrieved document context
* token limits

The database remains the source of truth for conversation history.

---

# 12. Billing

Use **Stripe**.

Initial plans:

```text
FREE
- 5 documents
- 100 questions/month

PRO
- 100 documents
- 5000 questions/month
```

Stripe is the billing source of truth.

Postgres stores application-level subscription state.

```text
Stripe
   ↓
Webhook
   ↓
Backend verification
   ↓
subscriptions table
   ↓
Entitlement checks
```

Never allow the frontend to directly decide whether a user is Pro.

---

# 13. Entitlements

Use a centralized entitlement layer.

Example:

```ts
checkEntitlement(userId, feature)
```

Possible checks:

```ts
canUploadDocument(userId)
canAskQuestion(userId)
canCreateConversation(userId)
canUseFeature(userId)
```

Avoid scattering:

```ts
if (user.plan === "pro") {
  // ...
}
```

throughout the codebase.

Instead:

```text
Request
  ↓
Authentication
  ↓
Authorization
  ↓
Entitlement
  ↓
Usage
  ↓
Feature
```

---

# 14. Usage Tracking

Track:

```text
questions
documents
embedding_tokens
llm_tokens
storage_bytes
```

Usage is tracked per billing period.

Example:

```text
Questions
42 / 100

Documents
3 / 5
```

Usage enforcement must happen server-side.

Protect against race conditions where multiple requests could bypass limits simultaneously.

---

# 15. Security Model

Security boundary:

```text
Browser
   ↓
Authenticated API
   ↓
Authorization
   ↓
Business logic
   ↓
External services
```

Never expose:

```text
OPENAI_API_KEY
PINECONE_API_KEY
R2_SECRET_ACCESS_KEY
STRIPE_SECRET_KEY
```

Security requirements:

* Supabase RLS
* JWT verification
* Resource ownership checks
* Signed R2 URLs
* Stripe webhook signature verification
* PDF validation
* File-size limits
* MIME validation
* Safe storage paths
* Rate limiting
* Prompt-injection defenses
* No sensitive document contents in logs
* Cross-user isolation

---

# 16. Observability

Track document processing:

```text
upload
  ↓
processing
  ↓
embedding
  ↓
ready
```

Track question processing:

```text
question
  ↓
retrieval
  ↓
LLM
  ↓
response
```

Measure:

* API latency
* PDF processing time
* Embedding latency
* Pinecone latency
* LLM latency
* Error rates
* Ingestion failures
* Webhook failures

Use request IDs for tracing.

---

# 17. Deployment

Production architecture:

```text
Next.js
   → Vercel

Supabase
   → Auth
   → PostgreSQL
   → Edge Functions

Cloudflare
   → R2

Pinecone
   → Vector search

OpenAI
   → Embeddings
   → LLM

Stripe
   → Billing
```

Environment variables must be configured separately for development and production.

---

# 18. Architectural Principles

1. Keep V1 simple.
2. Keep business logic server-side.
3. Treat Postgres as the application source of truth.
4. Treat Stripe as the billing source of truth.
5. Treat R2 as original-file storage.
6. Treat Pinecone as vector retrieval infrastructure.
7. Never trust client-provided authorization information.
8. Every resource access must be scoped to the authenticated user.
9. Ingestion must be retryable and idempotent.
10. RAG must provide evidence/citations.
11. Avoid premature infrastructure complexity.

---

# 19. Do Not Build Initially

Avoid:

* Kubernetes
* Redis
* Kafka
* Celery
* Microservices
* Separate FastAPI backend
* Elasticsearch
* Custom vector database
* Complex agent framework
* Multi-region architecture
* Complicated memory systems

Start with:

```text
Next.js
+
Supabase
+
Cloudflare R2
+
Pinecone
+
OpenAI
+
Stripe
+
Vercel
```
