-- V2 source connections. Provider credentials are encrypted in Edge functions and
-- never readable through the authenticated client API.
create table public.commit_discovery_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','plaid')),
  external_id text not null,
  token_cipher text not null,
  token_nonce text not null,
  status text not null default 'active' check (status in ('active','needs_reconnect','expired','disconnected')),
  consented_at timestamptz not null default now(),
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  sync_cursor text,
  last_error text,
  created_at timestamptz not null default now(),
  unique(owner_id, provider, external_id)
);
create index commit_discovery_owner_idx on public.commit_discovery_connections(owner_id);
alter table public.commit_discovery_connections enable row level security;
revoke all on public.commit_discovery_connections from public, anon, authenticated;
-- Service-role only. Metadata is exposed by the function below, never tokens.
grant select, insert, update, delete on public.commit_discovery_connections to service_role;

create table public.commit_discovery_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.commit_discovery_oauth_states enable row level security;
revoke all on public.commit_discovery_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.commit_discovery_oauth_states to service_role;

create table public.commit_discovery_observations (
  connection_id uuid not null references public.commit_discovery_connections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  account_ref text not null,
  merchant text not null,
  observed_on date not null,
  amount_minor integer not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  pending boolean not null default false,
  primary key(connection_id, external_id)
);
create index commit_discovery_observation_group_idx on public.commit_discovery_observations(connection_id, merchant, currency, observed_on);
alter table public.commit_discovery_observations enable row level security;
revoke all on public.commit_discovery_observations from public, anon, authenticated;
grant select, insert, update, delete on public.commit_discovery_observations to service_role;

create function public.commit_discovery_status()
returns table(id uuid, provider text, source_label text, status text, consented_at timestamptz, consent_expires_at timestamptz,
  last_synced_at timestamptz, last_error text)
language sql security definer set search_path = '' as $$
  select c.id,c.provider,case when c.provider = 'gmail' then c.external_id else 'Bank connection ' || left(c.id::text, 8) end,
    c.status,c.consented_at,c.consent_expires_at,c.last_synced_at,c.last_error
  from public.commit_discovery_connections c where c.owner_id = (select auth.uid())
  order by c.created_at desc;
$$;
revoke all on function public.commit_discovery_status() from public, anon;
grant execute on function public.commit_discovery_status() to authenticated;

-- Account deletion must not strand provider grants or bank Items. Disconnect first.
create or replace function public.delete_my_commit_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid());
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if exists (select 1 from public.commit_discovery_connections where owner_id = v_owner
    and (status <> 'disconnected' or token_cipher <> '')) then
    raise exception 'Disconnect and revoke discovery sources before account deletion' using errcode = 'P0001'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'commit-evidence'
    and name like v_owner::text || '/%') then
    raise exception 'Delete private evidence through Storage before account deletion' using errcode = 'P0001'; end if;
  delete from auth.users where id = v_owner;
end $$;
