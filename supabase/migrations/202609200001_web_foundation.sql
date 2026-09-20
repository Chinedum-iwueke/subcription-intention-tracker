-- Commit web foundation. Apply to a dedicated Supabase project before setting VITE_SUPABASE_*.
-- Live account data is isolated from the browser-local synthetic demo.

create table public.commit_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

create table public.commitments (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 120),
  version integer not null default 1 check (version > 0),
  body jsonb not null check (jsonb_typeof(body) = 'object' and body ->> 'id' = id),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create index commitments_owner_updated_idx on public.commitments(owner_id, updated_at desc);

create table public.review_candidates (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 120),
  version integer not null default 1 check (version > 0),
  body jsonb not null check (jsonb_typeof(body) = 'object' and body ->> 'id' = id),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

-- Reserved for reviewed uploads in the next stage. Files are private and owner-prefixed.
create table public.evidence_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  commitment_id text,
  object_path text not null unique,
  sha256 text,
  origin text not null,
  captured_at timestamptz not null default now(),
  retain_until timestamptz,
  deleted_at timestamptz,
  foreign key (owner_id, commitment_id) references public.commitments(owner_id, id) on delete set null (commitment_id),
  check (object_path like owner_id::text || '/%')
);
create index evidence_artifacts_owner_idx on public.evidence_artifacts(owner_id);
create unique index evidence_artifacts_owner_hash_idx on public.evidence_artifacts(owner_id, sha256)
  where sha256 is not null and deleted_at is null;

-- Future normalized views can be populated from the versioned commitment body. The current
-- B-stage schema keeps terms, claims, decisions and history in one atomic JSON document.
alter table public.commit_profiles enable row level security;
alter table public.commitments enable row level security;
alter table public.review_candidates enable row level security;
alter table public.evidence_artifacts enable row level security;

revoke all on public.commit_profiles, public.commitments, public.review_candidates,
  public.evidence_artifacts from anon, authenticated;
grant select on public.commit_profiles, public.commitments, public.review_candidates,
  public.evidence_artifacts to authenticated;

create policy profiles_owner_read on public.commit_profiles for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy commitments_owner_read on public.commitments for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy candidates_owner_read on public.review_candidates for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy artifacts_owner_read on public.evidence_artifacts for select to authenticated
  using ((select auth.uid()) = owner_id);

