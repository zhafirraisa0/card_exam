-- Supabase SQL Editor. Shared operator credentials use Supabase Auth; password hashes
-- are never kept in application tables. Every browser signs in as the school's shared user.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create table if not exists public.activation_codes (
  code_hash text primary key, label text not null default '', max_uses integer not null default 1,
  uses integer not null default 0, expires_at timestamptz, active boolean not null default true
);
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null unique, slug text not null unique, logo_path text, created_at timestamptz not null default now()
);
create table if not exists public.class_folders (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, level text not null default '', exam_id text, metadata jsonb not null default '{}', created_at timestamptz not null default now(), unique(school_id,name,level)
);
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  folder_id uuid not null references public.class_folders(id) on delete cascade, external_id text, full_name text not null,
  fields jsonb not null default '{}', photo_path text, crop jsonb, created_at timestamptz not null default now()
);
create index if not exists students_school_folder_idx on public.students(school_id,folder_id);
create table if not exists public.card_templates (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, definition jsonb not null default '{}', background_path text, updated_at timestamptz not null default now()
);
create table if not exists public.workspace_snapshots (
  school_id uuid primary key references public.schools(id) on delete cascade, payload jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table if not exists public.operator_logs (
  id bigint generated always as identity primary key, school_id uuid not null references public.schools(id) on delete cascade,
  operator_name text not null default 'Operator', action text not null, detail text not null default '', created_at timestamptz not null default now()
);
create index if not exists operator_logs_school_created_idx on public.operator_logs(school_id,created_at desc);
create unique index if not exists schools_name_ci_uq on public.schools(lower(name));

grant usage on schema public to authenticated;
grant select,update on public.schools to authenticated;
grant select,insert,update,delete on public.class_folders,public.students,public.card_templates to authenticated;
grant select,insert,update on public.workspace_snapshots to authenticated;
grant select,insert on public.operator_logs to authenticated;
grant usage,select on sequence public.operator_logs_id_seq to authenticated;

create or replace function public.current_school_id() returns uuid language sql stable security definer set search_path=public as $$
  select id from public.schools where owner_id=auth.uid() limit 1
$$;
revoke all on function public.current_school_id() from public;
grant execute on function public.current_school_id() to authenticated;

create or replace function public.register_school(p_name text,p_activation_code text default null) returns uuid
language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid; v_slug text; v_code text;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if length(trim(p_name))<3 then raise exception 'Nama sekolah minimal 3 karakter'; end if;
  if exists(select 1 from public.schools where owner_id=auth.uid()) then raise exception 'Akun ini sudah memiliki workspace'; end if;
  if exists(select 1 from public.activation_codes where active=true) then
    if coalesce(trim(p_activation_code),'')='' then raise exception 'Kode aktivasi wajib diisi'; end if;
    v_code:=encode(digest(trim(p_activation_code),'sha256'),'hex');
    update public.activation_codes set uses=uses+1 where code_hash=v_code and active=true and uses<max_uses and (expires_at is null or expires_at>now());
    if not found then raise exception 'Kode aktivasi tidak valid atau sudah digunakan'; end if;
  end if;
  v_slug:=trim(both '-' from regexp_replace(lower(unaccent(trim(p_name))), '[^a-z0-9]+', '-', 'g'));
  insert into public.schools(owner_id,name,slug) values(auth.uid(),trim(p_name),left(v_slug,64)) returning id into v_id;
  insert into public.workspace_snapshots(school_id,payload) values(v_id,'{}'::jsonb);
  return v_id;
end $$;
revoke all on function public.register_school(text,text) from public;
grant execute on function public.register_school(text,text) to authenticated;

alter table public.schools enable row level security;
alter table public.class_folders enable row level security;
alter table public.students enable row level security;
alter table public.card_templates enable row level security;
alter table public.workspace_snapshots enable row level security;
alter table public.operator_logs enable row level security;
create policy schools_self_read on public.schools for select to authenticated using(owner_id=auth.uid());
create policy schools_self_update on public.schools for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy folders_tenant on public.class_folders for all to authenticated using(school_id=public.current_school_id()) with check(school_id=public.current_school_id());
create policy students_tenant on public.students for all to authenticated using(school_id=public.current_school_id()) with check(school_id=public.current_school_id());
create policy templates_tenant on public.card_templates for all to authenticated using(school_id=public.current_school_id()) with check(school_id=public.current_school_id());
create policy snapshots_tenant on public.workspace_snapshots for all to authenticated using(school_id=public.current_school_id()) with check(school_id=public.current_school_id());
create policy logs_tenant_read on public.operator_logs for select to authenticated using(school_id=public.current_school_id());
create policy logs_tenant_insert on public.operator_logs for insert to authenticated with check(school_id=public.current_school_id());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('student-photos','student-photos',false,10485760,array['image/jpeg','image/png','image/webp']),
 ('card-templates','card-templates',false,20971520,array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict(id) do update set public=false;
create policy school_media_read on storage.objects for select to authenticated using(bucket_id in ('student-photos','card-templates') and (storage.foldername(name))[1]=public.current_school_id()::text);
create policy school_media_insert on storage.objects for insert to authenticated with check(bucket_id in ('student-photos','card-templates') and (storage.foldername(name))[1]=public.current_school_id()::text);
create policy school_media_update on storage.objects for update to authenticated using(bucket_id in ('student-photos','card-templates') and (storage.foldername(name))[1]=public.current_school_id()::text) with check(bucket_id in ('student-photos','card-templates') and (storage.foldername(name))[1]=public.current_school_id()::text);
create policy school_media_delete on storage.objects for delete to authenticated using(bucket_id in ('student-photos','card-templates') and (storage.foldername(name))[1]=public.current_school_id()::text);

do $$ begin
  alter publication supabase_realtime add table public.workspace_snapshots;
exception when duplicate_object then null;
end $$;

-- One-time license generator (run as project owner). Store only a SHA-256 digest.
-- select encode(digest('YOUR-LONG-RANDOM-CODE','sha256'),'hex'); then insert that digest below.
