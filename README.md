# Docsy - AI Document Assistant

A monorepo for an AI-powered document assistant that allows users to upload PDFs and ask questions using RAG (Retrieval-Augmented Generation).

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, TailwindCSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Storage**: Cloudflare R2
- **Vector Database**: Pinecone
- **LLM**: OpenAI GPT-4
- **Payments**: Stripe

## Project Structure

```
docsy/
├── frontend/          # Next.js application
│   ├── src/
│   │   ├── app/      # App router pages
│   │   ├── components/ # React components
│   │   └── lib/      # Utilities and clients
│   └── package.json
├── backend/           # Supabase Edge Functions
│   └── supabase/
│       ├── functions/ # Serverless functions
│       └── migrations/ # Database migrations
├── shared/           # Shared types and utilities
│   ├── types/
│   └── utils/
└── package.json      # Root workspace config
```

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase CLI
- Supabase project

### Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp frontend/.env.local.example frontend/.env.local
```
Edit `frontend/.env.local` with your Supabase credentials.

3. Start development:
```bash
npm run dev
```

This will start:
- Frontend: http://localhost:3000
- Supabase functions: http://localhost:54321

## Development Phases

See TODO.txt for detailed implementation phases:
1. Project setup ✓
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
18. Testing
19. Observability
20. Production deployment
