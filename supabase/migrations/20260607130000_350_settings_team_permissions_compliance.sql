-- M14: settings, team permissions and operational compliance.
-- Adds audited operational settings contracts without exposing provider secrets.

create table if not exists public.auto_message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  channel text not null default 'chat'
    check (channel in ('chat', 'portal', 'email', 'whatsapp', 'sms')),
  trigger_event text not null default 'after_hours',
  body text not null,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table if not exists public.compliance_gaps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  area text not null,
  severity text not null default 'medium'
    check (severity in ('critical', 'high', 'medium', 'low')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  title text not null,
  description text not null,
  remediation text,
  source text not null default 'system',
  owner_role text,
  due_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

select security.touch_updated_at('public.auto_message_templates');
select security.touch_updated_at('public.compliance_gaps');

create index if not exists idx_auto_message_templates_tenant_enabled
  on public.auto_message_templates(tenant_id, channel, trigger_event, is_enabled, sort_order);

create index if not exists idx_compliance_gaps_tenant_status_severity
  on public.compliance_gaps(tenant_id, status, severity, updated_at desc);

alter table public.auto_message_templates enable row level security;
alter table public.compliance_gaps enable row level security;

drop policy if exists auto_message_templates_read_settings on public.auto_message_templates;
create policy auto_message_templates_read_settings
on public.auto_message_templates for select
to authenticated
using (
  security.has_permission(tenant_id, 'settings.read', true)
  or security.has_permission(tenant_id, 'chat.read', false)
);

drop policy if exists auto_message_templates_write_settings on public.auto_message_templates;
create policy auto_message_templates_write_settings
on public.auto_message_templates for all
to authenticated
using (security.has_permission(tenant_id, 'settings.write', true))
with check (security.has_permission(tenant_id, 'settings.write', true));

drop policy if exists compliance_gaps_read_operational on public.compliance_gaps;
create policy compliance_gaps_read_operational
on public.compliance_gaps for select
to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or security.has_permission(tenant_id, 'compliance.read', true)
  or security.has_permission(tenant_id, 'settings.read', true)
);

drop policy if exists compliance_gaps_write_operational on public.compliance_gaps;
create policy compliance_gaps_write_operational
on public.compliance_gaps for all
to authenticated
using (
  security.is_platform_admin()
  or security.has_permission(tenant_id, 'compliance.write', true)
)
with check (
  security.is_platform_admin()
  or security.has_permission(tenant_id, 'compliance.write', true)
);

grant select on public.auto_message_templates to authenticated, service_role;
grant insert, update, delete on public.auto_message_templates to service_role;
grant select on public.compliance_gaps to authenticated, service_role;
grant insert, update, delete on public.compliance_gaps to service_role;

