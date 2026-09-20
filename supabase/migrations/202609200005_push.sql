-- Device-scoped push consent and versioned delivery queue.
create table public.commit_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 20 and 2048),
  p256dh text not null check (length(p256dh) between 20 and 300),
  auth_key text not null check (length(auth_key) between 8 and 300),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index commit_push_owner_idx on public.commit_push_subscriptions(owner_id);
alter table public.commit_push_subscriptions enable row level security;
revoke all on public.commit_push_subscriptions from anon, authenticated;
grant select (id, created_at, revoked_at) on public.commit_push_subscriptions to authenticated;
create policy push_owner_read on public.commit_push_subscriptions for select to authenticated using ((select auth.uid()) = owner_id);

create table public.commit_push_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.commit_push_subscriptions(id) on delete cascade,
  commitment_id text not null,
  commitment_version integer not null,
  action_date date not null,
  scheduled_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','leased','accepted','failed','suppressed')),
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text,
  unique(subscription_id, commitment_id, commitment_version, action_date)
);
create index commit_push_due_idx on public.commit_push_jobs(status, scheduled_at);
alter table public.commit_push_jobs enable row level security;
revoke all on public.commit_push_jobs from anon, authenticated;
grant select on public.commit_push_jobs to authenticated;
create policy push_jobs_owner_read on public.commit_push_jobs for select to authenticated using ((select auth.uid()) = owner_id);

create function public.rebuild_commit_push(p_owner uuid, p_commitment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; s record; v_settings jsonb; v_date date; v_hour integer; v_zone text; v_at timestamptz;
begin
  select settings into v_settings from public.commit_profiles where owner_id = p_owner;
  update public.commit_push_jobs set status = 'suppressed', last_error = 'Record or consent changed'
    where owner_id = p_owner and status in ('queued','leased') and (p_commitment is null or commitment_id = p_commitment);
  if coalesce(v_settings ->> 'pushEnabled', 'false') <> 'true' or v_settings ->> 'pushConsentAt' is null then return; end if;
  v_hour := least(23, greatest(0, coalesce((v_settings ->> 'deliveryHour')::integer, 9)));
  if coalesce(v_settings ->> 'quietHours', 'true') = 'true' then v_hour := least(19, greatest(8, v_hour)); end if;
  v_zone := coalesce(nullif(v_settings ->> 'timezone', ''), 'UTC');
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then v_zone := 'UTC'; end if;
  for r in select id, version, body from public.commitments where owner_id = p_owner and (p_commitment is null or id = p_commitment) loop
    if r.body ->> 'intention' not in ('review','cancel') or r.body ->> 'cancellation' = 'confirmed'
      or r.body ->> 'lifecycle' in ('draft','canceled','expired') then continue; end if;
    if (r.body ->> 'reviewTargetDate') !~ '^\d{4}-\d{2}-\d{2}$' then continue; end if;
    v_date := (r.body ->> 'reviewTargetDate')::date;
    if v_date < current_date then continue; end if;
    v_at := (v_date::timestamp + make_interval(hours => v_hour)) at time zone v_zone;
    if v_at <= now() then continue; end if;
    for s in select id from public.commit_push_subscriptions where owner_id = p_owner and revoked_at is null loop
      insert into public.commit_push_jobs(owner_id, subscription_id, commitment_id, commitment_version, action_date, scheduled_at)
        values (p_owner, s.id, r.id, r.version, v_date, v_at)
        on conflict (subscription_id, commitment_id, commitment_version, action_date)
        do update set status = 'queued', scheduled_at = excluded.scheduled_at, attempts = 0, locked_until = null, last_error = null
        where public.commit_push_jobs.status in ('suppressed','failed');
    end loop;
  end loop;
end $$;
create function public.commit_push_record_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.rebuild_commit_push(new.owner_id, new.id); return new; end $$;
create trigger commitments_rebuild_push after insert or update on public.commitments for each row execute function public.commit_push_record_trigger();
create function public.commit_push_profile_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.rebuild_commit_push(new.owner_id, null); return new; end $$;
create trigger profiles_rebuild_push after insert or update on public.commit_profiles for each row execute function public.commit_push_profile_trigger();

create function public.register_commit_push(p_endpoint text, p_p256dh text, p_auth text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_id uuid;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 2048 or length(p_p256dh) not between 20 and 300 or length(p_auth) not between 8 and 300 then
    raise exception 'Invalid push subscription' using errcode = '22023'; end if;
  insert into public.commit_push_subscriptions(owner_id, endpoint, p256dh, auth_key)
    values (v_owner, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set revoked_at = null, p256dh = excluded.p256dh, auth_key = excluded.auth_key
      where public.commit_push_subscriptions.owner_id = v_owner
    returning id into v_id;
  if v_id is null then raise exception 'Subscription belongs to another account' using errcode = 'P0001'; end if;
  perform public.rebuild_commit_push(v_owner, null);
  return v_id;
end $$;
create function public.revoke_commit_push(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid());
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.commit_push_subscriptions set revoked_at = now() where owner_id = v_owner and id = p_id;
  update public.commit_push_jobs set status = 'suppressed', last_error = 'Device revoked'
    where owner_id = v_owner and subscription_id = p_id and status in ('queued','leased');
end $$;
create function public.claim_commit_push(p_limit integer default 20)
returns setof public.commit_push_jobs language plpgsql security definer set search_path = '' as $$
begin
  return query with due as (select j.id from public.commit_push_jobs j
    where ((j.status = 'queued' and j.scheduled_at <= now()) or (j.status = 'leased' and j.locked_until < now())) and j.attempts < 3
    order by j.scheduled_at limit least(greatest(p_limit, 1), 50) for update skip locked)
  update public.commit_push_jobs j set status = 'leased', attempts = attempts + 1, locked_until = now() + interval '5 minutes'
    from due where j.id = due.id returning j.*;
end $$;
revoke all on function public.rebuild_commit_push(uuid,text), public.register_commit_push(text,text,text), public.revoke_commit_push(uuid), public.claim_commit_push(integer) from public, anon, authenticated;
grant execute on function public.register_commit_push(text,text,text), public.revoke_commit_push(uuid) to authenticated;
grant execute on function public.claim_commit_push(integer) to service_role;
