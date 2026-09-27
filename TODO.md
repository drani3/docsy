````md
# AI Document QA SaaS — Master TODO

## Tech Stack

- Frontend: Next.js + TypeScript + TailwindCSS
- Backend: Supabase Edge Functions
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth + Google OAuth
- File Storage: Cloudflare R2
- Vector Database: Pinecone Serverless
- Embeddings: OpenAI Embeddings
- LLM: OpenAI
- Billing: Stripe
- Hosting: Vercel

---

# Phase 1 — Project Setup ✓

- [x] Create monorepo
- [x] Create Next.js frontend
- [x] Configure TypeScript
- [x] Configure TailwindCSS
- [x] Create Supabase backend
- [x] Create Supabase Edge Functions structure
- [x] Create database migrations structure
- [x] Create shared types/utilities
- [x] Configure workspace
- [x] Configure ESLint/Prettier
- [x] Create `.env.example`
- [x] Configure development/staging/production environments
- [x] Set up Vercel project
- [x] Create GitHub repository

Suggested structure:

```text
/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── types/
│       └── ...
│
├── supabase/
│   ├── migrations/
│   └── functions/
│
├── packages/
│   └── shared/
│
├── .env.example
├── package.json
└── README.md
````

---

# Phase 2 — Database ✓

## Supabase Setup

* [x] Create Supabase project
* [x] Configure PostgreSQL
* [x] Configure local Supabase development
* [x] Create migration system
* [x] Generate TypeScript database types

## Tables

 profiles

```text
id
email
name
avatar_url
created_at
updated_at
```

* [x] Create table
* [x] Add foreign key to `auth.users`
* [x] Add indexes
* [x] Add RLS

 documents

```text
id
user_id
filename
storage_key
file_size
mime_type
status
page_count
created_at
updated_at
```

* [x] Create table
* [x] Add indexes
* [x] Add RLS
* [x] Add document status enum

Possible statuses:

```text
uploading
processing
embedding
ready
failed
```

 document_chunks

```text
id
document_id
chunk_index
page_number
content
metadata
created_at
```

* [x] Create table
* [x] Add indexes
* [x] Add foreign key
* [x] Add RLS

 conversations

```text
id
user_id
title
summary
created_at
updated_at
```

* [x] Create table
* [x] Add indexes
* [x] Add RLS

 messages

```text
id
conversation_id
role
content
created_at
```

* [x] Create table
* [x] Add indexes
* [x] Add RLS

Roles:

```text
user
assistant
system
```

 subscriptions

```text
id
user_id
stripe_customer_id
stripe_subscription_id
plan
status
current_period_start
current_period_end
created_at
updated_at
```

* [x] Create table
* [x] Add indexes
* [x] Add RLS

 usage

```text
id
user_id
period
questions
documents
embedding_tokens
llm_tokens
storage_bytes
created_at
updated_at
```

* [x] Create table
* [x] Add indexes
* [x] Add unique constraint on `(user_id, period)`

## Security

* [x] Enable RLS on every user-owned table
* [x] Users can only read their own documents
* [x] Users can only modify their own documents
* [x] Users can only access their own conversations
* [x] Users can only access their own messages
* [x] Users cannot modify subscription state
* [x] Users cannot modify usage counters
* [ ] Test RLS using two different users (requires migration applied)

---

# Phase 3 — Authentication

## Google OAuth

* [ ] Configure Supabase Auth (external setup required)
* [ ] Create Google Cloud OAuth application (external setup required)
* [ ] Configure OAuth client ID (external setup required)
* [ ] Configure redirect URLs (external setup required)
* [ ] Configure Supabase Google provider (external setup required)
* [x] Implement Google sign-in
* [x] Implement sign-out
* [x] Implement session persistence
* [ ] Handle OAuth errors
* [ ] Handle expired sessions

## Application Auth

* [x] Create authentication middleware
* [x] Protect `/dashboard`
* [x] Protect `/documents/*`
* [x] Protect `/conversations/*`
* [x] Protect `/settings`
* [x] Automatically create profile after signup (via database trigger)
* [ ] Test login/logout
* [ ] Test multiple accounts
* [ ] Verify users cannot access another user's resources

---

# Phase 4 — UI Foundation

## Routes

```text
/
├── Landing page
│
├── /login
│   └── Google login
│
├── /dashboard
│   └── User documents
│
├── /documents/[id]
│   └── Document + chat
│
├── /conversations/[id]
│   └── Conversation
│
└── /settings
    └── Account + billing
```

## UI

* [ ] Create application layout
* [ ] Create navbar
* [ ] Create sidebar
* [ ] Create user menu
* [ ] Create loading states
* [ ] Create error states
* [ ] Create empty states
* [ ] Create toast/notification system
* [ ] Create responsive layout
* [ ] Add dark/light theme if desired

---

# Phase 5 — Cloudflare R2 Storage

## Setup

* [ ] Create Cloudflare account
* [ ] Create R2 bucket
* [ ] Configure R2 credentials
* [ ] Add environment variables

Required environment variables:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

## Storage

* [ ] Implement server-side upload URL generation
* [ ] Implement PDF upload
* [ ] Restrict uploads to PDF
* [ ] Add file-size limit
* [ ] Generate unique storage keys

Storage format:

```text
{user_id}/{document_id}/original.pdf
```

* [ ] Store R2 key in `documents`
* [ ] Implement signed download URLs
* [ ] Implement document deletion
* [ ] Delete R2 object when document is deleted
* [ ] Prevent users from accessing other users' objects
* [ ] Test upload
* [ ] Test download
* [ ] Test deletion

---

# Phase 6 — PDF Upload

## Frontend

* [ ] Create drag-and-drop uploader
* [ ] Add file picker
* [ ] Display filename
* [ ] Display file size
* [ ] Validate PDF
* [ ] Validate file size
* [ ] Show upload progress

## Upload Flow

```text
Select PDF
    ↓
Validate
    ↓
Create document record
    ↓
Get upload URL
    ↓
Upload to R2
    ↓
Start processing
```

* [ ] Create document DB record
* [ ] Upload PDF to R2
* [ ] Trigger ingestion
* [ ] Display processing status

Status UI:

```text
Uploading
    ↓
Processing
    ↓
Embedding
    ↓
Ready
```

* [ ] Handle failed processing
* [ ] Allow retry
* [ ] Display status in dashboard

---

# Phase 7 — PDF Ingestion Pipeline

Pipeline:

```text
PDF
 ↓
R2
 ↓
Download
 ↓
Extract text
 ↓
Split into pages
 ↓
Chunk text
 ↓
Generate embeddings
 ↓
Pinecone
 ↓
Save metadata
 ↓
Document = Ready
```

## PDF Processing

* [ ] Choose PDF parser
* [ ] Implement PDF text extraction
* [ ] Preserve page numbers
* [ ] Handle multi-page PDFs
* [ ] Detect empty PDFs
* [ ] Detect scanned PDFs
* [ ] Decide OCR strategy

## Chunking

* [ ] Implement chunking
* [ ] Define chunk size
* [ ] Define chunk overlap
* [ ] Preserve page metadata
* [ ] Store chunks in Postgres

Each chunk should contain:

```json
{
  "document_id": "...",
  "chunk_index": 42,
  "page_number": 12,
  "content": "...",
  "metadata": {}
}
```

## Embeddings

* [ ] Generate OpenAI embeddings
* [ ] Batch embedding requests
* [ ] Handle API errors
* [ ] Handle rate limits
* [ ] Handle partial failures
* [ ] Make ingestion idempotent

## Status Handling

```text
uploading
    ↓
processing
    ↓
embedding
    ↓
ready
```

Failure:

```text
processing
    ↓
failed
```

* [ ] Log ingestion errors
* [ ] Allow retry

---

# Phase 8 — Pinecone

## Setup

* [ ] Create Pinecone account
* [ ] Create serverless index
* [ ] Select correct embedding model/dimension
* [ ] Configure namespace strategy
* [ ] Configure API credentials

## Vector Metadata

Each vector should contain metadata similar to:

```json
{
  "user_id": "...",
  "document_id": "...",
  "chunk_id": "...",
  "page_number": 14
}
```

## Operations

* [ ] Implement vector upsert
* [ ] Implement similarity search
* [ ] Implement metadata filtering
* [ ] Implement document deletion
* [ ] Implement namespace/document isolation
* [ ] Test retrieval quality
* [ ] Ensure user A cannot retrieve user B's vectors

---

# Phase 9 — Basic RAG

Create endpoint:

```text
POST /api/chat
```

Request:

```json
{
  "conversation_id": "...",
  "document_id": "...",
  "question": "What was the company's revenue?"
}
```

Pipeline:

```text
Question
    ↓
Authenticate
    ↓
Authorize document
    ↓
Check subscription
    ↓
Check usage
    ↓
Create question embedding
    ↓
Pinecone similarity search
    ↓
Retrieve top K chunks
    ↓
Build prompt
    ↓
OpenAI
    ↓
Answer
```

Implement:

* [ ] Question validation
* [ ] Authentication
* [ ] Document ownership check
* [ ] Subscription check
* [ ] Usage check
* [ ] Query embedding
* [ ] Pinecone retrieval
* [ ] Top-K retrieval
* [ ] Similarity threshold
* [ ] Context construction
* [ ] OpenAI request
* [ ] Answer generation
* [ ] Error handling
* [ ] Timeout handling

---

# Phase 10 — Citations

The model should return citations.

Example:

```json
{
  "answer": "Revenue increased by 12%...",
  "citations": [
    {
      "document_id": "...",
      "page": 27,
      "chunk_id": "..."
    }
  ]
}
```

Implement:

* [ ] Store page number in every chunk
* [ ] Include page metadata during retrieval
* [ ] Return citations from backend
* [ ] Display citations in UI
* [ ] Make citations clickable
* [ ] Display page number
* [ ] Optionally display source excerpt
* [ ] Prevent fabricated citations
* [ ] Instruct model to say it cannot find the answer when evidence is insufficient

---

# Phase 11 — Conversation History

Database:

```text
conversations
messages
summary
```

Implement:

* [ ] Create conversation
* [ ] Rename conversation
* [ ] Delete conversation
* [ ] Save user messages
* [ ] Save assistant messages
* [ ] Load conversation
* [ ] Display message history
* [ ] Conversation sidebar
* [ ] Automatic conversation titles
* [ ] Conversation timestamps

## Context Management

```text
                  Conversation
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
       Summary    Recent messages  RAG chunks
          │            │            │
          └────────────┼────────────┘
                       ↓
                      LLM
```

Implement:

* [ ] Store conversation summary
* [ ] Summarize old messages
* [ ] Keep recent messages
* [ ] Include relevant prior conversation context
* [ ] Define context-window limits
* [ ] Prevent unlimited token usage
* [ ] Test 100+ message conversation
* [ ] Test conversation continuation

---

# Phase 12 — Chat UI

* [ ] Create chat interface
* [ ] Implement streaming responses
* [ ] User message bubble
* [ ] Assistant message bubble
* [ ] Markdown rendering
* [ ] Code block rendering
* [ ] Loading indicator
* [ ] Error handling
* [ ] Retry button
* [ ] Stop generation
* [ ] Citation UI
* [ ] Auto-scroll
* [ ] Message timestamps
* [ ] New conversation
* [ ] Conversation switching
* [ ] Rename conversation
* [ ] Delete conversation

---

# Phase 13 — Stripe Billing

## Products

Create:

```text
Free
Pro
```

Example limits:

```text
FREE
- 5 documents
- 100 questions/month

PRO
- 100 documents
- 5,000 questions/month
```

## Stripe Setup

* [ ] Create Stripe account
* [ ] Create products
* [ ] Create prices
* [ ] Configure monthly billing
* [ ] Configure yearly billing if desired
* [ ] Store Stripe price IDs in environment variables
* [ ] Create Stripe customer
* [ ] Implement Checkout Session
* [ ] Implement success URL
* [ ] Implement cancel URL
* [ ] Implement Customer Portal

---

# Phase 14 — Stripe Webhooks

Endpoint:

```text
POST /api/stripe/webhook
```

Implement:

* [ ] Verify Stripe webhook signature
* [ ] Never trust client-provided subscription status
* [ ] Handle `checkout.session.completed`
* [ ] Handle subscription creation
* [ ] Handle subscription update
* [ ] Handle subscription cancellation
* [ ] Handle payment success
* [ ] Handle payment failure
* [ ] Update `subscriptions`
* [ ] Update user plan
* [ ] Handle webhook retries
* [ ] Make webhook processing idempotent
* [ ] Store processed Stripe event IDs
* [ ] Test with Stripe CLI
* [ ] Test successful payment
* [ ] Test cancellation
* [ ] Test failed payment
* [ ] Test renewal

---

# Phase 15 — Free/Pro Authorization

Create a central entitlement service:

```typescript
checkEntitlement(userId, feature)
```

Examples:

```text
canUploadDocument()
canAskQuestion()
canCreateConversation()
canUseFeature()
```

Do NOT scatter:

```typescript
if (user.plan === "pro")
```

throughout the application.

Instead:

```text
Request
  ↓
Authentication
  ↓
Entitlement service
  ↓
Usage check
  ↓
Feature
```

Implement:

* [ ] Free limits
* [ ] Pro limits
* [ ] Monthly usage reset
* [ ] Document limit
* [ ] Question limit
* [ ] File-size limit
* [ ] Plan status checking
* [ ] Grace period handling
* [ ] Cancelled subscription handling
* [ ] Payment failure handling

---

# Phase 16 — Usage Tracking

Track:

```text
Questions
Documents
Embedding tokens
LLM tokens
Storage
```

Implement:

* [ ] Increment question count
* [ ] Increment document count
* [ ] Track embedding usage
* [ ] Track LLM usage
* [ ] Track monthly period
* [ ] Prevent race conditions
* [ ] Prevent users bypassing limits
* [ ] Create usage dashboard

Display:

```text
Questions
42 / 100

Documents
3 / 5
```

---

# Phase 17 — Security

Complete before public launch.

## Authentication

* [ ] Supabase RLS everywhere
* [ ] Validate every user ID server-side
* [ ] Never trust user-provided `user_id`
* [ ] Verify JWT

## API Keys

Never expose:

```text
OPENAI_API_KEY
PINECONE_API_KEY
STRIPE_SECRET_KEY
R2_SECRET_ACCESS_KEY
```

* [ ] Keep all secrets server-side
* [ ] Configure production secrets correctly

## File Security

* [ ] Validate uploaded files
* [ ] Restrict MIME types
* [ ] Limit file size
* [ ] Prevent path traversal
* [ ] Prevent malicious PDFs

## Data Isolation

* [ ] Prevent cross-user document access
* [ ] Prevent cross-user conversation access
* [ ] Prevent cross-user Pinecone retrieval
* [ ] Prevent cross-user R2 access

## API Security

* [ ] Rate-limit API endpoints
* [ ] Add abuse protection
* [ ] Verify Stripe webhook signatures
* [ ] Add request validation
* [ ] Add request logging
* [ ] Do not log sensitive document contents

## AI Security

* [ ] Protect against prompt injection
* [ ] Treat document content as untrusted input
* [ ] Prevent documents from overriding system instructions
* [ ] Prevent fabricated citations
* [ ] Restrict tool access if tools are later added

---

# Phase 18 — RAG Quality

## Initial Optimization

* [ ] Evaluate chunk size
* [ ] Evaluate chunk overlap
* [ ] Test top-K values
* [ ] Add similarity threshold
* [ ] Test metadata filtering
* [ ] Test multi-page answers
* [ ] Test questions requiring multiple chunks
* [ ] Test questions with no answer
* [ ] Test ambiguous questions
* [ ] Test follow-up questions
* [ ] Test tables
* [ ] Test headings
* [ ] Test long documents
* [ ] Test multiple documents
* [ ] Test hallucination resistance
* [ ] Add "not found" behavior
* [ ] Add source citations

## Later Improvements

Do NOT implement initially.

* [ ] Hybrid search
* [ ] Reranking
* [ ] Query rewriting
* [ ] Multi-query retrieval
* [ ] Parent-child chunks
* [ ] Semantic chunking

---

# Phase 19 — PDF Edge Cases

Test:

* [ ] Normal text PDF
* [ ] Large PDF
* [ ] 1-page PDF
* [ ] 500-page PDF
* [ ] PDF with tables
* [ ] PDF with images
* [ ] PDF with headers/footers
* [ ] PDF with columns
* [ ] Scanned PDF
* [ ] Password-protected PDF
* [ ] Corrupted PDF
* [ ] Empty PDF
* [ ] Non-English PDF

## Scanned PDFs

Decide whether OCR is supported.

```text
Scanned PDF
     ↓
    OCR?
```

If yes:

* [ ] Add OCR pipeline
* [ ] Extract text from images
* [ ] Preserve page numbers
* [ ] Embed OCR text

---

# Phase 20 — Observability

Add:

* [ ] Structured logging
* [ ] Request IDs
* [ ] User IDs in internal logs
* [ ] Document ingestion logs
* [ ] RAG latency tracking
* [ ] OpenAI latency tracking
* [ ] Pinecone latency tracking
* [ ] Error tracking
* [ ] Failed ingestion monitoring
* [ ] Stripe webhook monitoring
* [ ] API usage monitoring

Track document pipeline:

```text
upload
  ↓
processing
  ↓
embedding
  ↓
ready
```

Track question pipeline:

```text
question
  ↓
retrieval
  ↓
LLM
  ↓
response
```

---

# Phase 21 — Testing

## Unit Tests

* [ ] Chunking
* [ ] PDF metadata extraction
* [ ] Usage limits
* [ ] Subscription checks
* [ ] Entitlements
* [ ] Prompt construction
* [ ] Citation parsing

## Integration Tests

* [ ] Google authentication
* [ ] PDF upload
* [ ] R2 storage
* [ ] PDF ingestion
* [ ] Pinecone retrieval
* [ ] RAG question
* [ ] Conversation history
* [ ] Stripe checkout
* [ ] Stripe webhook

## Security Tests

* [ ] User A accessing User B document
* [ ] User A accessing User B conversation
* [ ] User A querying User B Pinecone vectors
* [ ] Free user bypassing limits
* [ ] Forged Stripe webhook
* [ ] Invalid JWT
* [ ] Malicious PDF

---

# Phase 22 — Production Deployment

* [ ] Deploy Next.js to Vercel
* [ ] Deploy Supabase Edge Functions
* [ ] Configure production Supabase
* [ ] Configure production R2
* [ ] Configure production Pinecone
* [ ] Configure production Stripe
* [ ] Configure production Google OAuth
* [ ] Add production environment variables
* [ ] Configure custom domain
* [ ] Configure HTTPS
* [ ] Configure Stripe production webhook
* [ ] Configure OAuth production callback
* [ ] Test complete production flow

---

# Phase 23 — End-to-End User Journey

The complete flow should work like this:

```text
User visits website
       ↓
Google login
       ↓
Dashboard
       ↓
Upload PDF
       ↓
PDF → R2
       ↓
Processing
       ↓
Text extraction
       ↓
Chunking
       ↓
OpenAI embeddings
       ↓
Pinecone
       ↓
"Ready"
       ↓
Open document
       ↓
Ask question
       ↓
Pinecone retrieval
       ↓
Conversation context
       ↓
OpenAI
       ↓
Streaming answer
       ↓
Page citations
       ↓
Conversation saved
```

Billing flow:

```text
Free limit reached
       ↓
Show upgrade
       ↓
Stripe Checkout
       ↓
Payment
       ↓
Stripe webhook
       ↓
Postgres subscription updated
       ↓
Pro features unlocked
```

---

# Phase 24 — Things NOT to Build Initially

Do not over-engineer the MVP.

* [ ] ❌ Kubernetes
* [ ] ❌ Redis
* [ ] ❌ Kafka
* [ ] ❌ Microservices
* [ ] ❌ Celery
* [ ] ❌ Separate FastAPI backend
* [ ] ❌ Separate authentication service
* [ ] ❌ Elasticsearch
* [ ] ❌ Complicated agent framework
* [ ] ❌ Custom vector database
* [ ] ❌ LangChain everywhere
* [ ] ❌ Complex memory architecture
* [ ] ❌ Multi-region deployment

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
```

---

# Recommended Implementation Order

Build one milestone at a time.

```text
1. Project setup
2. Database
3. Authentication
4. UI foundation
5. R2 storage
6. PDF upload
7. PDF ingestion
8. Pinecone
9. Basic RAG
10. Citations
11. Conversation history
12. Chat UI
13. Stripe
14. Stripe webhooks
15. Usage limits
16. Security
17. RAG quality
18. PDF edge cases
19. Testing
20. Observability
21. Production deployment
```

## Development Rule

After completing **each milestone**:

1. Run the test suite.
2. Verify the feature manually.
3. Fix all errors.
4. Verify existing features still work.
5. Update the project documentation.
6. Commit the changes.
7. Only then move to the next milestone.

The coding agent should **not implement multiple unfinished phases simultaneously**.

---

# MVP Definition

The MVP is complete when a new user can:

```text
Google Login
     ↓
Upload PDF
     ↓
PDF gets processed
     ↓
Ask questions
     ↓
Receive RAG-based answers
     ↓
See page citations
     ↓
Continue the conversation
     ↓
Return later and see history
     ↓
Upgrade through Stripe
     ↓
Have Pro limits automatically activated
```

And the system guarantees:

```text
User isolation
+
Secure file storage
+
Secure API keys
+
Usage limits
+
Stripe webhook verification
+
Reliable document ingestion
+
Persistent conversation history
+
Source citations
```

```
```
