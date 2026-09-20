-- Opt-in revocable calendar feed. Store only a hash of its bearer token.
create extension if not exists pgcrypto with schema extensions;
create table public.commit_calendar_feeds (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.commit_calendar_feeds enable row level security;
revoke all on public.commit_calendar_feeds from anon, authenticated;
grant select on public.commit_calendar_feeds to authenticated;
create policy calendar_feed_owner_read on public.commit_calendar_feeds for select to authenticated
  using ((select auth.uid()) = owner_id);

create function public.set_commit_calendar_feed(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid());
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid feed token' using errcode = '22023'; end if;
  insert into public.commit_calendar_feeds(owner_id, token_hash)
    values (v_owner, encode(extensions.digest(p_token, 'sha256'), 'hex'))
    on conflict (owner_id) do update set token_hash = excluded.token_hash, created_at = now(), revoked_at = null;
end $$;
create function public.revoke_commit_calendar_feed()
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid());
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.commit_calendar_feeds set revoked_at = now() where owner_id = v_owner;
end $$;
revoke all on function public.set_commit_calendar_feed(text), public.revoke_commit_calendar_feed() from public, anon;
grant execute on function public.set_commit_calendar_feed(text), public.revoke_commit_calendar_feed() to authenticated;
