-- Document status enum
create type document_status as enum ('uploading', 'processing', 'embedding', 'ready', 'failed');

-- Message role enum
create type message_role as enum ('user', 'assistant', 'system');

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Documents table
create table public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  filename text not null,
  storage_key text not null,
  file_size int not null,
  mime_type text,
  status document_status default 'uploading',
  page_count int,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add indexes
create index idx_documents_user_id on public.documents(user_id);
create index idx_documents_status on public.documents(status);

alter table public.documents enable row level security;

create policy "Users can view own documents" on public.documents
  for select using (auth.uid() = user_id);

create policy "Users can insert own documents" on public.documents
  for insert with check (auth.uid() = user_id);

create policy "Users can update own documents" on public.documents
  for update using (auth.uid() = user_id);

create policy "Users can delete own documents" on public.documents
  for delete using (auth.uid() = user_id);

-- Document chunks table
create table public.document_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references public.documents(id) not null,
  chunk_index int not null,
  page_number int,
  content text not null,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add indexes
create index idx_document_chunks_document_id on public.document_chunks(document_id);

alter table public.document_chunks enable row level security;

create policy "Users can view chunks from own documents" on public.document_chunks
  for select using (
    exists (
      select 1 from public.documents
      where documents.id = document_chunks.document_id
      and documents.user_id = auth.uid()
    )
  );

-- Conversations table
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  title text not null,
  summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add indexes
create index idx_conversations_user_id on public.conversations(user_id);

alter table public.conversations enable row level security;

create policy "Users can view own conversations" on public.conversations
  for select using (auth.uid() = user_id);

create policy "Users can insert own conversations" on public.conversations
  for insert with check (auth.uid() = user_id);

create policy "Users can update own conversations" on public.conversations
  for update using (auth.uid() = user_id);

create policy "Users can delete own conversations" on public.conversations
  for delete using (auth.uid() = user_id);

-- Messages table
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) not null,
  role message_role not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add indexes
create index idx_messages_conversation_id on public.messages(conversation_id);

alter table public.messages enable row level security;

create policy "Users can view messages in own conversations" on public.messages
  for select using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can insert messages in own conversations" on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

-- Subscriptions table
create table public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text,
  status text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add indexes
create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_stripe_customer_id on public.subscriptions(stripe_customer_id);

alter table public.subscriptions enable row level security;

create policy "Users can view own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Users cannot modify subscription state (no update policy)

-- Usage tracking table
create table public.usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  period date not null,
  questions int default 0,
  documents int default 0,
  embedding_tokens int default 0,
  llm_tokens int default 0,
  storage_bytes bigint default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, period)
);

-- Add indexes
create index idx_usage_user_id_period on public.usage(user_id, period);

alter table public.usage enable row level security;

create policy "Users can view own usage" on public.usage
  for select using (auth.uid() = user_id);

-- Users cannot modify usage counters (no update/insert policies)

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

-- Trigger to call function on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
