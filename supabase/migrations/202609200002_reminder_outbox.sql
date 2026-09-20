-- Email reminder outbox. Deployment must separately schedule the worker function.
create table public.commit_reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  commitment_id text not null,
  commitment_version integer not null,
  action_date date not null,
  scheduled_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','leased','provider_accepted','failed','suppressed')),
  attempts integer not null default 0,
  locked_until timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  unique(owner_id, commitment_id, commitment_version, action_date)
);
create index commit_reminder_due_idx on public.commit_reminder_jobs(status, scheduled_at);
alter table public.commit_reminder_jobs enable row level security;
revoke all on public.commit_reminder_jobs from anon, authenticated;
grant select on public.commit_reminder_jobs to authenticated;
create policy reminder_owner_read on public.commit_reminder_jobs for select to authenticated
  using ((select auth.uid()) = owner_id);

create function public.rebuild_commit_reminders(p_owner uuid, p_commitment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; v_settings jsonb; v_date date; v_hour integer; v_zone text; v_at timestamptz;
begin
  select settings into v_settings from public.commit_profiles where owner_id = p_owner;
  update public.commit_reminder_jobs set status = 'suppressed', last_error = 'Record or consent changed'
    where owner_id = p_owner and status in ('queued','leased')
      and (p_commitment is null or commitment_id = p_commitment);
  if coalesce(v_settings ->> 'outboundEnabled', 'false') <> 'true'
    or v_settings ->> 'outboundConsentAt' is null then return; end if;
  v_hour := least(23, greatest(0, coalesce((v_settings ->> 'deliveryHour')::integer, 9)));
  if coalesce(v_settings ->> 'quietHours', 'true') = 'true' then
    v_hour := least(19, greatest(8, v_hour));
  end if;
  v_zone := coalesce(nullif(v_settings ->> 'timezone', ''), 'UTC');
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    v_zone := 'UTC';
  end if;
  for r in select id, version, body from public.commitments
      where owner_id = p_owner and (p_commitment is null or id = p_commitment)
  loop
    if r.body ->> 'intention' not in ('review','cancel')
      or r.body ->> 'cancellation' = 'confirmed'
      or r.body ->> 'lifecycle' in ('canceled','expired') then continue; end if;
    if (r.body ->> 'reviewTargetDate') !~ '^\d{4}-\d{2}-\d{2}$' then continue; end if;
    v_date := (r.body ->> 'reviewTargetDate')::date;
    if v_date < current_date then continue; end if;
    v_at := (v_date::timestamp + make_interval(hours => v_hour)) at time zone v_zone;
    if v_at <= now() then continue; end if;
    insert into public.commit_reminder_jobs(owner_id, commitment_id, commitment_version, action_date, scheduled_at)
      values (p_owner, r.id, r.version, v_date, v_at)
      on conflict (owner_id, commitment_id, commitment_version, action_date)
      do update set status = 'queued', scheduled_at = excluded.scheduled_at,
        locked_until = null, last_error = null, attempts = 0
      where public.commit_reminder_jobs.status in ('suppressed', 'failed');
  end loop;
end $$;

create function public.commitment_reminder_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.rebuild_commit_reminders(new.owner_id, new.id);
  return new;
end $$;
create trigger commitments_rebuild_reminders after insert or update on public.commitments
  for each row execute function public.commitment_reminder_trigger();

create function public.profile_reminder_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.rebuild_commit_reminders(new.owner_id, null);
  return new;
end $$;
create trigger profiles_rebuild_reminders after insert or update on public.commit_profiles
  for each row execute function public.profile_reminder_trigger();

-- Only a service role worker may lease jobs; the function still rechecks current state.
create function public.claim_commit_reminders(p_limit integer default 20)
returns setof public.commit_reminder_jobs language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select j.id from public.commit_reminder_jobs j
    where ((j.status = 'queued' and j.scheduled_at <= now())
      or (j.status = 'leased' and j.locked_until < now()))
      and j.attempts < 3
    order by j.scheduled_at limit least(greatest(p_limit, 1), 50) for update skip locked
  )
  update public.commit_reminder_jobs j
    set status = 'leased', attempts = attempts + 1, locked_until = now() + interval '5 minutes'
    from due where j.id = due.id returning j.*;
end $$;
revoke all on function public.rebuild_commit_reminders(uuid, text),
  public.claim_commit_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_commit_reminders(integer) to service_role;
