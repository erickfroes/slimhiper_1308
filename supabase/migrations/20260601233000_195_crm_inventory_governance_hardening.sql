-- Phase 9.5: CRM/inventory governance, retention and hardening helpers.
-- Retention execution is intentionally service-role only; browser clients may
-- read aggregate governance status through RBAC-checked RPCs.

create or replace function public.get_crm_inventory_governance_snapshot(p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_days integer := least(greatest(coalesce(p_days_to_expiry, 30), 0), 365);
  v_can_crm boolean := false;
  v_can_inventory boolean := false;
  v_crm jsonb := '{}'::jsonb;
  v_inventory jsonb := '{}'::jsonb;
begin
  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_crm := security.has_permission(v_tenant_id, 'crm.read', false);
  v_can_inventory := security.has_permission(v_tenant_id, 'inventory.read', false);

  if v_can_crm then
    select jsonb_build_object(
      'openLeads', count(*) filter (where l.status = 'open'),
      'convertedLeads', count(*) filter (where l.status = 'converted'),
      'optedOutLeads', count(*) filter (where l.opt_out_at is not null or l.contact_consent = false),
      'retentionDueLeads', count(*) filter (where l.status <> 'converted' and l.retention_expires_at is not null and l.retention_expires_at <= now()),
      'retentionDueWithAttachments', count(*) filter (
        where l.status <> 'converted'
          and l.retention_expires_at is not null
          and l.retention_expires_at <= now()
          and exists (
            select 1 from public.crm_lead_attachments a
            where a.tenant_id = l.tenant_id and a.lead_id = l.id
          )
      )
    ) into v_crm
    from public.crm_leads l
    where l.tenant_id = v_tenant_id
      and public.has_unit_access(l.tenant_id, l.unit_id);
  end if;

  if v_can_inventory then
    select jsonb_build_object(
      'expiredActiveLots', count(*) filter (where l.expires_at < current_date and coalesce(s.quantity_on_hand, 0) > 0),
      'expiringLots', count(*) filter (where l.expires_at >= current_date and l.expires_at <= current_date + (v_days || ' days')::interval and coalesce(s.quantity_on_hand, 0) > 0),
      'negativeSnapshots', count(*) filter (where coalesce(s.quantity_on_hand, 0) < 0),
      'sensitiveMovementsWithoutReasonNote', (
        select count(*)
        from public.inventory_movements m
        left join public.inventory_locations ml on ml.tenant_id = m.tenant_id and ml.id = m.location_id
        where m.tenant_id = v_tenant_id
          and m.reason in ('loss', 'adjustment', 'transfer_in', 'transfer_out')
          and nullif(trim(m.metadata->>'reasonNote'), '') is null
          and public.has_unit_access(m.tenant_id, ml.unit_id)
      )
    ) into v_inventory
    from public.inventory_lots l
    join public.inventory_items i on i.tenant_id = l.tenant_id and i.id = l.item_id
    left join public.inventory_locations loc on loc.tenant_id = l.tenant_id and loc.id = l.location_id
    left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
    where l.tenant_id = v_tenant_id
      and l.status = 'active'
      and public.has_unit_access(l.tenant_id, loc.unit_id);
  end if;

  return jsonb_build_object(
    'crm', coalesce(v_crm, '{}'::jsonb) || jsonb_build_object('canRead', v_can_crm),
    'inventory', coalesce(v_inventory, '{}'::jsonb) || jsonb_build_object('canRead', v_can_inventory, 'daysToExpiry', v_days)
  );
end;
$$;

create or replace function public.expire_crm_leads_for_retention(p_execute boolean default false, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_candidates integer := 0;
  v_redacted integer := 0;
  v_attachment_refs integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  with candidates as (
    select l.id, l.tenant_id
    from public.crm_leads l
    where l.status <> 'converted'
      and l.retention_expires_at is not null
      and l.retention_expires_at <= now()
    order by l.retention_expires_at asc, l.created_at asc
    limit v_limit
  )
  select count(*)::integer into v_candidates from candidates;

  select count(*)::integer into v_attachment_refs
  from public.crm_lead_attachments a
  join public.crm_leads l on l.tenant_id = a.tenant_id and l.id = a.lead_id
  where l.status <> 'converted'
    and l.retention_expires_at is not null
    and l.retention_expires_at <= now();

  if p_execute then
    with candidates as (
      select l.id, l.tenant_id
      from public.crm_leads l
      where l.status <> 'converted'
        and l.retention_expires_at is not null
        and l.retention_expires_at <= now()
      order by l.retention_expires_at asc, l.created_at asc
      limit v_limit
    ), redacted as (
      update public.crm_leads l
      set full_name = 'Lead anonimizado',
          email = 'anon+' || l.id::text || '@retention.local',
          phone = null,
          contact_preference = 'none',
          contact_consent = false,
          opt_out_at = coalesce(l.opt_out_at, now()),
          status = 'archived',
          lost_reason = coalesce(l.lost_reason, 'retention_expired'),
          next_follow_up_at = null,
          metadata = l.metadata || jsonb_build_object('retentionRedactedAt', now(), 'retentionRedaction', 'crm_lead_pii_minimized'),
          updated_at = now()
      from candidates c
      where l.tenant_id = c.tenant_id and l.id = c.id
      returning l.id, l.tenant_id
    ), activity_redaction as (
      update public.crm_lead_activities a
      set description = null,
          metadata = a.metadata || jsonb_build_object('retentionRedactedAt', now())
      from redacted r
      where a.tenant_id = r.tenant_id and a.lead_id = r.id
      returning a.id
    ), task_redaction as (
      update public.crm_lead_tasks t
      set metadata = t.metadata || jsonb_build_object('retentionRedactedAt', now()),
          updated_at = now()
      from redacted r
      where t.tenant_id = r.tenant_id and t.lead_id = r.id
      returning t.id
    ), attachment_markers as (
      update public.crm_lead_attachments a
      set metadata = a.metadata || jsonb_build_object('retentionDeleteRequired', true, 'retentionMarkedAt', now())
      from redacted r
      where a.tenant_id = r.tenant_id and a.lead_id = r.id
      returning a.id
    ), audit_insert as (
      insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
      select r.tenant_id,
             null,
             'crm_lead.retention_redacted',
             'crm_lead',
             r.id::text,
             jsonb_build_object('attachmentDeleteRequired', exists (
               select 1 from public.crm_lead_attachments a where a.tenant_id = r.tenant_id and a.lead_id = r.id
             ))
      from redacted r
      returning id
    )
    select count(*)::integer into v_redacted from redacted;
  end if;

  return jsonb_build_object(
    'execute', p_execute,
    'candidateLeads', v_candidates,
    'redactedLeads', v_redacted,
    'attachmentReferencesRequiringDeletion', v_attachment_refs,
    'limit', v_limit
  );
end;
$$;

revoke all on function public.get_crm_inventory_governance_snapshot(integer) from public;
revoke all on function public.expire_crm_leads_for_retention(boolean, integer) from public;

grant execute on function public.get_crm_inventory_governance_snapshot(integer) to authenticated, service_role;
grant execute on function public.expire_crm_leads_for_retention(boolean, integer) to service_role;

comment on function public.get_crm_inventory_governance_snapshot(integer) is 'Returns aggregate CRM retention and inventory hardening indicators without exposing lead PII or restricted cost data.';
comment on function public.expire_crm_leads_for_retention(boolean, integer) is 'Service-role retention helper for expired non-converted CRM leads; dry-run by default and redacts PII only when explicitly executed.';
