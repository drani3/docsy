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
Fill in `frontend/.env.local` (each variable is described in the example file).

3. Start development:
```bash
npm run dev
```

This will start:
- Frontend: http://localhost:3000
- Supabase functions: http://localhost:54321

## Scripts

Run from `frontend/` (or add `--workspace=frontend` from the root):

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm test` | Unit tests (Vitest): chunking, PDF parsing, citations, prompts, plans, Stripe webhook |
| `npm run typecheck` | TypeScript check |
| `npm run eval:retrieval -- <cases.json>` | Retrieval quality report for one document (see `scripts/eval-cases.example.json`) |

## Database

Apply `backend/supabase/migrations/*.sql` in order (001, 002, 003).

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for setting up Supabase, Google sign-in, R2, Pinecone,
OpenAI, Stripe and Vercel, plus monitoring and the end-to-end checklist.

## Development Phases

See [TODO.md](TODO.md) for the implementation phases and their status.
