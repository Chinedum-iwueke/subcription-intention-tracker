-- Review acceptance (atomic candidate + commitment update), reminder snooze, and
-- evidence retention helpers.

-- Atomic duplicate/conflict resolution: applies the chosen field updates to the existing
-- commitment with a new term version and records the candidate resolution in one transaction.
create or replace function public.apply_commit_candidate_update(
  p_candidate_id text, p_expected_candidate_version integer, p_candidate_body jsonb,
  p_commitment_id text, p_expected_commitment_version integer, p_commitment_body jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_updated integer;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_candidate_id is null or p_commitment_id is null
    or p_expected_candidate_version is null or p_expected_candidate_version < 1
    or p_expected_commitment_version is null or p_expected_commitment_version < 1
    or p_candidate_body ->> 'id' is distinct from p_candidate_id
    or p_candidate_body ->> 'status' is distinct from 'resolved'
    or p_commitment_body ->> 'id' is distinct from p_commitment_id
    or p_commitment_body ->> 'sample' is distinct from 'false'
    or jsonb_typeof(p_commitment_body -> 'terms') <> 'object'
    or jsonb_typeof(p_commitment_body -> 'claims') <> 'array'
    or jsonb_typeof(p_commitment_body -> 'history') <> 'array'
    or jsonb_array_length(p_commitment_body -> 'history') < 1
  then raise exception 'Invalid review update' using errcode = '22023'; end if;

  update public.review_candidates
    set body = p_candidate_body, version = version + 1, updated_at = now()
    where owner_id = v_owner and id = p_candidate_id and version = p_expected_candidate_version
      and body ->> 'status' = 'unreviewed';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'Review version conflict' using errcode = 'P0001'; end if;

  update public.commitments
    set body = p_commitment_body, version = version + 1, updated_at = now()
    where owner_id = v_owner and id = p_commitment_id and version = p_expected_commitment_version
      and public.commit_preserves_tail(body -> 'history', p_commitment_body -> 'history')
      and jsonb_array_length(p_commitment_body -> 'history') > jsonb_array_length(body -> 'history')
      and public.commit_preserves_tail(body -> 'claims', p_commitment_body -> 'claims')
      and public.commit_preserves_tail(body -> 'termHistory', p_commitment_body -> 'termHistory');
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'Commitment version conflict' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.apply_commit_candidate_update(text, integer, jsonb, text, integer, jsonb) from public, anon;
grant execute on function public.apply_commit_candidate_update(text, integer, jsonb, text, integer, jsonb) to authenticated;

-- Snooze a queued reminder by up to 7 days, never past the action date.
create or replace function public.snooze_commit_reminder(p_job_id uuid, p_days integer)
returns date language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_new_date date;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_days is null or p_days < 1 or p_days > 7 then
    raise exception 'Snooze must be between 1 and 7 days' using errcode = '22023';
  end if;
  update public.commit_reminder_jobs
    set action_date = least(action_date + p_days, action_date), updated_at = now()
    where id = p_job_id and owner_id = v_owner and status = 'queued'
    returning action_date into v_new_date;
  if v_new_date is null then raise exception 'Reminder not found or not queued' using errcode = 'P0001'; end if;
  return v_new_date;
end $$;
revoke all on function public.snooze_commit_reminder(uuid, integer) from public, anon;
grant execute on function public.snooze_commit_reminder(uuid, integer) to authenticated;

-- Service-role: persist extraction items parsed from evidence. The first item keeps the
-- candidate id; additional items get -item-N suffixes. Called by the parse pipeline only.
create or replace function public.apply_commit_extraction(
  p_items jsonb, p_source_path text
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_index integer := 0; v_count integer := 0;
  v_id text; v_body jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 10 then
    raise exception 'Invalid extraction items' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    v_id := v_item ->> 'id';
    v_body := v_item;
    if v_index > 1 then
      v_id := v_id || '-item-' || v_index;
      v_body := jsonb_set(v_item, '{id}', to_jsonb(v_id));
    end if;
    if v_id is null or length(v_id) not between 1 and 120
      or jsonb_typeof(v_body -> 'fields') <> 'array'
    then raise exception 'Invalid extraction item' using errcode = '22023'; end if;
    insert into public.review_candidates(owner_id, id, body)
      select owner_id, v_id, v_body from public.evidence_artifacts
        where object_path = p_source_path
      on conflict (owner_id, id) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.apply_commit_extraction(jsonb, text) from public, anon, authenticated;

create or replace function public.cancel_commit_extraction(p_source_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.evidence_artifacts where object_path = p_source_path;
  if v_owner is null then raise exception 'Evidence not found' using errcode = 'P0001'; end if;
  delete from public.review_candidates
    where owner_id = v_owner and id like '%-item-%'
      and body ->> 'sourcePath' = p_source_path
      and body ->> 'status' = 'unreviewed';
end $$;
revoke all on function public.cancel_commit_extraction(text) from public, anon, authenticated;

-- Service-role: mark expired evidence rows (objects removed first by the purge job).
create or replace function public.mark_commit_evidence_expired()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.evidence_artifacts
    set deleted_at = now()
    where deleted_at is null and retain_until is not null and retain_until < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.mark_commit_evidence_expired() from public, anon, authenticated;

-- Provider webhook events for reminder delivery status (bounces, complaints).
create table public.commit_reminder_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  message_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.commit_reminder_webhook_events enable row level security;
revoke all on public.commit_reminder_webhook_events from anon, authenticated;

alter type public.commit_reminder_status add value if not exists
  'delivery_delayed' after 'delivered';
alter type public.commit_reminder_status add value if not exists
  'bounced' after 'delivery_delayed';
alter type public.commit_reminder_status add value if not exists
  'complained' after 'bounced';