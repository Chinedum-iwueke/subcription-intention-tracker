-- Complete atomic review updates and bounded user snooze.
create function public.apply_commit_candidate_update(
  p_candidate_id text, p_candidate_version integer, p_candidate_body jsonb,
  p_commitment_id text, p_commitment_version integer, p_commitment_body jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_rows integer;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_candidate_version is null or p_candidate_version < 1
    or p_commitment_version is null or p_commitment_version < 1
    or p_candidate_body ->> 'id' is distinct from p_candidate_id
    or p_candidate_body ->> 'status' is distinct from 'resolved'
    or p_commitment_body ->> 'id' is distinct from p_commitment_id
    or p_commitment_body ->> 'sample' is distinct from 'false'
    or jsonb_typeof(p_commitment_body -> 'terms') <> 'object'
    or jsonb_typeof(p_commitment_body -> 'claims') <> 'array'
    or jsonb_typeof(p_commitment_body -> 'history') <> 'array'
  then raise exception 'Invalid review update' using errcode = '22023'; end if;

  update public.review_candidates set body = p_candidate_body, version = version + 1, updated_at = now()
    where owner_id = v_owner and id = p_candidate_id and version = p_candidate_version
      and body ->> 'status' = 'unreviewed';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Candidate version conflict' using errcode = 'P0001'; end if;
  update public.commitments set body = p_commitment_body, version = version + 1, updated_at = now()
    where owner_id = v_owner and id = p_commitment_id and version = p_commitment_version
      and public.commit_preserves_tail(body -> 'history', p_commitment_body -> 'history')
      and jsonb_array_length(p_commitment_body -> 'history') > jsonb_array_length(body -> 'history')
      and public.commit_preserves_tail(body -> 'claims', p_commitment_body -> 'claims')
      and public.commit_preserves_tail(body -> 'termHistory', p_commitment_body -> 'termHistory');
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Commitment version conflict' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.apply_commit_candidate_update(text, integer, jsonb, text, integer, jsonb) from public, anon;
grant execute on function public.apply_commit_candidate_update(text, integer, jsonb, text, integer, jsonb) to authenticated;

alter table public.commit_reminder_jobs add column snoozed_until timestamptz;
create function public.snooze_commit_reminder(p_job_id uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_job public.commit_reminder_jobs%rowtype;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_job from public.commit_reminder_jobs
    where id = p_job_id and owner_id = v_owner for update;
  if not found or v_job.status <> 'queued' then
    raise exception 'Queued reminder not found' using errcode = 'P0001'; end if;
  if p_until is null or p_until <= now() or p_until > now() + interval '7 days'
    or p_until::date > v_job.action_date then
    raise exception 'Snooze must remain within seven days and the useful action window'
      using errcode = '22023'; end if;
  update public.commit_reminder_jobs set scheduled_at = p_until, snoozed_until = p_until
    where id = p_job_id;
end $$;
revoke all on function public.snooze_commit_reminder(uuid, timestamptz) from public, anon;
grant execute on function public.snooze_commit_reminder(uuid, timestamptz) to authenticated;

-- The service parser applies a multi-item extraction in one transaction.
create function public.apply_commit_extraction(
  p_owner uuid, p_candidate_id text, p_expected_version integer, p_items jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_index integer := 0; v_rows integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '28000'; end if;
  if p_owner is null or p_candidate_id is null or p_expected_version < 1
    or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10
  then raise exception 'Invalid extraction' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item -> 'fields') <> 'array' or v_item ->> 'sample' is distinct from 'false'
      or v_item ->> 'status' is distinct from 'unreviewed' then
      raise exception 'Invalid extraction item' using errcode = '22023'; end if;
    if v_index = 0 then
      if v_item ->> 'id' is distinct from p_candidate_id then
        raise exception 'Invalid candidate id' using errcode = '22023'; end if;
      update public.review_candidates set body = v_item, version = version + 1, updated_at = now()
        where owner_id = p_owner and id = p_candidate_id and version = p_expected_version;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'Candidate changed' using errcode = 'P0001'; end if;
    else
      if v_item ->> 'id' is distinct from p_candidate_id || '-item-' || (v_index + 1)::text then
        raise exception 'Invalid split candidate id' using errcode = '22023'; end if;
      insert into public.review_candidates(owner_id, id, body)
        values (p_owner, v_item ->> 'id', v_item);
    end if;
    v_index := v_index + 1;
  end loop;
end $$;
revoke all on function public.apply_commit_extraction(uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.apply_commit_extraction(uuid, text, integer, jsonb) to service_role;

create function public.cancel_commit_extraction(p_candidate_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_rows integer;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.review_candidates
    set body = jsonb_set(body, '{processingState}', '"needs_review"'::jsonb),
      version = version + 1, updated_at = now()
    where owner_id = v_owner and id = p_candidate_id and body ->> 'status' = 'unreviewed'
      and body ->> 'processingState' in ('queued', 'extracting');
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Active extraction not found' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.cancel_commit_extraction(text) from public, anon;
grant execute on function public.cancel_commit_extraction(text) to authenticated;

alter table public.commit_reminder_jobs drop constraint commit_reminder_jobs_status_check;
alter table public.commit_reminder_jobs add constraint commit_reminder_jobs_status_check
  check (status in ('queued','leased','provider_accepted','delivered','delivery_delayed',
    'bounced','complained','failed','suppressed'));
create table public.commit_reminder_webhook_events (
  event_id text primary key,
  provider_id text not null,
  event_type text not null,
  received_at timestamptz not null default now()
);
alter table public.commit_reminder_webhook_events enable row level security;
revoke all on public.commit_reminder_webhook_events from anon, authenticated;
grant select, insert, update on public.commit_reminder_webhook_events to service_role;
grant select, update on public.commit_reminder_jobs to service_role;
grant select, insert, update on public.review_candidates to service_role;
grant select on public.commitments, public.commit_profiles to service_role;
grant select, update on public.evidence_artifacts to service_role;

create function public.mark_commit_evidence_expired(p_artifact_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_artifact public.evidence_artifacts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '28000'; end if;
  select * into v_artifact from public.evidence_artifacts where id = p_artifact_id for update;
  if not found or v_artifact.deleted_at is not null or v_artifact.retain_until > now()
  then raise exception 'Artifact is not due for expiry' using errcode = 'P0001'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'commit-evidence'
    and name = v_artifact.object_path)
  then raise exception 'Remove private bytes first' using errcode = 'P0001'; end if;
  update public.review_candidates
    set body = jsonb_set(body - 'artifactPath', '{artifactExpiredAt}', to_jsonb(now()::text), true),
      version = version + 1, updated_at = now()
    where owner_id = v_artifact.owner_id and body ->> 'artifactPath' = v_artifact.object_path;
  update public.evidence_artifacts set deleted_at = now() where id = p_artifact_id;
end $$;
revoke all on function public.mark_commit_evidence_expired(uuid) from public, anon, authenticated;
grant execute on function public.mark_commit_evidence_expired(uuid) to service_role;
