-- M03: moderated patient community by program.
-- Scope: program-scoped patient feed, moderation queue, reports, weekly prompts
-- and RBAC seed. No external provider calls and no public storage exposure.

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  program_id uuid not null,
  enrollment_id uuid,
  patient_id uuid not null,
  author_user_id uuid references public.profiles(id) on delete set null,
  author_label text not null default 'Participante',
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'hidden', 'removed')),
  risk_flag boolean not null default false,
  moderation_reason text,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint community_posts_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade,
  constraint community_posts_enrollment_same_tenant
    foreign key (tenant_id, enrollment_id)
    references public.patient_program_enrollments(tenant_id, id)
    on delete set null (enrollment_id),
  constraint community_posts_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  post_id uuid not null,
  program_id uuid not null,
  patient_id uuid not null,
  author_user_id uuid references public.profiles(id) on delete set null,
  author_label text not null default 'Participante',
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'hidden', 'removed')),
  risk_flag boolean not null default false,
  moderation_reason text,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint community_comments_post_same_tenant
    foreign key (tenant_id, post_id)
    references public.community_posts(tenant_id, id)
    on delete cascade,
  constraint community_comments_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade,
  constraint community_comments_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.weekly_prompts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  program_id uuid,
  title text not null,
  body text not null,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint weekly_prompts_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade,
  constraint weekly_prompts_date_range
    check (ends_on is null or ends_on >= starts_on)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  post_id uuid,
  comment_id uuid,
  reporter_patient_id uuid not null,
  reporter_user_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint community_reports_single_target
    check ((post_id is not null and comment_id is null) or (post_id is null and comment_id is not null)),
  constraint community_reports_post_same_tenant
    foreign key (tenant_id, post_id)
    references public.community_posts(tenant_id, id)
    on delete cascade,
  constraint community_reports_comment_same_tenant
    foreign key (tenant_id, comment_id)
    references public.community_comments(tenant_id, id)
    on delete cascade,
  constraint community_reports_patient_same_tenant
    foreign key (tenant_id, reporter_patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create index if not exists idx_community_posts_program_status_created
  on public.community_posts(tenant_id, program_id, status, created_at desc);

create index if not exists idx_community_posts_patient_status_created
  on public.community_posts(tenant_id, patient_id, status, created_at desc);

create index if not exists idx_community_posts_author_created
  on public.community_posts(author_user_id, created_at desc);

create index if not exists idx_community_comments_post_status_created
  on public.community_comments(tenant_id, post_id, status, created_at asc);

create index if not exists idx_community_comments_program_status_created
  on public.community_comments(tenant_id, program_id, status, created_at desc);

create index if not exists idx_community_comments_author_created
  on public.community_comments(author_user_id, created_at desc);

create index if not exists idx_weekly_prompts_program_status_dates
  on public.weekly_prompts(tenant_id, program_id, status, starts_on desc);

create index if not exists idx_community_reports_target_status
  on public.community_reports(tenant_id, post_id, comment_id, status, created_at desc);

create unique index if not exists community_reports_unique_open_post_report
  on public.community_reports(tenant_id, post_id, reporter_user_id)
  where post_id is not null and status = 'open';

create unique index if not exists community_reports_unique_open_comment_report
  on public.community_reports(tenant_id, comment_id, reporter_user_id)
  where comment_id is not null and status = 'open';

select security.touch_updated_at('public.community_posts');
select security.touch_updated_at('public.community_comments');
select security.touch_updated_at('public.weekly_prompts');

create or replace function security.seed_community_rbac(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.roles (tenant_id, name, description, is_system)
  select p_tenant_id, role_code, description, true
  from (
    values
      ('tenant_owner', 'Tenant owner with full tenant control'),
      ('clinic_admin', 'Clinic administrator with operational control'),
      ('physician', 'Physician clinical access'),
      ('nutritionist', 'Nutrition professional access'),
      ('fitness_professional', 'Fitness professional access')
  ) as seed(role_code, description)
  on conflict (tenant_id, name) do update
  set description = excluded.description,
      is_system = true,
      updated_at = now();

  insert into public.permissions (tenant_id, code, description)
  select p_tenant_id, code, description
  from (
    values
      ('community.read', 'Read moderated community module'),
      ('community.write', 'Create moderated community content'),
      ('community.moderate', 'Moderate program community content')
  ) as seed(code, description)
  on conflict (tenant_id, code) do update
  set description = excluded.description,
      updated_at = now();

  insert into public.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant_id, r.id, p.id
  from (
    values
      ('tenant_owner', 'community.read'),
      ('tenant_owner', 'community.write'),
      ('tenant_owner', 'community.moderate'),
      ('clinic_admin', 'community.read'),
      ('clinic_admin', 'community.write'),
      ('clinic_admin', 'community.moderate'),
      ('physician', 'community.read'),
      ('physician', 'community.moderate'),
      ('nutritionist', 'community.read'),
      ('nutritionist', 'community.moderate'),
      ('fitness_professional', 'community.read')
  ) as matrix(role_code, permission_code)
  join public.roles r
    on r.tenant_id = p_tenant_id
   and r.name = matrix.role_code
  join public.permissions p
    on p.tenant_id = p_tenant_id
   and p.code = matrix.permission_code
  on conflict (tenant_id, role_id, permission_id) do nothing;
end;
$$;

revoke all on function security.seed_community_rbac(uuid) from public;
grant execute on function security.seed_community_rbac(uuid) to postgres, service_role;

create or replace function public.seed_community_rbac_for_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  perform security.seed_community_rbac(new.id);
  return new;
end;
$$;

drop trigger if exists trg_tenants_seed_community_rbac on public.tenants;
create trigger trg_tenants_seed_community_rbac
after insert on public.tenants
for each row execute function public.seed_community_rbac_for_new_tenant();

select security.seed_community_rbac(id) from public.tenants;

create or replace function security.community_clean_text(
  p_value text,
  p_max_length integer
)
returns text
language sql
immutable
as $$
  select nullif(
    left(
      regexp_replace(btrim(coalesce(p_value, '')), '[[:cntrl:]]+', ' ', 'g'),
      greatest(1, least(coalesce(p_max_length, 500), 4000))
    ),
    ''
  );
$$;

create or replace function security.community_detect_risk(p_body text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_body, '') ~* (
    'suic[ií]d|auto.?agress|emerg[eê]nc|urg[eê]nc|dor no peito|falta de ar|' ||
    'desmaio|sangramento|convuls|alergia grave|anafil|overdose|abuso|viol[eê]ncia'
  );
$$;

create or replace function security.community_author_label(
  p_tenant_id uuid,
  p_patient_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(p.preferred_name, ''), 'Participante')
  from public.patients p
  where p.tenant_id = p_tenant_id
    and p.id = p_patient_id
  limit 1;
$$;

create or replace function security.patient_has_program_community_access(
  p_tenant_id uuid,
  p_patient_id uuid,
  p_program_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, security, auth, pg_temp
as $$
  select p_tenant_id is not null
    and p_patient_id is not null
    and p_program_id is not null
    and security.can_access_patient_portal_patient(p_tenant_id, p_patient_id)
    and exists (
      select 1
      from public.patient_program_enrollments e
      join public.programs pr
        on pr.tenant_id = e.tenant_id
       and pr.id = e.program_id
      join public.program_entitlements pe
        on pe.tenant_id = e.tenant_id
       and pe.program_id = e.program_id
       and lower(pe.key) in ('comunidade', 'community')
       and pe.enabled = true
      where e.tenant_id = p_tenant_id
        and e.patient_id = p_patient_id
        and e.program_id = p_program_id
        and e.status in ('ativo', 'pausado', 'aguardando')
        and pr.status = 'ativo'
    );
$$;

create or replace function security.user_has_program_community_access(
  p_tenant_id uuid,
  p_program_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, security, auth, pg_temp
as $$
  select exists (
    select 1
    from public.patient_accounts pa
    where pa.tenant_id = p_tenant_id
      and pa.user_id = auth.uid()
      and pa.status = 'active'
      and security.patient_has_program_community_access(pa.tenant_id, pa.patient_id, p_program_id)
  )
  or exists (
    select 1
    from public.guardian_links gl
    where gl.tenant_id = p_tenant_id
      and gl.guardian_user_id = auth.uid()
      and gl.status = 'active'
      and security.patient_has_program_community_access(gl.tenant_id, gl.patient_id, p_program_id)
  );
$$;

create or replace function security.resolve_patient_community_link_for_program(
  p_tenant_id uuid,
  p_program_id uuid
)
returns table(patient_id uuid, linkage_type text)
language sql
stable
security definer
set search_path = public, security, auth, pg_temp
as $$
  with linked as (
    select pa.patient_id, 'patient'::text as linkage_type, pa.created_at
    from public.patient_accounts pa
    where pa.tenant_id = p_tenant_id
      and pa.user_id = auth.uid()
      and pa.status = 'active'
      and security.patient_has_program_community_access(pa.tenant_id, pa.patient_id, p_program_id)
    union all
    select gl.patient_id, 'guardian'::text as linkage_type, gl.created_at
    from public.guardian_links gl
    where gl.tenant_id = p_tenant_id
      and gl.guardian_user_id = auth.uid()
      and gl.status = 'active'
      and security.patient_has_program_community_access(gl.tenant_id, gl.patient_id, p_program_id)
  )
  select l.patient_id, l.linkage_type
  from linked l
  order by case l.linkage_type when 'patient' then 0 else 1 end, l.created_at asc
  limit 1;
$$;

create or replace function security.community_moderation_enabled(
  p_tenant_id uuid,
  p_program_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select lower(coalesce(pe.config ->> 'moderationEnabled', 'true')) <> 'false'
    from public.program_entitlements pe
    where pe.tenant_id = p_tenant_id
      and pe.program_id = p_program_id
      and lower(pe.key) in ('comunidade', 'community')
      and pe.enabled = true
    order by pe.created_at desc
    limit 1
  ), true);
$$;

create or replace function security.resolve_community_clinic_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path = public, security, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select coalesce(
    (
      select p.active_tenant_id
      from public.profiles p
      where p.id = v_user_id
        and p.is_active = true
        and p.active_tenant_id is not null
        and security.is_tenant_member(p.active_tenant_id)
      limit 1
    ),
    (
      select tm.tenant_id
      from public.tenant_memberships tm
      join public.profiles p on p.id = tm.user_id
      where tm.user_id = v_user_id
        and tm.status = 'active'
        and p.is_active = true
      order by tm.created_at asc
      limit 1
    )
  )
  into v_tenant_id;

  if v_tenant_id is null
     or not security.has_permission(v_tenant_id, 'community.moderate', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return v_tenant_id;
end;
$$;

revoke all on function security.community_clean_text(text, integer) from public;
revoke all on function security.community_detect_risk(text) from public;
revoke all on function security.community_author_label(uuid, uuid) from public;
revoke all on function security.patient_has_program_community_access(uuid, uuid, uuid) from public;
revoke all on function security.user_has_program_community_access(uuid, uuid) from public;
revoke all on function security.resolve_patient_community_link_for_program(uuid, uuid) from public;
revoke all on function security.community_moderation_enabled(uuid, uuid) from public;
revoke all on function security.resolve_community_clinic_tenant() from public;

grant execute on function security.community_clean_text(text, integer) to authenticated, service_role;
grant execute on function security.community_detect_risk(text) to authenticated, service_role;
grant execute on function security.community_author_label(uuid, uuid) to authenticated, service_role;
grant execute on function security.patient_has_program_community_access(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function security.user_has_program_community_access(uuid, uuid) to authenticated, service_role;
grant execute on function security.resolve_patient_community_link_for_program(uuid, uuid) to authenticated, service_role;
grant execute on function security.community_moderation_enabled(uuid, uuid) to authenticated, service_role;
grant execute on function security.resolve_community_clinic_tenant() to authenticated, service_role;

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.weekly_prompts enable row level security;
alter table public.community_reports enable row level security;

drop policy if exists community_posts_select_scope on public.community_posts;
create policy community_posts_select_scope
on public.community_posts for select
to authenticated
using (
  public.has_permission(tenant_id, 'community.moderate')
  or author_user_id = auth.uid()
  or (
    status = 'approved'
    and security.user_has_program_community_access(tenant_id, program_id)
  )
);

drop policy if exists community_posts_update_moderators on public.community_posts;
create policy community_posts_update_moderators
on public.community_posts for update
to authenticated
using (public.has_permission(tenant_id, 'community.moderate'))
with check (public.has_permission(tenant_id, 'community.moderate'));

drop policy if exists community_comments_select_scope on public.community_comments;
create policy community_comments_select_scope
on public.community_comments for select
to authenticated
using (
  public.has_permission(tenant_id, 'community.moderate')
  or author_user_id = auth.uid()
  or (
    status = 'approved'
    and security.user_has_program_community_access(tenant_id, program_id)
  )
);

drop policy if exists community_comments_update_moderators on public.community_comments;
create policy community_comments_update_moderators
on public.community_comments for update
to authenticated
using (public.has_permission(tenant_id, 'community.moderate'))
with check (public.has_permission(tenant_id, 'community.moderate'));

drop policy if exists weekly_prompts_select_scope on public.weekly_prompts;
create policy weekly_prompts_select_scope
on public.weekly_prompts for select
to authenticated
using (
  public.has_permission(tenant_id, 'community.moderate')
  or (
    status = 'active'
    and program_id is not null
    and security.user_has_program_community_access(tenant_id, program_id)
  )
);

drop policy if exists weekly_prompts_write_moderators on public.weekly_prompts;
create policy weekly_prompts_write_moderators
on public.weekly_prompts for all
to authenticated
using (public.has_permission(tenant_id, 'community.moderate'))
with check (public.has_permission(tenant_id, 'community.moderate'));

drop policy if exists community_reports_select_scope on public.community_reports;
create policy community_reports_select_scope
on public.community_reports for select
to authenticated
using (
  public.has_permission(tenant_id, 'community.moderate')
  or reporter_user_id = auth.uid()
);

grant select, insert, update on public.community_posts to authenticated, service_role;
grant select, insert, update on public.community_comments to authenticated, service_role;
grant select, insert, update on public.weekly_prompts to authenticated, service_role;
grant select, insert, update on public.community_reports to authenticated, service_role;

create or replace function public.get_patient_community_feed(
  p_patient_id uuid default null,
  p_program_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_program_id uuid;
  v_programs jsonb := '[]'::jsonb;
  v_prompt jsonb := null;
  v_posts jsonb := '[]'::jsonb;
begin
  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with allowed as (
    select distinct on (e.program_id)
      e.program_id,
      pr.name,
      e.id as enrollment_id,
      e.status,
      pe.config
    from public.patient_program_enrollments e
    join public.programs pr
      on pr.tenant_id = e.tenant_id
     and pr.id = e.program_id
    join public.program_entitlements pe
      on pe.tenant_id = e.tenant_id
     and pe.program_id = e.program_id
     and lower(pe.key) in ('comunidade', 'community')
     and pe.enabled = true
    where e.tenant_id = v_tenant_id
      and e.patient_id = v_patient_id
      and e.status in ('ativo', 'pausado', 'aguardando')
      and pr.status = 'ativo'
    order by e.program_id, e.created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', program_id,
    'name', name,
    'enrollmentId', enrollment_id,
    'status', status,
    'moderationEnabled', security.community_moderation_enabled(v_tenant_id, program_id),
    'anonymousByDefault', lower(coalesce(config ->> 'anonymousByDefault', 'false')) = 'true'
  ) order by name), '[]'::jsonb)
  into v_programs
  from allowed;

  if jsonb_array_length(v_programs) = 0 then
    return jsonb_build_object(
      'accessStatus', 'blocked',
      'selectedPatientId', v_patient_id,
      'selectedProgramId', null,
      'programs', '[]'::jsonb,
      'prompt', null,
      'posts', '[]'::jsonb,
      'guidelines', jsonb_build_array(
        'Compartilhe experiencias gerais do programa.',
        'Nao publique dados sensiveis, urgencias medicas ou informacoes de terceiros.',
        'Conteudos podem passar por moderacao antes de aparecer.'
      )
    );
  end if;

  if p_program_id is not null then
    if not exists (
      select 1
      from jsonb_array_elements(v_programs) program
      where (program ->> 'id')::uuid = p_program_id
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_program_id := p_program_id;
  else
    v_program_id := (v_programs -> 0 ->> 'id')::uuid;
  end if;

  select jsonb_build_object(
    'id', wp.id,
    'programId', wp.program_id,
    'title', wp.title,
    'body', wp.body,
    'startsOn', wp.starts_on,
    'endsOn', wp.ends_on,
    'status', wp.status
  )
  into v_prompt
  from public.weekly_prompts wp
  where wp.tenant_id = v_tenant_id
    and (wp.program_id = v_program_id or wp.program_id is null)
    and wp.status = 'active'
    and wp.starts_on <= current_date
    and (wp.ends_on is null or wp.ends_on >= current_date)
  order by case when wp.program_id = v_program_id then 0 else 1 end, wp.starts_on desc, wp.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'programId', p.program_id,
    'patientId', p.patient_id,
    'authorLabel', p.author_label,
    'body', p.body,
    'status', p.status,
    'riskFlag', p.risk_flag,
    'moderationReason', p.moderation_reason,
    'isOwn', p.author_user_id = auth.uid(),
    'createdAt', p.created_at,
    'updatedAt', p.updated_at,
    'commentCount', coalesce(comments.approved_count, 0),
    'reportCount', coalesce(reports.open_count, 0)
  ) order by p.created_at desc), '[]'::jsonb)
  into v_posts
  from (
    select *
    from public.community_posts post
    where post.tenant_id = v_tenant_id
      and post.program_id = v_program_id
      and (
        post.status = 'approved'
        or (post.author_user_id = auth.uid() and post.status in ('pending', 'rejected'))
      )
    order by post.created_at desc
    limit 30
  ) p
  left join lateral (
    select count(*)::integer as approved_count
    from public.community_comments c
    where c.tenant_id = p.tenant_id
      and c.post_id = p.id
      and c.status = 'approved'
  ) comments on true
  left join lateral (
    select count(*)::integer as open_count
    from public.community_reports r
    where r.tenant_id = p.tenant_id
      and r.post_id = p.id
      and r.status = 'open'
  ) reports on true;

  return jsonb_build_object(
    'accessStatus', 'enabled',
    'selectedPatientId', v_patient_id,
    'selectedProgramId', v_program_id,
    'programs', v_programs,
    'prompt', v_prompt,
    'posts', v_posts,
    'guidelines', jsonb_build_array(
      'Compartilhe experiencias gerais do programa.',
      'Nao publique dados sensiveis, urgencias medicas ou informacoes de terceiros.',
      'Conteudos podem passar por moderacao antes de aparecer.'
    )
  );
end;
$$;

create or replace function public.submit_patient_community_post(
  p_patient_id uuid,
  p_program_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_patient_id uuid;
  v_enrollment_id uuid;
  v_body text := security.community_clean_text(p_body, 1200);
  v_status text;
  v_risk boolean;
  v_post_id uuid;
  v_author_label text;
  v_anonymous boolean := false;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if v_body is null or length(v_body) < 3 then
    raise exception 'invalid_post' using errcode = '22023';
  end if;

  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_tenant_id is null
     or v_patient_id is null
     or not security.patient_has_program_community_access(v_tenant_id, v_patient_id, p_program_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if (
    select count(*)::integer
    from public.community_posts post
    where post.author_user_id = v_user_id
      and post.created_at >= now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = '42900';
  end if;

  select e.id
  into v_enrollment_id
  from public.patient_program_enrollments e
  where e.tenant_id = v_tenant_id
    and e.patient_id = v_patient_id
    and e.program_id = p_program_id
    and e.status in ('ativo', 'pausado', 'aguardando')
  order by e.created_at desc
  limit 1;

  v_risk := security.community_detect_risk(v_body);
  v_status := case
    when security.community_moderation_enabled(v_tenant_id, p_program_id) or v_risk
      then 'pending'
    else 'approved'
  end;
  select coalesce(lower(pe.config ->> 'anonymousByDefault') = 'true', false)
  into v_anonymous
  from public.program_entitlements pe
  where pe.tenant_id = v_tenant_id
    and pe.program_id = p_program_id
    and lower(pe.key) in ('comunidade', 'community')
    and pe.enabled = true
  order by pe.created_at desc
  limit 1;

  v_author_label := case
    when coalesce(v_anonymous, false) then 'Participante'
    else security.community_author_label(v_tenant_id, v_patient_id)
  end;

  insert into public.community_posts (
    tenant_id,
    program_id,
    enrollment_id,
    patient_id,
    author_user_id,
    author_label,
    body,
    status,
    risk_flag,
    approved_at,
    metadata
  )
  values (
    v_tenant_id,
    p_program_id,
    v_enrollment_id,
    v_patient_id,
    v_user_id,
    coalesce(v_author_label, 'Participante'),
    v_body,
    v_status,
    v_risk,
    case when v_status = 'approved' then now() else null end,
    jsonb_build_object('source', 'patient_portal', 'moderationDefault', 'fail_closed')
  )
  returning id into v_post_id;

  if v_risk then
    insert into public.patient_alerts (
      tenant_id,
      patient_id,
      alert_type,
      title,
      description,
      severity,
      starts_at
    )
    values (
      v_tenant_id,
      v_patient_id,
      'community_risk_triage',
      'Sinal sensivel na comunidade',
      'Conteudo da comunidade requer triagem moderada pela equipe.',
      'high',
      now()
    )
    on conflict (tenant_id, patient_id, title) do nothing;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'community.post.created',
    'community_post',
    v_post_id::text,
    jsonb_build_object(
      'programId', p_program_id,
      'patientId', v_patient_id,
      'status', v_status,
      'riskFlag', v_risk
    )
  );

  return jsonb_build_object(
    'id', v_post_id,
    'programId', p_program_id,
    'patientId', v_patient_id,
    'authorLabel', coalesce(v_author_label, 'Participante'),
    'body', v_body,
    'status', v_status,
    'riskFlag', v_risk,
    'createdAt', now(),
    'commentCount', 0,
    'reportCount', 0,
    'isOwn', true
  );
end;
$$;

create or replace function public.get_patient_community_comments(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_post public.community_posts%rowtype;
  v_tenant_id uuid;
  v_patient_id uuid;
  v_comments jsonb := '[]'::jsonb;
begin
  select *
  into v_post
  from public.community_posts
  where id = p_post_id;

  if v_post.id is null then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;

  select v_post.tenant_id, link.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_community_link_for_program(v_post.tenant_id, v_post.program_id) link
  limit 1;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'postId', c.post_id,
    'programId', c.program_id,
    'patientId', c.patient_id,
    'authorLabel', c.author_label,
    'body', c.body,
    'status', c.status,
    'riskFlag', c.risk_flag,
    'moderationReason', c.moderation_reason,
    'isOwn', c.author_user_id = auth.uid(),
    'createdAt', c.created_at
  ) order by c.created_at asc), '[]'::jsonb)
  into v_comments
  from public.community_comments c
  where c.tenant_id = v_post.tenant_id
    and c.post_id = v_post.id
    and (
      c.status = 'approved'
      or (c.author_user_id = auth.uid() and c.status in ('pending', 'rejected'))
    );

  return jsonb_build_object(
    'postId', v_post.id,
    'comments', v_comments
  );
end;
$$;

create or replace function public.submit_patient_community_comment(
  p_post_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.community_posts%rowtype;
  v_tenant_id uuid;
  v_patient_id uuid;
  v_body text := security.community_clean_text(p_body, 800);
  v_status text;
  v_risk boolean;
  v_comment_id uuid;
  v_author_label text;
  v_anonymous boolean := false;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if v_body is null or length(v_body) < 2 then
    raise exception 'invalid_comment' using errcode = '22023';
  end if;

  select *
  into v_post
  from public.community_posts
  where id = p_post_id;

  if v_post.id is null or v_post.status <> 'approved' then
    raise exception 'post_unavailable' using errcode = '42501';
  end if;

  select v_post.tenant_id, link.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_community_link_for_program(v_post.tenant_id, v_post.program_id) link
  limit 1;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if (
    select count(*)::integer
    from public.community_comments comment
    where comment.author_user_id = v_user_id
      and comment.created_at >= now() - interval '1 hour'
  ) >= 20 then
    raise exception 'rate_limited' using errcode = '42900';
  end if;

  v_risk := security.community_detect_risk(v_body);
  v_status := case
    when security.community_moderation_enabled(v_post.tenant_id, v_post.program_id) or v_risk
      then 'pending'
    else 'approved'
  end;
  select coalesce(lower(pe.config ->> 'anonymousByDefault') = 'true', false)
  into v_anonymous
  from public.program_entitlements pe
  where pe.tenant_id = v_tenant_id
    and pe.program_id = v_post.program_id
    and lower(pe.key) in ('comunidade', 'community')
    and pe.enabled = true
  order by pe.created_at desc
  limit 1;

  v_author_label := case
    when coalesce(v_anonymous, false) then 'Participante'
    else security.community_author_label(v_tenant_id, v_patient_id)
  end;

  insert into public.community_comments (
    tenant_id,
    post_id,
    program_id,
    patient_id,
    author_user_id,
    author_label,
    body,
    status,
    risk_flag,
    approved_at,
    metadata
  )
  values (
    v_post.tenant_id,
    v_post.id,
    v_post.program_id,
    v_patient_id,
    v_user_id,
    coalesce(v_author_label, 'Participante'),
    v_body,
    v_status,
    v_risk,
    case when v_status = 'approved' then now() else null end,
    jsonb_build_object('source', 'patient_portal', 'moderationDefault', 'fail_closed')
  )
  returning id into v_comment_id;

  if v_risk then
    insert into public.patient_alerts (
      tenant_id,
      patient_id,
      alert_type,
      title,
      description,
      severity,
      starts_at
    )
    values (
      v_post.tenant_id,
      v_patient_id,
      'community_risk_triage',
      'Sinal sensivel na comunidade',
      'Comentario da comunidade requer triagem moderada pela equipe.',
      'high',
      now()
    )
    on conflict (tenant_id, patient_id, title) do nothing;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_post.tenant_id,
    v_user_id,
    'community.comment.created',
    'community_comment',
    v_comment_id::text,
    jsonb_build_object(
      'programId', v_post.program_id,
      'postId', v_post.id,
      'patientId', v_patient_id,
      'status', v_status,
      'riskFlag', v_risk
    )
  );

  return jsonb_build_object(
    'id', v_comment_id,
    'postId', v_post.id,
    'programId', v_post.program_id,
    'patientId', v_patient_id,
    'authorLabel', coalesce(v_author_label, 'Participante'),
    'body', v_body,
    'status', v_status,
    'riskFlag', v_risk,
    'createdAt', now(),
    'isOwn', true
  );
end;
$$;

create or replace function public.report_community_content(
  p_item_type text,
  p_item_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_patient_id uuid;
  v_post_id uuid;
  v_comment_id uuid;
  v_program_id uuid;
  v_reason text := security.community_clean_text(p_reason, 500);
  v_report_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if v_reason is null then
    raise exception 'invalid_report_reason' using errcode = '22023';
  end if;

  if lower(coalesce(p_item_type, '')) = 'post' then
    select post.tenant_id, post.id, post.program_id
    into v_tenant_id, v_post_id, v_program_id
    from public.community_posts post
    where post.id = p_item_id
      and post.status = 'approved';
  elsif lower(coalesce(p_item_type, '')) = 'comment' then
    select comment.tenant_id, comment.post_id, comment.id, comment.program_id
    into v_tenant_id, v_post_id, v_comment_id, v_program_id
    from public.community_comments comment
    where comment.id = p_item_id
      and comment.status = 'approved';
  else
    raise exception 'invalid_report_target' using errcode = '22023';
  end if;

  if v_tenant_id is null then
    raise exception 'target_unavailable' using errcode = 'P0002';
  end if;

  select link.patient_id
  into v_patient_id
  from security.resolve_patient_community_link_for_program(v_tenant_id, v_program_id) link
  limit 1;

  if v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.community_reports (
    tenant_id,
    post_id,
    comment_id,
    reporter_patient_id,
    reporter_user_id,
    reason
  )
  values (
    v_tenant_id,
    case when v_comment_id is null then v_post_id else null end,
    v_comment_id,
    v_patient_id,
    v_user_id,
    v_reason
  )
  on conflict do nothing
  returning id into v_report_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'community.content.reported',
    coalesce(lower(p_item_type), 'community'),
    p_item_id::text,
    jsonb_build_object('programId', v_program_id, 'postId', v_post_id)
  );

  return jsonb_build_object(
    'id', coalesce(v_report_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'status', case when v_report_id is null then 'already_open' else 'open' end
  );
end;
$$;

create or replace function public.get_clinic_community_moderation(
  p_status_filter text default 'pending',
  p_program_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_community_clinic_tenant();
  v_filter text := lower(coalesce(nullif(p_status_filter, ''), 'pending'));
  v_programs jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_prompts jsonb := '[]'::jsonb;
begin
  if v_filter not in ('pending', 'approved', 'rejected', 'reported') then
    v_filter := 'pending';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'status', p.status,
    'communityEnabled', pe.program_id is not null
  ) order by p.name), '[]'::jsonb)
  into v_programs
  from public.programs p
  left join lateral (
    select pe.program_id
    from public.program_entitlements pe
    where pe.tenant_id = p.tenant_id
      and pe.program_id = p.id
      and lower(pe.key) in ('comunidade', 'community')
      and pe.enabled = true
    limit 1
  ) pe on true
  where p.tenant_id = v_tenant_id
    and p.status <> 'arquivado';

  with counts as (
    select
      (
        select count(*)::integer
        from public.community_posts p
        where p.tenant_id = v_tenant_id and p.status = 'pending'
      ) + (
        select count(*)::integer
        from public.community_comments c
        where c.tenant_id = v_tenant_id and c.status = 'pending'
      ) as pending_count,
      (
        select count(*)::integer
        from public.community_posts p
        where p.tenant_id = v_tenant_id and p.status = 'approved' and p.approved_at >= current_date
      ) + (
        select count(*)::integer
        from public.community_comments c
        where c.tenant_id = v_tenant_id and c.status = 'approved' and c.approved_at >= current_date
      ) as approved_today_count,
      (
        select count(*)::integer
        from public.community_reports r
        where r.tenant_id = v_tenant_id and r.status = 'open'
      ) as reported_count
  )
  select jsonb_build_object(
    'pending', pending_count,
    'approvedToday', approved_today_count,
    'reported', reported_count
  )
  into v_summary
  from counts;

  with post_items as (
    select
      p.created_at,
      jsonb_build_object(
        'itemType', 'post',
        'id', p.id,
        'postId', p.id,
        'programId', p.program_id,
        'programName', pr.name,
        'patientId', p.patient_id,
        'authorLabel', p.author_label,
        'body', p.body,
        'status', p.status,
        'riskFlag', p.risk_flag,
        'moderationReason', p.moderation_reason,
        'reportCount', coalesce(reports.open_count, 0),
        'createdAt', p.created_at
      ) as item
    from public.community_posts p
    join public.programs pr on pr.tenant_id = p.tenant_id and pr.id = p.program_id
    left join lateral (
      select count(*)::integer as open_count
      from public.community_reports r
      where r.tenant_id = p.tenant_id
        and r.post_id = p.id
        and r.status = 'open'
    ) reports on true
    where p.tenant_id = v_tenant_id
      and (p_program_id is null or p.program_id = p_program_id)
      and (
        (v_filter = 'reported' and coalesce(reports.open_count, 0) > 0)
        or (v_filter <> 'reported' and p.status = v_filter)
      )
  ), comment_items as (
    select
      c.created_at,
      jsonb_build_object(
        'itemType', 'comment',
        'id', c.id,
        'postId', c.post_id,
        'programId', c.program_id,
        'programName', pr.name,
        'patientId', c.patient_id,
        'authorLabel', c.author_label,
        'body', c.body,
        'parentBody', left(post.body, 220),
        'status', c.status,
        'riskFlag', c.risk_flag,
        'moderationReason', c.moderation_reason,
        'reportCount', coalesce(reports.open_count, 0),
        'createdAt', c.created_at
      ) as item
    from public.community_comments c
    join public.community_posts post on post.tenant_id = c.tenant_id and post.id = c.post_id
    join public.programs pr on pr.tenant_id = c.tenant_id and pr.id = c.program_id
    left join lateral (
      select count(*)::integer as open_count
      from public.community_reports r
      where r.tenant_id = c.tenant_id
        and r.comment_id = c.id
        and r.status = 'open'
    ) reports on true
    where c.tenant_id = v_tenant_id
      and (p_program_id is null or c.program_id = p_program_id)
      and (
        (v_filter = 'reported' and coalesce(reports.open_count, 0) > 0)
        or (v_filter <> 'reported' and c.status = v_filter)
      )
  ), unioned as (
    select * from post_items
    union all
    select * from comment_items
  )
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
  into v_items
  from (
    select *
    from unioned
    order by created_at desc
    limit 50
  ) limited;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', wp.id,
    'programId', wp.program_id,
    'programName', coalesce(pr.name, 'Todos os programas'),
    'title', wp.title,
    'body', wp.body,
    'startsOn', wp.starts_on,
    'endsOn', wp.ends_on,
    'status', wp.status
  ) order by wp.starts_on desc, wp.created_at desc), '[]'::jsonb)
  into v_prompts
  from (
    select *
    from public.weekly_prompts
    where tenant_id = v_tenant_id
      and status <> 'archived'
    order by starts_on desc, created_at desc
    limit 10
  ) wp
  left join public.programs pr on pr.tenant_id = wp.tenant_id and pr.id = wp.program_id;

  return jsonb_build_object(
    'summary', v_summary,
    'programs', v_programs,
    'items', v_items,
    'prompts', v_prompts,
    'statusFilter', v_filter,
    'selectedProgramId', p_program_id
  );