-- Newest entries are prepended. Prior audit entries must remain intact at the tail.
create function public.commit_preserves_tail(p_old jsonb, p_new jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_old integer; v_new integer; v_index integer;
begin
  if jsonb_typeof(p_old) <> 'array' or jsonb_typeof(p_new) <> 'array' then return false; end if;
  v_old := jsonb_array_length(p_old);
  v_new := jsonb_array_length(p_new);
  if v_new < v_old then return false; end if;
  for v_index in 0..v_old - 1 loop
    if p_old -> v_index is distinct from p_new -> (v_new - v_old + v_index) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.commit_preserves_tail(jsonb, jsonb) from public, anon;

-- Only version-checked commands can write; owner_id is always taken from auth.uid().
create function public.save_commitment(p_id text, p_expected_version integer, p_body jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_version integer;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_id is null or length(p_id) not between 1 and 120 or p_expected_version is null or p_expected_version < 0
    or jsonb_typeof(p_body) <> 'object' or p_body ->> 'id' is distinct from p_id
    or p_body ->> 'sample' is distinct from 'false'
    or jsonb_typeof(p_body -> 'terms') <> 'object'
    or jsonb_typeof(p_body -> 'claims') <> 'array'
    or jsonb_typeof(p_body -> 'history') <> 'array'
    or jsonb_array_length(p_body -> 'history') < 1
  then raise exception 'Invalid commitment' using errcode = '22023'; end if;

  if p_expected_version = 0 then
    insert into public.commitments(owner_id, id, body) values (v_owner, p_id, p_body)
      on conflict do nothing returning version into v_version;
  else
    update public.commitments set body = p_body, version = version + 1, updated_at = now()
      where owner_id = v_owner and id = p_id and version = p_expected_version
        and public.commit_preserves_tail(body -> 'history', p_body -> 'history')
        and jsonb_array_length(p_body -> 'history') > jsonb_array_length(body -> 'history')
        and public.commit_preserves_tail(body -> 'claims', p_body -> 'claims')
        and public.commit_preserves_tail(body -> 'termHistory', p_body -> 'termHistory')
      returning version into v_version;
  end if;
  if v_version is null then raise exception 'Version conflict' using errcode = 'P0001'; end if;
  return v_version;
end $$;

create function public.save_review_candidate(p_id text, p_expected_version integer, p_body jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_version integer;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_id is null or length(p_id) not between 1 and 120 or p_expected_version is null or p_expected_version < 0
    or jsonb_typeof(p_body) <> 'object' or p_body ->> 'id' is distinct from p_id
    or jsonb_typeof(p_body -> 'fields') <> 'array'
  then raise exception 'Invalid candidate' using errcode = '22023'; end if;
  if p_expected_version = 0 then
    insert into public.review_candidates(owner_id, id, body) values (v_owner, p_id, p_body)
      on conflict do nothing returning version into v_version;
  else
    update public.review_candidates set body = p_body, version = version + 1, updated_at = now()
      where owner_id = v_owner and id = p_id and version = p_expected_version
      returning version into v_version;
  end if;
  if v_version is null then raise exception 'Version conflict' using errcode = 'P0001'; end if;
  return v_version;
end $$;

create function public.save_commit_profile(p_expected_version integer, p_settings jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_version integer;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_expected_version is null or p_expected_version < 0 or jsonb_typeof(p_settings) <> 'object'
  then raise exception 'Invalid settings' using errcode = '22023'; end if;
  if p_expected_version = 0 then
    insert into public.commit_profiles(owner_id, settings) values (v_owner, p_settings)
      on conflict do nothing returning version into v_version;
  else
    update public.commit_profiles set settings = p_settings, version = version + 1, updated_at = now()
      where owner_id = v_owner and version = p_expected_version returning version into v_version;
  end if;
  if v_version is null then raise exception 'Version conflict' using errcode = 'P0001'; end if;
  return v_version;
end $$;

-- Do not delete storage.objects with SQL: doing so can orphan object bytes. This command
-- refuses deletion while evidence objects remain; the future upload stage must remove them
-- through Storage first, then delete the account.
create function public.delete_my_commit_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid());
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'commit-evidence'
    and name like v_owner::text || '/%') then
    raise exception 'Delete private evidence through Storage before account deletion' using errcode = 'P0001';
  end if;
  delete from auth.users where id = v_owner;
end $$;

revoke all on function public.save_commitment(text, integer, jsonb),
  public.save_review_candidate(text, integer, jsonb),
  public.save_commit_profile(integer, jsonb),
  public.delete_my_commit_account() from public, anon;
grant execute on function public.save_commitment(text, integer, jsonb),
  public.save_review_candidate(text, integer, jsonb),
  public.save_commit_profile(integer, jsonb),
  public.delete_my_commit_account() to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('commit-evidence', 'commit-evidence', false, 10485760,
    array['image/png', 'image/jpeg', 'application/pdf'])
  on conflict (id) do nothing;

create policy commit_evidence_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'commit-evidence' and name like (select auth.uid())::text || '/%');
create policy commit_evidence_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'commit-evidence' and name like (select auth.uid())::text || '/%');
create policy commit_evidence_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'commit-evidence' and name like (select auth.uid())::text || '/%');

