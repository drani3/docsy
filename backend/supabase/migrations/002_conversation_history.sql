-- =============================================================================
-- Docsy — conversation history (TODO Phase 11)
--
--  * Every conversation belongs to one document.
--  * Older messages are folded into conversations.summary; summary_message_count
--    says how many of the oldest messages (by created_at) the summary covers.
--  * Assistant messages keep their citations in messages.metadata.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------

-- No code created conversations before this migration, so the table is empty
-- and the column can be required.
alter table public.conversations
  add column document_id uuid not null references public.documents (id) on delete cascade,
  add column summary_message_count int not null default 0 check (summary_message_count >= 0);

create index conversations_document_id_updated_at_idx on public.conversations (document_id, updated_at desc);

-- A conversation may only be created on one of the user's own documents
drop policy "Users can insert own conversations" on public.conversations;

create policy "Users can insert own conversations"
  on public.conversations for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.documents d
      where d.id = conversations.document_id
        and d.user_id = (select auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------

-- Assistant turns: { found, citations: [...], stopped }. Server-written.
alter table public.messages
  add column metadata jsonb not null default '{}'::jsonb;

-- Each new message moves its conversation to the top of the list. Runs as
-- the owner because users may only update conversations.title directly.
create function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

revoke execute on function public.touch_conversation() from public, anon, authenticated;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();