end;
$$;

create or replace function public.moderate_community_item(
  p_item_type text,
  p_item_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := security.resolve_community_clinic_tenant();
  v_item_type text := lower(coalesce(p_item_type, ''));
  v_action text := lower(coalesce(p_action, ''));
  v_next_status text;
  v_reason text := security.community_clean_text(p_reason, 500);
  v_program_id uuid;
  v_patient_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if v_action not in ('approve', 'reject', 'hide', 'remove') then
    raise exception 'invalid_moderation_action' using errcode = '22023';
  end if;

  v_next_status := case v_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'hide' then 'hidden'
    else 'removed'
  end;

  if v_action in ('reject', 'hide', 'remove') and v_reason is null then
    raise exception 'moderation_reason_required' using errcode = '22023';
  end if;

  if v_item_type = 'post' then
    update public.community_posts
    set status = v_next_status,
        moderation_reason = case when v_action = 'approve' then null else v_reason end,
        moderated_by = v_user_id,
        moderated_at = now(),
        approved_at = case when v_action = 'approve' then now() else approved_at end,
        updated_at = now()
    where tenant_id = v_tenant_id
      and id = p_item_id
    returning program_id, patient_id into v_program_id, v_patient_id;
  elsif v_item_type = 'comment' then
    update public.community_comments
    set status = v_next_status,
        moderation_reason = case when v_action = 'approve' then null else v_reason end,
        moderated_by = v_user_id,
        moderated_at = now(),
        approved_at = case when v_action = 'approve' then now() else approved_at end,
        updated_at = now()
    where tenant_id = v_tenant_id
      and id = p_item_id
    returning program_id, patient_id into v_program_id, v_patient_id;
  else
    raise exception 'invalid_moderation_target' using errcode = '22023';
  end if;

  if v_program_id is null then
    raise exception 'target_not_found' using errcode = 'P0002';
  end if;

  if v_action in ('approve', 'reject', 'hide', 'remove') then
    update public.community_reports
    set status = case when v_action = 'approve' then 'dismissed' else 'reviewed' end,
        reviewed_by = v_user_id,
        reviewed_at = now()
    where tenant_id = v_tenant_id
      and status = 'open'
      and (
        (v_item_type = 'post' and post_id = p_item_id)
        or (v_item_type = 'comment' and comment_id = p_item_id)
      );
  end if;

  if v_action in ('reject', 'hide', 'remove') then
    insert into public.notifications (
      tenant_id,
      patient_id,
      title,
      body,
      category,
      status,
      metadata
    )
    values (
      v_tenant_id,
      v_patient_id,
      'Conteudo da comunidade revisado',
      coalesce(v_reason, 'A equipe revisou um conteudo enviado para a comunidade.'),
      'community',
      'unread',
      jsonb_build_object('itemType', v_item_type, 'itemId', p_item_id, 'status', v_next_status)
    );
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'community.item.' || v_action,
    'community_' || v_item_type,
    p_item_id::text,
    jsonb_build_object(
      'programId', v_program_id,
      'patientId', v_patient_id,
      'nextStatus', v_next_status,
      'hasReason', v_reason is not null
    )
  );

  return jsonb_build_object(
    'id', p_item_id,
    'itemType', v_item_type,
    'status', v_next_status,
    'moderatedAt', now()
  );
