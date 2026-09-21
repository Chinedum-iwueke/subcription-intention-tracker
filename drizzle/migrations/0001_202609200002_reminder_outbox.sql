-- Reminder outbox with explicit job states. Every reminder is queued against a specific
-- commitment version so state changes invalidate pending reminders.

create type public.commit_reminder_status as enum
  ('queued', 'leased', 'provider_accepted', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'suppressed');

create table public.commit_reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  commitment_id text not null,
  commitment_version integer not null,
  action_date date not null,
  action_kind text not null check (action_kind in ('review', 'cancel', 'bill')),
  channel text not null check (channel in ('email', 'push')),
  status public.commit_reminder_status not null default 'queued',
  attempts integer not null default 0,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, commitment_id, commitment_version, action_date, action_kind, channel),
  foreign key (owner_id, commitment_id) references public.commitments(owner_id, id) on delete cascade
);
create index commit_reminder_jobs_due_idx on public.commit_reminder_jobs(status, action_date)
  where status = 'queued';
create index commit_reminder_jobs_owner_idx on public.commit_reminder_jobs(owner_id);

-- Settings that govern outbound reminders. Outbound is opt-in: nothing sends until both
-- outboundEnabled and outboundConsentAt are set.
alter table public.commit_profiles
  add column if not exists reminder_governance jsonb not null default '{}'::jsonb;

alter table public.commit_reminder_jobs enable row level security;
revoke all on public.commit_reminder_jobs from anon, authenticated;
grant select, delete on public.commit_reminder_jobs to authenticated;

create policy reminder_jobs_owner_read on public.commit_reminder_jobs for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy reminder_jobs_owner_delete on public.commit_reminder_jobs for delete to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.rebuild_commit_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := coalesce(new.owner_id, old.owner_id);
  v_commitment_id text := coalesce(new.id, old.id);
  v_version integer;
  v_body jsonb;
  v_profile record;
  v_review_target date;
  v_cancel_target date;
  v_intention text;
  v_lifecycle text;
  v_cancel_status text;
  v_enabled boolean;
begin
  if tg_op = 'DELETE' then
    delete from public.commit_reminder_jobs
      where owner_id = v_owner and commitment_id = v_commitment_id;
    return null;
  end if;

  v_version := new.version;
  v_body := new.body;
  v_intention := v_body ->> 'intention';
  v_lifecycle := v_body ->> 'lifecycle';
  v_review_target := nullif(v_body ->> 'reviewTargetDate', '')::date;
  v_cancel_target := nullif(v_body ->> 'cancelTargetDate', '')::date;
  v_cancel_status := v_body #>> '{cancellation,status}';

  select settings into v_profile from public.commit_profiles where owner_id = v_owner;
  v_enabled := coalesce(
    (v_profile.settings ->> 'outboundEnabled')::boolean, false)
    and (v_profile.settings ->> 'outboundConsentAt') is not null;

  delete from public.commit_reminder_jobs
    where owner_id = v_owner and commitment_id = v_commitment_id
      and commitment_version <> v_version;

  if not v_enabled then return new; end if;
  if v_lifecycle in ('canceled', 'expired') then return new; end if;
  if v_cancel_status = 'confirmed' then return new; end if;

  -- Review and cancel intentions need a concrete target date to remind about; otherwise
  -- the app surface keeps the item in its planning buckets without outbound reminders.
  if v_intention = 'review' and v_review_target is null then return new; end if;
  if v_intention = 'cancel' and v_review_target is null and v_cancel_target is null then return new; end if;

  insert into public.commit_reminder_jobs(owner_id, commitment_id, commitment_version, action_date, action_kind, channel)
  values
    (v_owner, v_commitment_id, v_version, coalesce(v_cancel_target, v_review_target), 'cancel', 'email'),
    (v_owner, v_commitment_id, v_version, coalesce(v_review_target, v_cancel_target), 'review', 'email')
  on conflict (owner_id, commitment_id, commitment_version, action_date, action_kind, channel) do nothing;

  return new;
end $$;

create trigger commit_reminders_on_commitment
  after insert or update or delete on public.commitments
  for each row execute function public.rebuild_commit_reminders();

create or replace function public.rebuild_commit_reminders_for(
  p_owner uuid, p_commitment_id text, p_version integer, p_body jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile record; v_review_target date; v_cancel_target date;
  v_intention text := p_body ->> 'intention'; v_lifecycle text := p_body ->> 'lifecycle';
  v_cancel_status text := p_body #>> '{cancellation,status}';
  v_enabled boolean;
begin
  select settings into v_profile from public.commit_profiles where owner_id = p_owner;
  v_enabled := coalesce((v_profile.settings ->> 'outboundEnabled')::boolean, false)
    and (v_profile.settings ->> 'outboundConsentAt') is not null;

  delete from public.commit_reminder_jobs
    where owner_id = p_owner and commitment_id = p_commitment_id and commitment_version <> p_version;

  if not v_enabled then return; end if;
  if v_lifecycle in ('canceled', 'expired') then return; end if;
  if v_cancel_status = 'confirmed' then return; end if;

  v_review_target := nullif(p_body ->> 'reviewTargetDate', '')::date;
  v_cancel_target := nullif(p_body ->> 'cancelTargetDate', '')::date;
  if v_intention = 'review' and v_review_target is null then return; end if;
  if v_intention = 'cancel' and v_review_target is null and v_cancel_target is null then return; end if;

  insert into public.commit_reminder_jobs(owner_id, commitment_id, commitment_version, action_date, action_kind, channel)
  values
    (p_owner, p_commitment_id, p_version, coalesce(v_cancel_target, v_review_target), 'cancel', 'email'),
    (p_owner, p_commitment_id, p_version, coalesce(v_review_target, v_cancel_target), 'review', 'email')
  on conflict (owner_id, commitment_id, commitment_version, action_date, action_kind, channel) do nothing;
end $$;

create or replace function public.rebuild_commit_reminders_on_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row record;
begin
  for v_row in select owner_id, id, version, body from public.commitments where owner_id = new.owner_id
  loop
    perform public.rebuild_commit_reminders_for(v_row.owner_id, v_row.id, v_row.version, v_row.body);
  end loop;
  return new;
end $$;

create trigger commit_reminders_on_profile
  after insert or update on public.commit_profiles
  for each row execute function public.rebuild_commit_reminders_on_profile();

-- Service-role only: claims due queued jobs by leasing them.
create or replace function public.claim_commit_reminders(p_batch_size integer default 10)
returns table (
  id uuid, owner_id uuid, commitment_id text, commitment_version integer,
  action_date date, action_kind text, channel text
) language sql security definer set search_path = '' as $$
  update public.commit_reminder_jobs
    set status = 'leased', lease_expires_at = now() + interval '5 minutes', attempts = attempts + 1,
        updated_at = now()
    where id in (
      select j.id from public.commit_reminder_jobs j
        where j.status = 'queued' and j.action_date <= (now() at time zone 'UTC')::date
        order by j.action_date
        limit greatest(p_batch_size, 1)
        for update skip locked
    )
    returning id, owner_id, commitment_id, commitment_version, action_date, action_kind, channel;
$$;
revoke all on function public.claim_commit_reminders(integer) from public, anon, authenticated;