-- =============================================================================
-- Docsy — initial schema
--
-- Covers TODO Phases 2–7 (chunk storage): profiles, documents, document_chunks,
-- conversations, messages, subscriptions, usage, RLS, and the signup trigger.
--
-- Access model:
--   * Browser / API routes use the user's session (role `authenticated`); RLS
--     limits every row to its owner.
--   * Server-only writes (ingestion, Stripe webhooks, usage counters) use the
--     service role, which bypasses RLS. Tables those jobs own have no
--     user-facing write policies on purpose.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.document_status as enum ('uploading', 'processing', 'embedding', 'ready', 'failed');
create type public.message_role as enum ('user', 'assistant', 'system');
create type public.subscription_plan as enum ('free', 'pro');


-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- profiles (1:1 with auth.users, created by trigger on signup)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- email mirrors auth.users and must not be editable by the user
revoke update on public.profiles from anon, authenticated;
grant update (name, avatar_url) on public.profiles to authenticated;


-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  filename    text not null check (char_length(filename) between 1 and 255),
  storage_key text not null unique,
  file_size   bigint not null check (file_size > 0),
  mime_type   text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  status      public.document_status not null default 'uploading',
  page_count  int check (page_count >= 0),
  -- Why ingestion failed (e.g. scanned PDF), shown to the user. Server-written only.
  error_message text check (char_length(error_message) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The R2 key is fully determined by owner + document id. This stops a user
  -- from inserting/updating a row that points at another user's object and
  -- then downloading or deleting it through the API.
  constraint documents_storage_key_format
    check (storage_key = user_id::text || '/' || id::text || '/original.pdf')
);

create index documents_user_id_created_at_idx on public.documents (user_id, created_at desc);
create index documents_status_idx on public.documents (status);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

alter table public.documents enable row level security;

create policy "Users can view own documents"
  on public.documents for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own documents"
  on public.documents for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'uploading');

create policy "Users can update own documents"
  on public.documents for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own documents"
  on public.documents for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Users may rename a document and the upload flow may move it out of
-- "uploading"; ownership, storage key and size are immutable.
revoke update on public.documents from anon, authenticated;
grant update (filename, status) on public.documents to authenticated;


-- -----------------------------------------------------------------------------
-- document_chunks (written by ingestion with the service role)
-- -----------------------------------------------------------------------------

create table public.document_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  chunk_index int not null check (chunk_index >= 0),
  page_number int check (page_number >= 1),
  content     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  -- Makes re-running ingestion idempotent (upsert on document_id, chunk_index)
  unique (document_id, chunk_index)
);

alter table public.document_chunks enable row level security;

create policy "Users can view chunks of own documents"
  on public.document_chunks for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
        and d.user_id = (select auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------

create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null default 'New conversation' check (char_length(title) between 1 and 200),
  summary    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_updated_at_idx on public.conversations (user_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

create policy "Users can view own conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own conversations"
  on public.conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own conversations"
  on public.conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Users rename conversations; the summary is maintained server-side.
revoke update on public.conversations from anon, authenticated;
grant update (title) on public.conversations to authenticated;


-- -----------------------------------------------------------------------------
-- messages (append-only for users; deleted with their conversation)
-- -----------------------------------------------------------------------------

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            public.message_role not null,
  content         text not null,
  created_at      timestamptz not null default now()
);

create index messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "Users can view messages in own conversations"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

-- Users can only write their own turns; assistant/system messages are
-- written by the server with the service role.
create policy "Users can insert user messages in own conversations"
  on public.messages for insert to authenticated
  with check (
    role = 'user'
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- subscriptions (written only by the Stripe webhook with the service role)
-- -----------------------------------------------------------------------------

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references public.profiles (id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  plan                   public.subscription_plan not null default 'free',
  status                 text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "Users can view own subscription"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: users cannot modify subscription state.


-- -----------------------------------------------------------------------------
-- usage (one row per user per monthly period; written server-side only)
-- -----------------------------------------------------------------------------

create table public.usage (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  period           date not null check (period = date_trunc('month', period)::date),
  questions        int    not null default 0 check (questions >= 0),
  documents        int    not null default 0 check (documents >= 0),
  embedding_tokens bigint not null default 0 check (embedding_tokens >= 0),
  llm_tokens       bigint not null default 0 check (llm_tokens >= 0),
  storage_bytes    bigint not null default 0 check (storage_bytes >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Also serves as the (user_id, period) lookup index
  unique (user_id, period)
);

create trigger usage_set_updated_at
  before update on public.usage
  for each row execute function public.set_updated_at();

alter table public.usage enable row level security;

create policy "Users can view own usage"
  on public.usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: users cannot modify usage counters.


-- -----------------------------------------------------------------------------
-- Signup: create a profile and a free subscription for every new auth user
-- -----------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    -- Google OAuth sends full_name/picture; email signup may send name/avatar_url
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, plan)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- Backfill: users who signed up before this schema existed
-- -----------------------------------------------------------------------------

insert into public.profiles (id, email, name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
on conflict (id) do nothing;

insert into public.subscriptions (user_id, plan)
select p.id, 'free' from public.profiles p
on conflict (user_id) do nothing;
