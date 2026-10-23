-- =============================================================================
-- Docsy — billing, usage limits, rate limiting (TODO Phases 13–17)
--
-- Limits are enforced inside the database so concurrent requests can't race
-- past them and nothing can bypass them with the public anon key:
--   * documents are created only through create_document(), which counts the
--     user's documents under a per-user lock
--   * questions are counted by consume_question(), a single conditional UPDATE
-- Every function here is for the server (service role) only.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- subscriptions: extra Stripe state
-- -----------------------------------------------------------------------------

alter table public.subscriptions
  add column price_id text,
  add column cancel_at_period_end boolean not null default false;


-- -----------------------------------------------------------------------------
-- stripe_events: webhook events already processed (idempotency)
-- -----------------------------------------------------------------------------

create table public.stripe_events (
  id         text primary key, -- Stripe event id (evt_...)
  type       text not null,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- No policies: service role only.


-- -----------------------------------------------------------------------------
-- documents: users can no longer create rows or change status directly
-- -----------------------------------------------------------------------------

-- Inserts go through create_document() so the plan's document limit applies
drop policy "Users can insert own documents" on public.documents;

-- Status moves only through the server (upload completion, ingestion).
-- Users may still rename.
revoke update on public.documents from anon, authenticated;
grant update (filename) on public.documents to authenticated;

create function public.create_document(
  p_id uuid,
  p_user_id uuid,
  p_filename text,
  p_storage_key text,
  p_file_size bigint,
  p_max_documents int
)
returns boolean -- false: the user already has p_max_documents documents
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialise uploads per user so two at once can't both pass the count
  perform pg_advisory_xact_lock(hashtextextended('create_document:' || p_user_id::text, 0));

  if (select count(*) from public.documents where user_id = p_user_id) >= p_max_documents then
    return false;
  end if;

  insert into public.documents (id, user_id, filename, storage_key, file_size, mime_type, status)
  values (p_id, p_user_id, p_filename, p_storage_key, p_file_size, 'application/pdf', 'uploading');

  perform public.record_usage(p_user_id, p_documents => 1, p_storage_bytes => p_file_size);
  return true;
end;
$$;


-- -----------------------------------------------------------------------------
-- usage: monthly counters (calendar month, UTC)
-- -----------------------------------------------------------------------------

create function public.current_usage_period()
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'utc')::date;
$$;

-- Adds to this month's counters (negative values undo, floored at zero)
create function public.record_usage(
  p_user_id uuid,
  p_questions int default 0,
  p_documents int default 0,
  p_embedding_tokens bigint default 0,
  p_llm_tokens bigint default 0,
  p_storage_bytes bigint default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usage (user_id, period, questions, documents, embedding_tokens, llm_tokens, storage_bytes)
  values (
    p_user_id,
    public.current_usage_period(),
    greatest(p_questions, 0),
    greatest(p_documents, 0),
    greatest(p_embedding_tokens, 0),
    greatest(p_llm_tokens, 0),
    greatest(p_storage_bytes, 0)
  )
  on conflict (user_id, period) do update set
    questions        = greatest(public.usage.questions + p_questions, 0),
    documents        = greatest(public.usage.documents + p_documents, 0),
    embedding_tokens = greatest(public.usage.embedding_tokens + p_embedding_tokens, 0),
    llm_tokens       = greatest(public.usage.llm_tokens + p_llm_tokens, 0),
    storage_bytes    = greatest(public.usage.storage_bytes + p_storage_bytes, 0);
end;
$$;

-- Counts one question if the user is under p_limit this month. The UPDATE's
-- row lock makes concurrent calls queue, so the limit can't be overshot.
create function public.consume_question(p_user_id uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := public.current_usage_period();
begin
  insert into public.usage (user_id, period)
  values (p_user_id, v_period)
  on conflict (user_id, period) do nothing;

  update public.usage
  set questions = questions + 1
  where user_id = p_user_id
    and period = v_period
    and questions < p_limit;

  return found;
end;
$$;


-- -----------------------------------------------------------------------------
-- rate_limits: fixed-window request counters
-- -----------------------------------------------------------------------------

create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
-- No policies: service role only.

-- Records a hit; returns false once `key` has more than p_max hits in the
-- current p_window_seconds window
create function public.hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Occasionally clear out old windows
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;


-- -----------------------------------------------------------------------------
-- Function access: server only
-- -----------------------------------------------------------------------------

revoke execute on function public.create_document(uuid, uuid, text, text, bigint, int) from public, anon, authenticated;
revoke execute on function public.record_usage(uuid, int, int, bigint, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.consume_question(uuid, int) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

grant execute on function public.create_document(uuid, uuid, text, text, bigint, int) to service_role;
grant execute on function public.record_usage(uuid, int, int, bigint, bigint, bigint) to service_role;
grant execute on function public.consume_question(uuid, int) to service_role;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