end;
$$;

create or replace function public.upsert_weekly_prompt(
  p_prompt_id uuid default null,
  p_program_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_starts_on date default current_date,
  p_ends_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := security.resolve_community_clinic_tenant();
  v_prompt_id uuid;
  v_title text := security.community_clean_text(p_title, 140);
  v_body text := security.community_clean_text(p_body, 800);
  v_starts_on date := coalesce(p_starts_on, current_date);
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if v_title is null or v_body is null then
    raise exception 'prompt_required' using errcode = '22023';
  end if;
  if p_ends_on is not null and p_ends_on < v_starts_on then
    raise exception 'invalid_prompt_dates' using errcode = '22023';
  end if;

  if p_program_id is not null and not exists (
    select 1
    from public.programs p
    where p.tenant_id = v_tenant_id
      and p.id = p_program_id
  ) then
    raise exception 'program_not_found' using errcode = 'P0002';
  end if;

  if p_prompt_id is null then
    insert into public.weekly_prompts (
      tenant_id,
      program_id,
      title,
      body,
      starts_on,
      ends_on,
      status,
      created_by
    )
    values (
      v_tenant_id,
      p_program_id,
      v_title,
      v_body,
      v_starts_on,
      p_ends_on,
      'active',
      v_user_id
    )
    returning id into v_prompt_id;
  else
    update public.weekly_prompts
    set program_id = p_program_id,
        title = v_title,
        body = v_body,
        starts_on = v_starts_on,
        ends_on = p_ends_on,
        status = 'active',
        updated_at = now()
    where tenant_id = v_tenant_id
      and id = p_prompt_id
    returning id into v_prompt_id;

    if v_prompt_id is null then
      raise exception 'prompt_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'community.prompt.upserted',
    'weekly_prompt',
    v_prompt_id::text,
    jsonb_build_object('programId', p_program_id, 'startsOn', v_starts_on)
  );

  return jsonb_build_object(
    'id', v_prompt_id,
    'programId', p_program_id,
    'title', v_title,
    'body', v_body,
    'startsOn', v_starts_on,
    'endsOn', p_ends_on,
    'status', 'active'
  );
