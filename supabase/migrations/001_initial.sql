-- Run once in the Supabase SQL Editor. Entire migration is transactional.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(btrim(username)) between 2 and 24),
  created_at timestamptz not null default now()
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  cipher text not null check (cipher in ('caesar', 'atbash')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  submission_id uuid unique,
  submitted_ciphertext text,
  check (sender_id <> recipient_id)
);
create index challenges_sender_created on public.challenges(sender_id, created_at desc);

create table public.broadcasts (
  id uuid primary key,
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  original text not null check (char_length(original) between 1 and 280),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index broadcasts_created on public.broadcasts(created_at desc);

create table public.inbox_messages (
  id uuid primary key,
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) between 1 and 600),
  engine text not null check (engine in ('groq', 'fallback')),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index inbox_recipient_created on public.inbox_messages(recipient_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.broadcasts enable row level security;
alter table public.inbox_messages enable row level security;

revoke all on public.profiles, public.challenges, public.broadcasts, public.inbox_messages from public, anon, authenticated;
grant select on public.profiles, public.broadcasts, public.inbox_messages to authenticated;
grant insert (id, username), update (username) on public.profiles to authenticated;
grant all on public.profiles, public.challenges, public.broadcasts, public.inbox_messages to service_role;

create policy profiles_read on public.profiles for select to authenticated using ((select auth.uid()) is not null);
create policy profiles_insert_self on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_self on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy broadcasts_exclude_recipient on public.broadcasts for select to authenticated
  using ((select auth.uid()) is not null and recipient_id <> (select auth.uid()));
create policy inbox_recipient_only on public.inbox_messages for select to authenticated
  using (recipient_id = (select auth.uid()));
-- No client policies/grants for challenges or message writes.

create function public.issue_challenge(p_sender_id uuid, p_recipient_id uuid, p_cipher text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_challenge public.challenges;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_sender_id::text, 0));
  if not exists(select 1 from public.profiles where id = p_sender_id) then
    raise exception 'PROFILE_REQUIRED';
  end if;
  if p_sender_id = p_recipient_id or not exists(select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'INVALID_RECIPIENT';
  end if;
  if exists(select 1 from public.challenges where sender_id = p_sender_id and created_at > now() - interval '3 seconds') then
    raise exception 'TOO_FAST';
  end if;
  insert into public.challenges(sender_id, recipient_id, cipher)
    values (p_sender_id, p_recipient_id, p_cipher) returning * into v_challenge;
  return jsonb_build_object('id', v_challenge.id, 'expires_at', v_challenge.expires_at);
end;
$$;

create function public.deliver_message(
  p_sender_id uuid, p_challenge_id uuid, p_submission_id uuid,
  p_ciphertext text, p_original text, p_inbox_ciphertext text, p_engine text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_challenge public.challenges;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_sender_id::text, 0));
  select * into v_challenge from public.challenges
    where id = p_challenge_id and sender_id = p_sender_id for update;
  if not found then raise exception 'CHALLENGE_INVALID'; end if;
  if v_challenge.used_at is not null then
    if v_challenge.submission_id = p_submission_id and v_challenge.submitted_ciphertext = p_ciphertext then
      return jsonb_build_object('duplicate', true);
    end if;
    raise exception 'CHALLENGE_INVALID';
  end if;
  if v_challenge.expires_at <= now() then raise exception 'CHALLENGE_INVALID'; end if;
  if p_submission_id is null or p_ciphertext is null or char_length(p_ciphertext) not between 1 and 280 then
    raise exception 'SUBMISSION_CONFLICT';
  end if;
  if exists(select 1 from public.challenges where submission_id = p_submission_id) then
    raise exception 'SUBMISSION_CONFLICT';
  end if;
  if exists(select 1 from public.broadcasts where sender_id = p_sender_id and created_at > now() - interval '3 seconds') then
    raise exception 'TOO_FAST';
  end if;

  insert into public.broadcasts(id, challenge_id, sender_id, recipient_id, original)
    values (p_submission_id, p_challenge_id, p_sender_id, v_challenge.recipient_id, p_original);
  insert into public.inbox_messages(id, challenge_id, sender_id, recipient_id, ciphertext, engine)
    values (p_submission_id, p_challenge_id, p_sender_id, v_challenge.recipient_id, p_inbox_ciphertext, p_engine);
  update public.challenges set used_at = now(), submission_id = p_submission_id, submitted_ciphertext = p_ciphertext
    where id = p_challenge_id;
  return jsonb_build_object('duplicate', false);
end;
$$;

revoke all on function public.issue_challenge(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.deliver_message(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.issue_challenge(uuid, uuid, text) to service_role;
grant execute on function public.deliver_message(uuid, uuid, uuid, text, text, text, text) to service_role;

-- Supabase provides this publication. Guard membership so existing projects are supported.
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'broadcasts') then
      alter publication supabase_realtime add table public.broadcasts;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inbox_messages') then
      alter publication supabase_realtime add table public.inbox_messages;
    end if;
  end if;
end;
$$;

commit;
