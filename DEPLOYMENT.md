# Deployment

How to run Docsy in production (TODO Phase 22) and check it end to end (Phase 23).
Set up each service twice: once for development (test keys, local URLs) and
once for production.

## 1. Supabase

1. Create a production project.
2. Run the migrations **in order** in the SQL editor (or `supabase db push`):
   `backend/supabase/migrations/001_initial_schema.sql`, `002_conversation_history.sql`,
   `003_billing_usage_security.sql`.
3. **Authentication → URL Configuration**
   - Site URL: `https://your-domain.com`
   - Redirect URLs: `https://your-domain.com/**` (and `http://localhost:3000/**` in the dev project).
     The wildcard is needed: sign-in returns to `/auth/callback?next=...`.
4. Copy the URL, anon key and **service role key** (Project settings → API).

### Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
2. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Providers → Google: paste the client ID and secret, enable.
4. Set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`. Until then the login page offers email only.

## 2. Cloudflare R2

1. Create a bucket and an API token with Object Read & Write on it.
2. **CORS policy** on the bucket. The browser uploads straight to R2 with a presigned URL, so
   your site's origin must be allowed:
   ```json
   [{ "AllowedOrigins": ["https://your-domain.com"], "AllowedMethods": ["PUT", "GET"],
      "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
   ```
   Keep the bucket private (no public access); downloads use short-lived signed URLs.

## 3. Pinecone

One **serverless** index, **1024 dimensions**, **cosine** metric. The app makes its own
embeddings (OpenAI `text-embedding-3-small` shortened to 1024), so a built-in embedding
model on the index is ignored. Each user gets their own namespace automatically.

Changing the dimension means a new index and re-processing every document.

## 4. OpenAI

An API key on an account with billing enabled. Optional: `OPENAI_CHAT_MODEL` (default `gpt-4.1-mini`).

## 5. Stripe

1. **Product** "Docsy Pro" with a monthly **price** (optionally a yearly one). Copy the price ids.
2. **Customer portal** (Settings → Billing → Customer portal): enable cancelling and
   updating payment methods. Cancellation should be "at end of billing period".
3. **Webhook endpoint**: `https://your-domain.com/api/stripe/webhook` with these events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`,
   `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Recommended: Settings → Billing → Subscriptions → retry failed payments ("Smart Retries"),
   then mark the subscription **unpaid** or cancel it. Docsy keeps Pro for 7 days after a
   failed renewal (`GRACE_PERIOD_DAYS`).

### Local testing with the Stripe CLI

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook   # prints a whsec_... secret for .env.local
stripe trigger checkout.session.completed
```

Test cards: `4242 4242 4242 4242` (succeeds), `4000 0000 0000 0341` (attaches, then fails on renewal).
To test renewals and failed payments, create the customer on a Stripe **test clock** and advance it past the period end.

## 6. Vercel

1. Import the repository. **Root Directory: `frontend`** (Vercel detects the npm workspace and
   installs from the repo root). Framework preset: Next.js.
2. Environment variables: everything in `frontend/.env.local.example`, with production values.
   `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`,
   `PINECONE_API_KEY` and `R2_SECRET_ACCESS_KEY` must **not** have a `NEXT_PUBLIC_` prefix.
3. Add the custom domain; Vercel provisions HTTPS. HSTS is sent in production.
4. Function duration: chat and ingestion set `maxDuration = 60`. The Hobby plan allows that;
   very large PDFs may need Pro for longer limits.

## 7. Monitoring

- Uptime: point a monitor at `GET /api/health` (200 = up, 503 = database unreachable).
- Alerts: with `Authorization: Bearer $HEALTH_CHECK_TOKEN` the same endpoint returns which
  services are configured, documents **stuck** in processing for 10+ minutes, and **failed**
  ingestions in the last 24 hours.
- Logs are one JSON object per line with a `request_id` (also returned as the `x-request-id`
  header). Useful events: `ingestion.failed`, `chat.failed`, `stripe.webhook.failed`,
  `stripe.payment_failed`, `rate_limit.exceeded`. `chat.answered` and `ingestion.ready`
  carry latency fields (`retrieval_ms`, `first_token_ms`, `llm_ms`, `extract_ms`, `embed_ms`).
- Stripe Dashboard → Webhooks shows failed deliveries; the endpoint returns 500 on errors so
  Stripe retries.

## 8. End-to-end check (Phase 23)

Run through this on production after every deploy that touches auth, billing or ingestion.

1. Sign in with Google → lands on the dashboard; sign out and back in.
2. Upload a PDF → status goes uploading → processing → embedding → ready.
3. Open it, ask a question → the answer streams in with page citations; a citation opens the PDF at that page.
4. Ask a follow-up ("and the year before?") → it uses the conversation's context.
5. Reload → the conversation is in the list with an automatic title; history is intact.
6. As a Free user, hit a limit (6th document, or set a low limit temporarily) → upgrade prompt.
7. Upgrade with a test card → after the webhook, Settings shows Pro and the new limits.
8. Customer portal → cancel → Settings shows "Pro until <date>".
9. A second account cannot open the first account's `/documents/<id>` or `/conversations/<id>` (404).
10. `GET /api/health` with the token reports every service configured and no stuck documents.