create or replace function security.seed_m14_settings_rbac(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.permissions (tenant_id, code, description)
  select p_tenant_id, code, description
  from (
    values
      ('settings.integrations.write', 'Change tenant integration switches'),
      ('team.permissions.manage', 'Change member role assignments'),
      ('compliance.read', 'Read operational compliance gaps'),
      ('compliance.write', 'Update operational compliance gaps')
  ) as seed(code, description)
  on conflict (tenant_id, code) do update
  set description = excluded.description,
      updated_at = now();

  insert into public.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant_id, r.id, p.id
  from (
    values
      ('tenant_owner', 'settings.integrations.write'),
      ('tenant_owner', 'team.permissions.manage'),
      ('tenant_owner', 'compliance.read'),
      ('tenant_owner', 'compliance.write'),
      ('clinic_admin', 'settings.integrations.write'),
      ('clinic_admin', 'team.permissions.manage'),
      ('clinic_admin', 'compliance.read'),
      ('clinic_admin', 'compliance.write')
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

create or replace function public.seed_new_tenant_m14_settings_rbac()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  perform security.seed_m14_settings_rbac(new.id);
  return new;
end;
$$;

drop trigger if exists trg_tenants_seed_m14_settings_rbac on public.tenants;
create trigger trg_tenants_seed_m14_settings_rbac
after insert on public.tenants
for each row execute function public.seed_new_tenant_m14_settings_rbac();

select security.seed_m14_settings_rbac(t.id)
from public.tenants t;

revoke all on function security.seed_m14_settings_rbac(uuid) from public;
grant execute on function security.seed_m14_settings_rbac(uuid) to service_role;

create or replace function security.m14_record_compliance_candidate(
  p_tenant_id uuid,
  p_code text,
  p_is_gap boolean,
  p_area text,
  p_severity text,
  p_title text,
  p_description text,
  p_remediation text,
  p_owner_role text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_is_gap then
    insert into public.compliance_gaps (
      tenant_id,
      code,
      area,
      severity,
      status,
      title,
      description,
      remediation,
      source,
      owner_role,
      evidence,
      detected_at
    )
    values (
      p_tenant_id,
      p_code,
      p_area,
      p_severity,
      'open',
      p_title,
      p_description,
      p_remediation,
      'system',
      p_owner_role,
      coalesce(p_evidence, '{}'::jsonb),
      now()
    )
    on conflict (tenant_id, code) do update
    set area = excluded.area,
        severity = excluded.severity,
        title = excluded.title,
        description = excluded.description,
        remediation = excluded.remediation,
        owner_role = excluded.owner_role,
        evidence = excluded.evidence,
        status = case
          when public.compliance_gaps.status in ('acknowledged', 'dismissed')
            then public.compliance_gaps.status
          else 'open'
        end,
        resolved_at = case
          when public.compliance_gaps.status in ('acknowledged', 'dismissed')
            then public.compliance_gaps.resolved_at
          else null
        end,
        resolved_by = case
          when public.compliance_gaps.status in ('acknowledged', 'dismissed')
            then public.compliance_gaps.resolved_by
          else null
        end,
        updated_at = now();
  else
    update public.compliance_gaps
       set status = 'resolved',
           resolved_at = coalesce(resolved_at, now()),
           updated_at = now()
     where tenant_id = p_tenant_id
       and code = p_code
       and status in ('open', 'acknowledged');
  end if;
end;
$$;

revoke all on function security.m14_record_compliance_candidate(uuid, text, boolean, text, text, text, text, text, text, jsonb) from public;
grant execute on function security.m14_record_compliance_candidate(uuid, text, boolean, text, text, text, text, text, text, jsonb) to service_role;

create or replace function security.evaluate_tenant_compliance_gaps(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_settings jsonb := '{}'::jsonb;
  v_chat_enabled boolean := false;
  v_hours_count integer := 0;
  v_auto_reply_count integer := 0;
  v_owner_count integer := 0;
  v_admin_count integer := 0;
  v_template_count integer := 0;
  v_asaas_enabled boolean := false;
  v_asaas_status text := 'not_configured';
  v_d4sign_enabled boolean := false;
  v_d4sign_status text := 'not_configured';
begin
  select coalesce(t.settings, '{}'::jsonb)
    into v_settings
  from public.tenants t
  where t.id = p_tenant_id;

  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;

  v_chat_enabled :=
    case
      when jsonb_typeof(v_settings #> '{portal,chatEnabled}') = 'boolean'
        then (v_settings #>> '{portal,chatEnabled}')::boolean
      else false
    end;

  v_asaas_enabled :=
    case
      when jsonb_typeof(v_settings #> '{integrations,asaas,enabled}') = 'boolean'
        then (v_settings #>> '{integrations,asaas,enabled}')::boolean
      else false
    end;
  v_asaas_status := coalesce(nullif(v_settings #>> '{integrations,asaas,status}', ''), 'not_configured');

  v_d4sign_enabled :=
    case
      when jsonb_typeof(v_settings #> '{integrations,d4sign,enabled}') = 'boolean'
        then (v_settings #>> '{integrations,d4sign,enabled}')::boolean
      else false
    end;
  v_d4sign_status := coalesce(nullif(v_settings #>> '{integrations,d4sign,status}', ''), 'not_configured');

  select count(*)::integer
    into v_hours_count
  from public.chat_service_hours csh
  where csh.tenant_id = p_tenant_id
    and csh.is_enabled = true
    and csh.opens_at < csh.closes_at;

  select count(*)::integer
    into v_auto_reply_count
  from (
    select 1
    from public.chat_service_hours csh
    where csh.tenant_id = p_tenant_id
      and csh.is_enabled = true
      and nullif(btrim(coalesce(csh.auto_reply, '')), '') is not null
    union all
    select 1
    from public.auto_message_templates amt
    where amt.tenant_id = p_tenant_id
      and amt.channel = 'chat'
      and amt.trigger_event = 'after_hours'
      and amt.is_enabled = true
      and nullif(btrim(amt.body), '') is not null
  ) replies;

  select count(*)::integer
    into v_owner_count
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.tenant_id = p_tenant_id
    and tm.status = 'active'
    and tm.role_code = 'tenant_owner'
    and p.is_active = true;

  select count(*)::integer
    into v_admin_count
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.tenant_id = p_tenant_id
    and tm.status = 'active'
    and tm.role_code in ('tenant_owner', 'clinic_admin')
    and p.is_active = true;

  select count(*)::integer
    into v_template_count
  from public.document_templates dt
  where dt.tenant_id = p_tenant_id
    and dt.status = 'active';

  perform security.m14_record_compliance_candidate(
    p_tenant_id,
    'legal.dpo_contact',
    nullif(btrim(coalesce(v_settings #>> '{legal,dpoEmail}', '')), '') is null,
    'legal',
    'high',
    'Contato LGPD ausente',
    'O tenant nao possui contato de encarregado/DPO configurado.',
    'Preencha o e-mail LGPD nas configuracoes legais.',
    'clinic_admin',
    '{}'::jsonb
  );

  perform security.m14_record_compliance_candidate(
    p_tenant_id,
    'legal.privacy_policy',
    nullif(btrim(coalesce(v_settings #>> '{legal,privacyPolicyUrl}', '')), '') is null,
    'legal',
    'medium',
    'Politica de privacidade ausente',
    'O portal nao tem URL de politica de privacidade em tenant settings.',
    'Informe a URL publica da politica de privacidade revisada.',
    'clinic_admin',
    '{}'::jsonb
  );

  perform security.m14_record_compliance_candidate(
    p_tenant_id,
    'chat.service_hours',
    v_chat_enabled and v_hours_count = 0,
    'chat',
    'medium',
    'Horario de chat incompleto',
    'O chat do paciente esta habilitado, mas nao ha horario de atendimento ativo.',
    'Configure pelo menos um dia ativo com horario valido.',
    'clinic_admin',
    jsonb_build_object('chatEnabled', v_chat_enabled)
  );

  perform security.m14_record_compliance_candidate(
    p_tenant_id,
    'chat.after_hours_reply',
    v_chat_enabled and v_auto_reply_count = 0,
    'chat',
    'low',
    'Resposta automatica fora de horario ausente',
    'Mensagens fora do horario nao possuem resposta automatica configurada.',
    'Cadastre uma resposta automatica de chat para fora do horario.',
    'clinic_admin',
    jsonb_build_object('chatEnabled', v_chat_enabled)
  );

  perform security.m14_record_compliance_candidate(
    p_tenant_id,
    'rbac.active_owner',
    v_owner_count = 0,
    'rbac',
    'critical',
    'Tenant sem owner ativo',
    'Nao ha membro tenant_owner ativo para governanca e aprovacao operacional.',
    'Promova ou reative um owner antes de mudancas sensiveis.',
    'tenant_owner',
    jsonb_build_object('activeOwners', v_owner_count)
  );

  perform security.m14_record_compliance_candidate(
    p_tenant_id,
    'team.active_admin',
    v_admin_count = 0,
    'team',
    'high',
    'Tenant sem admin operacional ativo',
    'Nao ha owner ou admin ativo para responder por configuracoes e compliance.',
    'Convide ou reative um administrador do tenant.',
    'tenant_owner',
    jsonb_build_object('activeAdmins', v_admin_count)
  );

  perform security.m14_record_compliance_candidate(
    p_tenant_id,
    'documents.active_templates',
    v_template_count = 0,
    'documents',
    'low',
    'Biblioteca documental sem templates ativos',
    'A clinica nao possui templates documentais ativos para rotinas auditaveis.',
    'Ative ao menos um template revisado em documentos.',
    'clinic_admin',
    jsonb_build_object('activeTemplates', v_template_count)
  );

  perform security.m14_record_compliance_candidate(
    p_tenant_id,
    'integrations.asaas.status',
    v_asaas_enabled and v_asaas_status not in ('enabled', 'active'),
    'integrations',
    'medium',
    'Asaas marcado sem status ativo',
    'A integracao Asaas esta habilitada nas preferencias, mas o status nao esta ativo.',
    'Revise o status operacional antes de depender de cobrancas automatizadas.',
    'clinic_admin',
    jsonb_build_object('enabled', v_asaas_enabled, 'status', v_asaas_status)
  );

  perform security.m14_record_compliance_candidate(
    p_tenant_id,
    'integrations.d4sign.status',
    v_d4sign_enabled and v_d4sign_status not in ('enabled', 'active'),
    'integrations',
    'medium',
    'D4Sign marcado sem status ativo',
    'A integracao D4Sign esta habilitada nas preferencias, mas o status nao esta ativo.',
    'Revise o status operacional antes de enviar documentos para assinatura.',
    'clinic_admin',
    jsonb_build_object('enabled', v_d4sign_enabled, 'status', v_d4sign_status)
  );
end;
$$;

revoke all on function security.evaluate_tenant_compliance_gaps(uuid) from public;
grant execute on function security.evaluate_tenant_compliance_gaps(uuid) to service_role;

insert into public.auto_message_templates (
  tenant_id,
  code,
  name,
  channel,
  trigger_event,
  body,
  is_enabled,
  sort_order,
  metadata
)
select
  t.id,
  'after_hours_chat',
  'Fora do horario',
  'chat',
  'after_hours',
  coalesce(
    (
      select csh.auto_reply
      from public.chat_service_hours csh
      where csh.tenant_id = t.id
        and nullif(btrim(coalesce(csh.auto_reply, '')), '') is not null
      order by csh.weekday asc
      limit 1
    ),
    'Estamos fora do horario de atendimento. Sua mensagem fica registrada e sera respondida no proximo periodo util.'
  ),
  true,
  10,
  jsonb_build_object('seededBy', 'm14')
from public.tenants t
on conflict (tenant_id, code) do nothing;

select security.evaluate_tenant_compliance_gaps(t.id)
from public.tenants t;

create or replace function public.get_clinic_operational_settings_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('settings.read', true);
  v_settings jsonb := '{}'::jsonb;
  v_chat_hours jsonb := '[]'::jsonb;
  v_templates jsonb := '[]'::jsonb;
  v_gaps jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  perform security.evaluate_tenant_compliance_gaps(v_tenant_id);

  select coalesce(t.settings, '{}'::jsonb)
    into v_settings
  from public.tenants t
  where t.id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', csh.id,
        'weekday', csh.weekday,
        'opensAt', to_char(csh.opens_at, 'HH24:MI'),
        'closesAt', to_char(csh.closes_at, 'HH24:MI'),
        'timezone', csh.timezone,
        'autoReply', coalesce(csh.auto_reply, ''),
        'isEnabled', csh.is_enabled,
        'updatedAt', csh.updated_at
      )
      order by csh.weekday asc
    ),
    '[]'::jsonb
  )
    into v_chat_hours
  from public.chat_service_hours csh
  where csh.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', amt.id,
        'code', amt.code,
        'name', amt.name,
        'channel', amt.channel,
        'triggerEvent', amt.trigger_event,
        'body', amt.body,
        'isEnabled', amt.is_enabled,
        'sortOrder', amt.sort_order,
        'updatedAt', amt.updated_at
      )
      order by amt.sort_order asc, amt.name asc
    ),
    '[]'::jsonb
  )
    into v_templates
  from public.auto_message_templates amt
  where amt.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cg.id,
        'code', cg.code,
        'area', cg.area,
        'severity', cg.severity,
        'status', cg.status,
        'title', cg.title,
        'description', cg.description,
        'remediation', cg.remediation,
        'ownerRole', cg.owner_role,
        'dueAt', cg.due_at,
        'detectedAt', cg.detected_at,
        'resolvedAt', cg.resolved_at,
        'updatedAt', cg.updated_at
      )
      order by
        case cg.status when 'open' then 0 when 'acknowledged' then 1 when 'resolved' then 2 else 3 end,
        case cg.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
        cg.updated_at desc
    ),
    '[]'::jsonb
  )
    into v_gaps
  from public.compliance_gaps cg
  where cg.tenant_id = v_tenant_id
    and cg.status <> 'dismissed';

  select jsonb_build_object(
    'open', count(*) filter (where status = 'open'),
    'acknowledged', count(*) filter (where status = 'acknowledged'),
    'resolved', count(*) filter (where status = 'resolved'),
    'criticalOpen', count(*) filter (where status in ('open', 'acknowledged') and severity = 'critical'),
    'lastEvaluatedAt', now()
  )
    into v_summary
  from public.compliance_gaps
  where tenant_id = v_tenant_id
    and status <> 'dismissed';

  return jsonb_build_object(
    'legal', coalesce(v_settings -> 'legal', '{}'::jsonb),
    'chatServiceHours', v_chat_hours,
    'autoMessageTemplates', v_templates,
    'complianceGaps', v_gaps,
    'complianceSummary', v_summary
  );
end;
$$;

create or replace function public.update_clinic_settings(
  p_name text default null,
  p_settings_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := security.resolve_current_tenant('settings.write', true);
  v_patch jsonb := '{}'::jsonb;
  v_integrations jsonb := '{}'::jsonb;
  v_updated_settings jsonb := '{}'::jsonb;
  v_allowed_keys text[] := array[
    'profile',
    'branding',
    'portal',
    'finance',
    'defaultPrograms',
    'integrations',
    'legal'
  ];
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_settings_patch is null or jsonb_typeof(p_settings_patch) <> 'object' then
    raise exception 'invalid_settings_patch' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_settings_patch) as k(key)
    where not (k.key = any(v_allowed_keys))
  ) then
    raise exception 'settings_key_not_allowed' using errcode = '22023';
  end if;

  v_patch := p_settings_patch - 'integrations';

  if p_settings_patch ? 'integrations' then
    if not security.has_tenant_role(v_tenant_id, array['tenant_owner', 'clinic_admin']) then
      raise exception 'integration_settings_admin_required' using errcode = '42501';
    end if;

    if jsonb_typeof(p_settings_patch -> 'integrations') <> 'object' then
      raise exception 'invalid_integrations_settings' using errcode = '22023';
    end if;

    select coalesce(
      jsonb_object_agg(
        item.key,
        jsonb_build_object(
          'enabled',
            case
              when jsonb_typeof(item.value -> 'enabled') = 'boolean'
                then (item.value ->> 'enabled')::boolean
              else false
            end,
          'status',
            case
              when jsonb_typeof(item.value -> 'status') = 'string'
                then item.value ->> 'status'
              else 'not_configured'
            end
        )
      ),
      '{}'::jsonb
    )
      into v_integrations
    from jsonb_each(p_settings_patch -> 'integrations') as item;

    v_patch := v_patch || jsonb_build_object('integrations', v_integrations);
  end if;

  update public.tenants
     set name = coalesce(nullif(btrim(p_name), ''), name),
         settings = coalesce(settings, '{}'::jsonb) || v_patch,
         updated_at = now()
   where id = v_tenant_id
   returning settings
   into v_updated_settings;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'clinic_settings.updated',
    'tenant',
    v_tenant_id::text,
    jsonb_build_object(
      'keys',
        coalesce(
          (select jsonb_agg(key) from jsonb_object_keys(v_patch) as keys(key)),
          '[]'::jsonb
        ),
      'nameProvided', p_name is not null
    )
  );

  if p_settings_patch ? 'integrations' then
    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (
      v_tenant_id,
      v_user_id,
      'clinic_integrations.updated',
      'tenant',
      v_tenant_id::text,
      jsonb_build_object('integrations', v_integrations)
    );
  end if;

  if p_settings_patch ? 'legal' then
    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (
      v_tenant_id,
      v_user_id,
      'clinic_legal_settings.updated',
      'tenant',
      v_tenant_id::text,
      jsonb_build_object(
        'keys',
          coalesce(
            (
              select jsonb_agg(key)
              from jsonb_object_keys(p_settings_patch -> 'legal') as keys(key)
            ),
            '[]'::jsonb
          )
      )
    );
  end if;

  perform security.evaluate_tenant_compliance_gaps(v_tenant_id);

  return jsonb_build_object(
    'tenantId', v_tenant_id,
    'settings', v_updated_settings
  );
end;
$$;

create or replace function public.upsert_chat_service_hours(p_hours jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := security.resolve_current_tenant('settings.write', true);
  v_item jsonb;
  v_weekday integer;
  v_opens time;
  v_closes time;
  v_timezone text;
  v_auto_reply text;
  v_enabled boolean;
  v_enabled_days integer := 0;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_hours is null or jsonb_typeof(p_hours) <> 'array' then
    raise exception 'invalid_hours_payload' using errcode = '22023';
  end if;

  if jsonb_array_length(p_hours) > 7 then
    raise exception 'too_many_service_hours' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_hours)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_service_hour_item' using errcode = '22023';
    end if;

    if coalesce(v_item ->> 'weekday', '') !~ '^[0-6]$' then
      raise exception 'invalid_weekday' using errcode = '22023';
    end if;

    if coalesce(v_item ->> 'opensAt', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(v_item ->> 'closesAt', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'invalid_service_hour_time' using errcode = '22023';
    end if;

    v_weekday := (v_item ->> 'weekday')::integer;
    v_opens := (v_item ->> 'opensAt')::time;
    v_closes := (v_item ->> 'closesAt')::time;
    v_timezone := left(coalesce(nullif(btrim(v_item ->> 'timezone'), ''), 'America/Sao_Paulo'), 80);
    v_auto_reply := nullif(left(btrim(coalesce(v_item ->> 'autoReply', '')), 1000), '');
    v_enabled :=
      case
        when jsonb_typeof(v_item -> 'isEnabled') = 'boolean'
          then (v_item ->> 'isEnabled')::boolean
        else true
      end;

    if v_enabled and v_opens >= v_closes then
      raise exception 'service_hour_opens_before_closes_required' using errcode = '22023';
    end if;

    insert into public.chat_service_hours (
      tenant_id,
      weekday,
      opens_at,
      closes_at,
      timezone,
      auto_reply,
      is_enabled,
      metadata
    )
    values (
      v_tenant_id,
      v_weekday,
      v_opens,
      v_closes,
      v_timezone,
      v_auto_reply,
      v_enabled,
      jsonb_build_object('source', 'clinic_settings_m14')
    )
    on conflict (tenant_id, weekday) do update
    set opens_at = excluded.opens_at,
        closes_at = excluded.closes_at,
        timezone = excluded.timezone,
        auto_reply = excluded.auto_reply,
        is_enabled = excluded.is_enabled,
        metadata = public.chat_service_hours.metadata || excluded.metadata,
        updated_at = now();

    if v_enabled then
      v_enabled_days := v_enabled_days + 1;
    end if;
  end loop;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'clinic_chat_service_hours.updated',
    'chat_service_hours',
    v_tenant_id::text,
    jsonb_build_object('items', jsonb_array_length(p_hours), 'enabledDays', v_enabled_days)
  );

  perform security.evaluate_tenant_compliance_gaps(v_tenant_id);

  return jsonb_build_object('tenantId', v_tenant_id, 'updated', jsonb_array_length(p_hours));
end;
$$;

create or replace function public.upsert_auto_message_template(
  p_template_id uuid default null,
  p_code text default null,
  p_name text default null,
  p_channel text default 'chat',
  p_trigger_event text default 'after_hours',
  p_body text default null,
  p_is_enabled boolean default true,
  p_sort_order integer default 0,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := security.resolve_current_tenant('settings.write', true);
  v_template public.auto_message_templates%rowtype;
  v_name text := left(btrim(coalesce(p_name, '')), 160);
  v_code text := lower(regexp_replace(coalesce(nullif(btrim(p_code), ''), btrim(coalesce(p_name, ''))), '[^a-zA-Z0-9]+', '_', 'g'));
  v_channel text := lower(btrim(coalesce(p_channel, 'chat')));
  v_trigger_event text := lower(regexp_replace(coalesce(nullif(btrim(p_trigger_event), ''), 'after_hours'), '[^a-zA-Z0-9_.-]+', '_', 'g'));
  v_body text := left(btrim(coalesce(p_body, '')), 4000);
  v_sort_order integer := least(greatest(coalesce(p_sort_order, 0), 0), 9999);
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  v_code := trim(both '_' from v_code);
  v_trigger_event := trim(both '_' from v_trigger_event);

  if v_name = '' then
    raise exception 'template_name_required' using errcode = '22023';
  end if;

  if v_code = '' then
    raise exception 'template_code_required' using errcode = '22023';
  end if;

  if v_channel not in ('chat', 'portal', 'email', 'whatsapp', 'sms') then
    raise exception 'invalid_template_channel' using errcode = '22023';
  end if;

  if v_trigger_event = '' then
    raise exception 'template_trigger_required' using errcode = '22023';
  end if;

  if length(v_body) < 8 then
    raise exception 'template_body_too_short' using errcode = '22023';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'invalid_template_metadata' using errcode = '22023';
  end if;

  if p_template_id is null then
    insert into public.auto_message_templates (
      tenant_id,
      code,
      name,
      channel,
      trigger_event,
      body,
      is_enabled,
      sort_order,
      created_by,
      metadata
    )
    values (
      v_tenant_id,
      v_code,
      v_name,
      v_channel,
      v_trigger_event,
      v_body,
      coalesce(p_is_enabled, true),
      v_sort_order,
      v_user_id,
      p_metadata
    )
    returning *
    into v_template;
  else
    update public.auto_message_templates
       set code = v_code,
           name = v_name,
           channel = v_channel,
           trigger_event = v_trigger_event,
           body = v_body,
           is_enabled = coalesce(p_is_enabled, true),
           sort_order = v_sort_order,
           metadata = p_metadata,
           updated_at = now()
     where tenant_id = v_tenant_id
       and id = p_template_id
     returning *
     into v_template;

    if not found then
      raise exception 'template_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'auto_message_template.upserted',
    'auto_message_template',
    v_template.id::text,
    jsonb_build_object(
      'code', v_template.code,
      'channel', v_template.channel,
      'triggerEvent', v_template.trigger_event,
      'enabled', v_template.is_enabled
    )
  );

  perform security.evaluate_tenant_compliance_gaps(v_tenant_id);

  return jsonb_build_object('id', v_template.id, 'code', v_template.code);
end;
$$;

create or replace function public.update_compliance_gap_status(
  p_gap_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_gap public.compliance_gaps%rowtype;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_gap_id is null or v_status = '' then
    raise exception 'gap_and_status_required' using errcode = '22023';
  end if;

  if v_status not in ('open', 'acknowledged', 'resolved', 'dismissed') then
    raise exception 'invalid_compliance_gap_status' using errcode = '22023';
  end if;

  select *
    into v_gap
  from public.compliance_gaps
  where id = p_gap_id
  for update;

  if v_gap.id is null then
    raise exception 'compliance_gap_not_found' using errcode = 'P0002';
  end if;

  if not (
    security.is_platform_admin()
    or security.has_permission(v_gap.tenant_id, 'compliance.write', true)
    or security.has_permission(v_gap.tenant_id, 'settings.write', true)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.compliance_gaps
     set status = v_status,
         resolved_at = case when v_status = 'resolved' then coalesce(resolved_at, now()) else null end,
         resolved_by = case when v_status = 'resolved' then v_user_id else null end,
         metadata = metadata || jsonb_build_object(
           'lastStatusNote', v_note,
           'lastStatusChangedBy', v_user_id,
           'lastStatusChangedAt', now()
         ),
         updated_at = now()
   where id = v_gap.id
   returning *
   into v_gap;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_gap.tenant_id,
    v_user_id,
    'compliance_gap.status_updated',
    'compliance_gap',
    v_gap.id::text,
    jsonb_build_object('code', v_gap.code, 'status', v_status, 'noteProvided', v_note is not null)
  );

  return jsonb_build_object('id', v_gap.id, 'status', v_gap.status);
end;
$$;

create or replace function public.evaluate_compliance_readiness(p_tenant_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_summary jsonb := '{}'::jsonb;
  v_gaps jsonb := '[]'::jsonb;
begin
  if p_tenant_id is null then
    v_tenant_id := security.resolve_current_tenant('compliance.read', true);
  else
    v_tenant_id := p_tenant_id;
    if not (
      security.can_access_platform_operations()
      or security.has_permission(v_tenant_id, 'compliance.read', true)
      or security.has_permission(v_tenant_id, 'settings.read', true)
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  perform security.evaluate_tenant_compliance_gaps(v_tenant_id);

  select jsonb_build_object(
    'open', count(*) filter (where status = 'open'),
    'acknowledged', count(*) filter (where status = 'acknowledged'),
    'resolved', count(*) filter (where status = 'resolved'),
    'criticalOpen', count(*) filter (where status in ('open', 'acknowledged') and severity = 'critical')
  )
    into v_summary
  from public.compliance_gaps
  where tenant_id = v_tenant_id
    and status <> 'dismissed';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'code', code,
        'area', area,
        'severity', severity,
        'status', status,
        'title', title,
        'description', description,
        'remediation', remediation,
        'updatedAt', updated_at
      )
      order by updated_at desc
    ),
    '[]'::jsonb
  )
    into v_gaps
  from public.compliance_gaps
  where tenant_id = v_tenant_id
    and status <> 'dismissed';

  return jsonb_build_object('tenantId', v_tenant_id, 'summary', v_summary, 'gaps', v_gaps);
end;
$$;

create or replace function public.list_platform_compliance_gaps(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_result jsonb := '[]'::jsonb;
  v_tenant record;
begin
  if not security.can_access_platform_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for v_tenant in select id from public.tenants
  loop
    perform security.evaluate_tenant_compliance_gaps(v_tenant.id);
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cg.id,
        'tenantId', cg.tenant_id,
        'tenantName', t.name,
        'code', cg.code,
        'area', cg.area,
        'severity', cg.severity,
        'status', cg.status,
        'title', cg.title,
        'description', cg.description,
        'remediation', cg.remediation,
        'ownerRole', cg.owner_role,
        'detectedAt', cg.detected_at,
        'updatedAt', cg.updated_at
      )
      order by
        case cg.status when 'open' then 0 when 'acknowledged' then 1 else 2 end,
        case cg.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
        cg.updated_at desc
    ),
    '[]'::jsonb
  )
    into v_result
  from (
    select *
    from public.compliance_gaps
    where status in ('open', 'acknowledged')
    order by updated_at desc
    limit v_limit
  ) cg
  join public.tenants t on t.id = cg.tenant_id;

  return v_result;
end;
$$;

create or replace function public.update_clinic_member_role(
  p_membership_id uuid,
  p_role_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.tenant_memberships%rowtype;
  v_role_code text := lower(btrim(coalesce(p_role_code, '')));
  v_owner_count integer;
  v_from_permissions text[] := array[]::text[];
  v_to_permissions text[] := array[]::text[];
  v_added_permissions jsonb := '[]'::jsonb;
  v_removed_permissions jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_membership_id is null or v_role_code = '' then
    raise exception 'membership_and_role_required' using errcode = '22023';
  end if;

  select * into v_membership
  from public.tenant_memberships
  where id = p_membership_id;

  if v_membership.id is null then
    raise exception 'membership_not_found' using errcode = '22023';
  end if;
  if not (
    security.has_permission(v_membership.tenant_id, 'team.permissions.manage', true)
    or security.has_permission(v_membership.tenant_id, 'settings.write', true)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.roles r
    where r.tenant_id = v_membership.tenant_id
      and r.name = v_role_code
  ) then
    raise exception 'role_not_found' using errcode = '22023';
  end if;

  if v_membership.role_code = 'tenant_owner' and v_role_code <> 'tenant_owner' then
    select count(*)::integer into v_owner_count
    from public.tenant_memberships tm
    where tm.tenant_id = v_membership.tenant_id
      and tm.role_code = 'tenant_owner'
      and tm.status = 'active';

    if v_owner_count <= 1 and v_membership.status = 'active' then
      raise exception 'last_owner_cannot_be_demoted' using errcode = '42501';
    end if;
  end if;

  select coalesce(array_agg(p.code order by p.code), array[]::text[])
    into v_from_permissions
  from public.roles r
  join public.role_permissions rp
    on rp.tenant_id = r.tenant_id
   and rp.role_id = r.id
  join public.permissions p
    on p.tenant_id = rp.tenant_id
   and p.id = rp.permission_id
  where r.tenant_id = v_membership.tenant_id
    and r.name = v_membership.role_code;

  select coalesce(array_agg(p.code order by p.code), array[]::text[])
    into v_to_permissions
  from public.roles r
  join public.role_permissions rp
    on rp.tenant_id = r.tenant_id
   and rp.role_id = r.id
  join public.permissions p
    on p.tenant_id = rp.tenant_id
   and p.id = rp.permission_id
  where r.tenant_id = v_membership.tenant_id
    and r.name = v_role_code;

  select coalesce(jsonb_agg(code order by code), '[]'::jsonb)
    into v_added_permissions
  from (
    select unnest(v_to_permissions) as code
    except
    select unnest(v_from_permissions) as code
  ) delta;

  select coalesce(jsonb_agg(code order by code), '[]'::jsonb)
    into v_removed_permissions
  from (
    select unnest(v_from_permissions) as code
    except
    select unnest(v_to_permissions) as code
  ) delta;

  update public.tenant_memberships
     set role_code = v_role_code,
         role = v_role_code,
         updated_at = now()
   where id = v_membership.id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_membership.tenant_id,
    v_user_id,
    'clinic_permissions.role_assignment_updated',
    'tenant_membership',
    v_membership.id::text,
    jsonb_build_object(
      'fromRole', v_membership.role_code,
      'toRole', v_role_code,
      'targetUserId', v_membership.user_id,
      'permissionsAdded', v_added_permissions,
      'permissionsRemoved', v_removed_permissions,
      'addedCount', jsonb_array_length(v_added_permissions),
      'removedCount', jsonb_array_length(v_removed_permissions)
    )
  );

  perform security.evaluate_tenant_compliance_gaps(v_membership.tenant_id);

  return jsonb_build_object(
    'id', v_membership.id,
    'roleCode', v_role_code,
    'status', 'ok',
    'permissionsAdded', v_added_permissions,
    'permissionsRemoved', v_removed_permissions
  );
end;
$$;

revoke all on function public.get_clinic_operational_settings_snapshot() from public;
revoke all on function public.update_clinic_settings(text, jsonb) from public;
revoke all on function public.upsert_chat_service_hours(jsonb) from public;
revoke all on function public.upsert_auto_message_template(uuid, text, text, text, text, text, boolean, integer, jsonb) from public;
revoke all on function public.update_compliance_gap_status(uuid, text, text) from public;
revoke all on function public.evaluate_compliance_readiness(uuid) from public;
revoke all on function public.list_platform_compliance_gaps(integer) from public;
revoke all on function public.update_clinic_member_role(uuid, text) from public;

grant execute on function public.get_clinic_operational_settings_snapshot() to authenticated, service_role;
grant execute on function public.update_clinic_settings(text, jsonb) to authenticated, service_role;
grant execute on function public.upsert_chat_service_hours(jsonb) to authenticated, service_role;
grant execute on function public.upsert_auto_message_template(uuid, text, text, text, text, text, boolean, integer, jsonb) to authenticated, service_role;
grant execute on function public.update_compliance_gap_status(uuid, text, text) to authenticated, service_role;
grant execute on function public.evaluate_compliance_readiness(uuid) to authenticated, service_role;
grant execute on function public.list_platform_compliance_gaps(integer) to authenticated, service_role;
grant execute on function public.update_clinic_member_role(uuid, text) to authenticated, service_role;

comment on function public.get_clinic_operational_settings_snapshot() is 'M14 operational settings snapshot for chat hours, auto messages and compliance gaps.';
comment on function public.upsert_chat_service_hours(jsonb) is 'M14 audited upsert of tenant chat service hours from clinic settings.';
comment on function public.upsert_auto_message_template(uuid, text, text, text, text, text, boolean, integer, jsonb) is 'M14 audited upsert of automatic message templates.';
comment on function public.update_compliance_gap_status(uuid, text, text) is 'M14 audited compliance gap status transition.';