create function public.register_commit_evidence(p_path text, p_sha256 text, p_origin text,
  p_candidate_id text, p_candidate_body jsonb, p_retention_days integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_id uuid;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_path is null or p_path not like v_owner::text || '/%'
    or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_origin not in ('receipt', 'screenshot')
    or p_candidate_id is null or length(p_candidate_id) not between 1 and 120
    or p_candidate_body ->> 'id' is distinct from p_candidate_id
    or p_candidate_body ->> 'artifactPath' is distinct from p_path
    or p_candidate_body ->> 'sample' is distinct from 'false'
    or p_retention_days is null or p_retention_days not in (30, 90)
    or jsonb_typeof(p_candidate_body -> 'fields') <> 'array'
    or not exists (select 1 from storage.objects where bucket_id = 'commit-evidence' and name = p_path)
  then raise exception 'Invalid evidence' using errcode = '22023'; end if;
  insert into public.evidence_artifacts(owner_id, object_path, sha256, origin, retain_until)
    values (v_owner, p_path, p_sha256, p_origin, now() + make_interval(days => p_retention_days)) returning id into v_id;
  insert into public.review_candidates(owner_id, id, body)
    values (v_owner, p_candidate_id, p_candidate_body);
  return v_id;
end $$;
revoke all on function public.register_commit_evidence(text, text, text, text, jsonb, integer) from public, anon;
grant execute on function public.register_commit_evidence(text, text, text, text, jsonb, integer) to authenticated;

-- Review acceptance and inventory creation commit together, including the candidate decision.
create function public.accept_commit_candidate(
  p_candidate_id text, p_expected_candidate_version integer,
  p_candidate_body jsonb, p_commitment_id text, p_commitment_body jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_updated integer;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_candidate_id is null or p_commitment_id is null
    or p_expected_candidate_version is null or p_expected_candidate_version < 1
    or p_candidate_body ->> 'id' is distinct from p_candidate_id
    or p_candidate_body ->> 'status' is distinct from 'resolved'
    or p_commitment_body ->> 'id' is distinct from p_commitment_id
    or p_commitment_body ->> 'sample' is distinct from 'false'
    or jsonb_typeof(p_commitment_body -> 'terms') <> 'object'
    or jsonb_typeof(p_commitment_body -> 'claims') <> 'array'
    or jsonb_typeof(p_commitment_body -> 'history') <> 'array'
    or jsonb_array_length(p_commitment_body -> 'history') < 1
  then raise exception 'Invalid review acceptance' using errcode = '22023'; end if;
  update public.review_candidates
    set body = p_candidate_body, version = version + 1, updated_at = now()
    where owner_id = v_owner and id = p_candidate_id and version = p_expected_candidate_version
      and body ->> 'status' = 'unreviewed';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'Review version conflict' using errcode = 'P0001'; end if;
  insert into public.commitments(owner_id, id, body) values (v_owner, p_commitment_id, p_commitment_body);
end $$;
revoke all on function public.accept_commit_candidate(text, integer, jsonb, text, jsonb) from public, anon;
grant execute on function public.accept_commit_candidate(text, integer, jsonb, text, jsonb) to authenticated;

-- Called only after the client removes the private object through Storage.
create function public.delete_unreviewed_commit_evidence(p_path text, p_candidate_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid());
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.review_candidates where owner_id = v_owner and id = p_candidate_id
    and body ->> 'artifactPath' = p_path and body ->> 'status' = 'unreviewed')
  then raise exception 'Unreviewed evidence not found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.review_candidates where owner_id = v_owner and id <> p_candidate_id
    and body ->> 'artifactPath' = p_path)
    and exists (select 1 from storage.objects where bucket_id = 'commit-evidence' and name = p_path)
  then raise exception 'Remove the private object first' using errcode = 'P0001'; end if;
  delete from public.review_candidates where owner_id = v_owner and id = p_candidate_id
    and body ->> 'artifactPath' = p_path and body ->> 'status' = 'unreviewed';
  if not found then raise exception 'Unreviewed evidence not found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.review_candidates where owner_id = v_owner
    and body ->> 'artifactPath' = p_path) then
    delete from public.evidence_artifacts where owner_id = v_owner and object_path = p_path;
  end if;
end $$;
revoke all on function public.delete_unreviewed_commit_evidence(text, text) from public, anon;
grant execute on function public.delete_unreviewed_commit_evidence(text, text) to authenticated;