end;
$$;

revoke all on function public.get_patient_community_feed(uuid, uuid) from public;
revoke all on function public.submit_patient_community_post(uuid, uuid, text) from public;
revoke all on function public.get_patient_community_comments(uuid) from public;
revoke all on function public.submit_patient_community_comment(uuid, text) from public;
revoke all on function public.report_community_content(text, uuid, text) from public;
revoke all on function public.get_clinic_community_moderation(text, uuid) from public;
revoke all on function public.moderate_community_item(text, uuid, text, text) from public;
revoke all on function public.upsert_weekly_prompt(uuid, uuid, text, text, date, date) from public;

grant execute on function public.get_patient_community_feed(uuid, uuid) to authenticated, service_role;
grant execute on function public.submit_patient_community_post(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.get_patient_community_comments(uuid) to authenticated, service_role;
grant execute on function public.submit_patient_community_comment(uuid, text) to authenticated, service_role;
grant execute on function public.report_community_content(text, uuid, text) to authenticated, service_role;
grant execute on function public.get_clinic_community_moderation(text, uuid) to authenticated, service_role;
grant execute on function public.moderate_community_item(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.upsert_weekly_prompt(uuid, uuid, text, text, date, date) to authenticated, service_role;

comment on function public.get_patient_community_feed(uuid, uuid) is
  'Returns the patient community feed scoped to active program entitlements. Patients without community benefit receive a blocked envelope.';

comment on function public.submit_patient_community_post(uuid, uuid, text) is
  'Creates a program community post from a linked patient/guardian. Moderation is fail-closed unless program config explicitly disables it.';

comment on function public.get_clinic_community_moderation(text, uuid) is
  'Returns moderation cards for users with community.moderate in the active tenant.';

comment on function public.moderate_community_item(text, uuid, text, text) is
  'Approves, rejects, hides, or removes community posts/comments with audit log and patient feedback notifications.';
