-- M13: finance receipts, recurrence, refunds and active reconciliation.
-- Provider calls remain behind Edge Functions. Payment receipt files stay private.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.map_billing_status_to_invoice_status(
  p_status text,
  p_due_date date,
  p_paid_at timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_status, '')) in ('refunded', 'refund_requested', 'chargeback')
      then 'cancelado'
    when p_paid_at is not null
      or lower(coalesce(p_status, '')) in ('paid', 'pago', 'received', 'confirmed', 'payment_received', 'payment_confirmed')
      then 'pago'
    when lower(coalesce(p_status, '')) in ('cancelled', 'canceled', 'cancelado', 'payment_cancelled', 'payment_deleted')
      then 'cancelado'
    when lower(coalesce(p_status, '')) in ('overdue', 'vencido', 'payment_overdue')
      or (p_due_date < current_date and p_paid_at is null and lower(coalesce(p_status, '')) not in ('cancelled', 'canceled', 'cancelado', 'refunded'))
      then 'vencido'
    else 'pendente'
  end;
$$;

create table if not exists public.billing_external_references (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  reference text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id),
  unique (reference),
  constraint billing_external_references_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  patient_invoice_id uuid,
  payment_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending_upload'
    check (status in ('pending_upload', 'pending_review', 'approved', 'rejected', 'failed', 'deleted')),
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_by_role text not null default 'patient' check (submitted_by_role in ('patient', 'guardian', 'staff')),
  submitted_at timestamptz not null default now(),
  uploaded_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  rejection_reason text,
  storage_bucket text not null default 'payment-receipts' check (storage_bucket = 'payment-receipts'),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (storage_bucket, storage_path),
  constraint payment_receipts_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint payment_receipts_invoice_same_tenant
    foreign key (tenant_id, patient_invoice_id)
    references public.patient_invoices(tenant_id, id)
    on delete set null,
  constraint payment_receipts_payment_same_tenant
    foreign key (tenant_id, payment_id)
    references public.payments(tenant_id, id)
    on delete set null
);

create table if not exists public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  patient_invoice_id uuid,
  payment_id uuid,
  provider text not null default 'asaas' check (provider = 'asaas'),
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'succeeded', 'failed', 'cancelled')),
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  provider_refund_id text,
  provider_status text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint billing_refunds_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint billing_refunds_invoice_same_tenant
    foreign key (tenant_id, patient_invoice_id)
    references public.patient_invoices(tenant_id, id)
    on delete set null,
  constraint billing_refunds_payment_same_tenant
    foreign key (tenant_id, payment_id)
    references public.payments(tenant_id, id)
    on delete set null
);

create table if not exists public.billing_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_invoice_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed', 'skipped')),
  source text not null default 'manual' check (source in ('manual', 'cron', 'edge')),
  reason text not null,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, id),
  constraint billing_sync_jobs_invoice_same_tenant
    foreign key (tenant_id, patient_invoice_id)
    references public.patient_invoices(tenant_id, id)
    on delete cascade
);

create table if not exists public.billing_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null default 'cron' check (source in ('manual', 'cron', 'edge')),
  status text not null default 'completed' check (status in ('completed', 'failed')),
  checked_invoice_count integer not null default 0 check (checked_invoice_count >= 0),
  queued_sync_count integer not null default 0 check (queued_sync_count >= 0),
  pending_receipt_count integer not null default 0 check (pending_receipt_count >= 0),
  divergence_count integer not null default 0 check (divergence_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now()
);

select security.touch_updated_at('public.billing_external_references');
select security.touch_updated_at('public.payment_receipts');
select security.touch_updated_at('public.billing_refunds');

create index if not exists idx_payment_receipts_tenant_status
  on public.payment_receipts(tenant_id, status, submitted_at desc);
create index if not exists idx_payment_receipts_patient
  on public.payment_receipts(tenant_id, patient_id, submitted_at desc);
create index if not exists idx_payment_receipts_invoice
  on public.payment_receipts(tenant_id, patient_invoice_id)
  where patient_invoice_id is not null;
create index if not exists idx_billing_refunds_tenant_status
  on public.billing_refunds(tenant_id, status, requested_at desc);
create index if not exists idx_billing_refunds_payment
  on public.billing_refunds(tenant_id, payment_id)
  where payment_id is not null;
create index if not exists idx_billing_sync_jobs_tenant_status
  on public.billing_sync_jobs(tenant_id, status, requested_at desc);
create unique index if not exists idx_payments_payment_receipt_unique
  on public.payments((metadata ->> 'payment_receipt_id'))
  where metadata ? 'payment_receipt_id';

alter table public.billing_external_references enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.billing_refunds enable row level security;
alter table public.billing_sync_jobs enable row level security;
alter table public.billing_reconciliation_runs enable row level security;

drop policy if exists billing_external_references_select_financial_read on public.billing_external_references;
create policy billing_external_references_select_financial_read
on public.billing_external_references for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'financial.read'));

drop policy if exists payment_receipts_select_financial_read on public.payment_receipts;
create policy payment_receipts_select_financial_read
on public.payment_receipts for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'financial.read'));

drop policy if exists payment_receipts_select_patient_portal on public.payment_receipts;
create policy payment_receipts_select_patient_portal
on public.payment_receipts for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists billing_refunds_select_financial_read on public.billing_refunds;
create policy billing_refunds_select_financial_read
on public.billing_refunds for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'financial.read'));

drop policy if exists billing_refunds_select_patient_portal on public.billing_refunds;
create policy billing_refunds_select_patient_portal
on public.billing_refunds for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists billing_sync_jobs_select_financial_read on public.billing_sync_jobs;
create policy billing_sync_jobs_select_financial_read
on public.billing_sync_jobs for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'financial.read'));

drop policy if exists billing_reconciliation_runs_select_financial_read on public.billing_reconciliation_runs;
create policy billing_reconciliation_runs_select_financial_read
on public.billing_reconciliation_runs for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'financial.read'));

grant select on public.billing_external_references to authenticated;
grant select on public.payment_receipts to authenticated;
grant select on public.billing_refunds to authenticated;
grant select on public.billing_sync_jobs to authenticated;
grant select on public.billing_reconciliation_runs to authenticated;
grant all on public.billing_external_references to service_role;
grant all on public.payment_receipts to service_role;
grant all on public.billing_refunds to service_role;
grant all on public.billing_sync_jobs to service_role;
grant all on public.billing_reconciliation_runs to service_role;

create or replace function security.is_valid_payment_receipt_path(p_object_name text)
returns boolean
language sql
stable
as $$
  select
    p_object_name is not null
    and array_length(string_to_array(p_object_name, '/'), 1) = 4
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 1))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 2))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 3))
    and nullif(split_part(p_object_name, '/', 4), '') is not null
    and split_part(p_object_name, '/', 4) !~ '[\\/]';
$$;

create or replace function security.clean_financial_text(p_value text, p_max_length integer)
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

revoke all on function security.is_valid_payment_receipt_path(text) from public;
revoke all on function security.clean_financial_text(text, integer) from public;
grant execute on function security.is_valid_payment_receipt_path(text) to authenticated, service_role;
grant execute on function security.clean_financial_text(text, integer) to authenticated, service_role;

drop policy if exists "payment_receipts_storage_select" on storage.objects;
create policy "payment_receipts_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and security.is_valid_payment_receipt_path(name)
  and exists (
    select 1
    from public.payment_receipts pr
    where pr.storage_bucket = bucket_id
      and pr.storage_path = name
      and pr.status in ('pending_review', 'approved', 'rejected')
      and (
        public.has_clinical_permission(pr.tenant_id, 'financial.read')
        or public.can_access_patient_portal_patient(pr.tenant_id, pr.patient_id)
      )
  )
);

drop policy if exists "payment_receipts_storage_insert" on storage.objects;
create policy "payment_receipts_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-receipts'
  and security.is_valid_payment_receipt_path(name)
  and exists (
    select 1
    from public.payment_receipts pr
    where pr.storage_bucket = bucket_id
      and pr.storage_path = name
      and pr.status = 'pending_upload'
      and (
        public.has_clinical_permission(pr.tenant_id, 'financial.write')
        or public.can_access_patient_portal_patient(pr.tenant_id, pr.patient_id)
      )
  )
);

drop policy if exists "payment_receipts_storage_update" on storage.objects;
create policy "payment_receipts_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'payment-receipts'
  and security.is_valid_payment_receipt_path(name)
  and exists (
    select 1
    from public.payment_receipts pr
    where pr.storage_bucket = bucket_id
      and pr.storage_path = name
      and pr.status in ('pending_upload', 'pending_review')
      and (
        public.has_clinical_permission(pr.tenant_id, 'financial.write')
        or public.can_access_patient_portal_patient(pr.tenant_id, pr.patient_id)
      )
  )
)
with check (
  bucket_id = 'payment-receipts'
  and security.is_valid_payment_receipt_path(name)
);

create or replace function public.prepare_payment_receipt_upload(
  p_patient_id uuid,
  p_invoice_id uuid default null,
  p_amount_cents integer default null,
  p_file_name text default 'comprovante.pdf',
  p_mime_type text default 'application/pdf',
  p_size_bytes integer default 0,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, storage, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_patient_id uuid;
  v_invoice public.patient_invoices%rowtype;
  v_amount_cents integer := coalesce(p_amount_cents, 0);
  v_receipt_id uuid := gen_random_uuid();
  v_file_name text := left(regexp_replace(coalesce(nullif(btrim(p_file_name), ''), 'comprovante.pdf'), '[^a-zA-Z0-9._-]+', '-', 'g'), 120);
  v_mime_type text := lower(coalesce(p_mime_type, ''));
  v_storage_path text;
  v_role text := 'patient';
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf') then
    raise exception 'invalid_payment_receipt_type' using errcode = '22023';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'invalid_payment_receipt_size' using errcode = '22023';
  end if;

  select p.tenant_id, p.id
  into v_tenant_id, v_patient_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;

  if public.has_clinical_permission(v_tenant_id, 'financial.write') then
    v_role := 'staff';
  else
    select r.tenant_id, r.patient_id, r.linkage_type
    into v_tenant_id, v_patient_id, v_role
    from security.resolve_patient_portal_link(p_patient_id) r;

    if v_tenant_id is null or v_patient_id is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if p_invoice_id is not null then
    select * into v_invoice
    from public.patient_invoices pi
    where pi.tenant_id = v_tenant_id
      and pi.patient_id = v_patient_id
      and pi.id = p_invoice_id;

    if v_invoice.id is null then
      raise exception 'invoice_not_found' using errcode = '22023';
    end if;

    v_amount_cents := coalesce(nullif(v_amount_cents, 0), v_invoice.amount_cents);
  end if;

  if v_amount_cents <= 0 then
    raise exception 'amount_required' using errcode = '22023';
  end if;

  v_file_name := coalesce(nullif(trim(both '-' from v_file_name), ''), 'comprovante.pdf');
  v_storage_path := v_tenant_id::text || '/' || v_patient_id::text || '/' ||
                    v_receipt_id::text || '/' || v_file_name;

  insert into public.payment_receipts (
    id, tenant_id, patient_id, patient_invoice_id, amount_cents, status,
    submitted_by, submitted_by_role, storage_bucket, storage_path,
    file_name, mime_type, size_bytes, metadata
  )
  values (
    v_receipt_id, v_tenant_id, v_patient_id, p_invoice_id, v_amount_cents, 'pending_upload',
    v_user_id, v_role, 'payment-receipts', v_storage_path,
    v_file_name, v_mime_type, p_size_bytes,
    jsonb_build_object('note', security.clean_financial_text(p_note, 500))
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'payment_receipt.prepared',
    'payment_receipt',
    v_receipt_id::text,
    jsonb_build_object('patientId', v_patient_id, 'invoiceId', p_invoice_id, 'role', v_role)
  );

  return jsonb_build_object(
    'id', v_receipt_id,
    'bucket', 'payment-receipts',
    'path', v_storage_path,
    'fileName', v_file_name,
    'mimeType', v_mime_type,
    'sizeBytes', p_size_bytes,
    'status', 'pending_upload'
  );
end;
$$;

create or replace function public.complete_payment_receipt_upload(
  p_receipt_id uuid,
  p_status text default 'pending_review'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, storage, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := lower(coalesce(p_status, 'pending_review'));
  v_receipt public.payment_receipts%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if v_status not in ('pending_review', 'failed') then
    raise exception 'invalid_payment_receipt_status' using errcode = '22023';
  end if;

  select * into v_receipt
  from public.payment_receipts pr
  where pr.id = p_receipt_id;

  if v_receipt.id is null then
    raise exception 'payment_receipt_not_found' using errcode = '22023';
  end if;

  if not public.has_clinical_permission(v_receipt.tenant_id, 'financial.write')
     and not public.can_access_patient_portal_patient(v_receipt.tenant_id, v_receipt.patient_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_status = 'pending_review' and not exists (
    select 1
    from storage.objects o
    where o.bucket_id = v_receipt.storage_bucket
      and o.name = v_receipt.storage_path
  ) then
    raise exception 'payment_receipt_object_not_found' using errcode = '22023';
  end if;

  update public.payment_receipts
  set status = v_status,
      uploaded_at = case when v_status = 'pending_review' then now() else uploaded_at end,
      metadata = metadata || jsonb_build_object('uploadCompletedAt', case when v_status = 'pending_review' then now() else null end)
  where id = v_receipt.id
  returning * into v_receipt;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_receipt.tenant_id,
    v_user_id,
    'payment_receipt.upload_' || case when v_status = 'pending_review' then 'completed' else 'failed' end,
    'payment_receipt',
    v_receipt.id::text,
    jsonb_build_object('patientId', v_receipt.patient_id, 'invoiceId', v_receipt.patient_invoice_id)
  );

  if v_status = 'pending_review' then
    insert into public.patient_timeline_events (
      tenant_id, patient_id, event_type, category, title, description, status, status_label, event_at, payload
    )
    values (
      v_receipt.tenant_id,
      v_receipt.patient_id,
      'pagamento',
      'financial',
      'Comprovante enviado',
      'Comprovante de pagamento aguardando analise financeira.',
      'recorded',
      'pendente',
      now(),
      jsonb_build_object('paymentReceiptId', v_receipt.id, 'invoiceId', v_receipt.patient_invoice_id)
    );

    insert into public.notifications (tenant_id, patient_id, title, body, category, status, metadata)
    values (
      v_receipt.tenant_id,
      v_receipt.patient_id,
      'Comprovante enviado',
      'Um comprovante de pagamento foi enviado e aguarda analise financeira.',
      'financeiro',
      'unread',
      jsonb_build_object('paymentReceiptId', v_receipt.id, 'href', '/clinic/financeiro')
    );
  end if;

  return jsonb_build_object('id', v_receipt.id, 'status', v_receipt.status);
end;
$$;

create or replace function public.review_payment_receipt(
  p_receipt_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_decision text := lower(coalesce(p_decision, ''));
  v_reason text := security.clean_financial_text(p_reason, 500);
  v_receipt public.payment_receipts%rowtype;
  v_payment_id uuid;
  v_invoice public.patient_invoices%rowtype;
  v_receipt_number text;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if v_decision not in ('approve', 'approved', 'reject', 'rejected') then
    raise exception 'invalid_review_decision' using errcode = '22023';
  end if;

  select * into v_receipt
  from public.payment_receipts pr
  where pr.id = p_receipt_id
  for update;

  if v_receipt.id is null then
    raise exception 'payment_receipt_not_found' using errcode = '22023';
  end if;

  if not public.has_clinical_permission(v_receipt.tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_decision in ('reject', 'rejected') and v_reason is null then
    raise exception 'review_reason_required' using errcode = '22023';
  end if;

  if v_decision in ('approve', 'approved') then
    if v_receipt.payment_id is not null then
      v_payment_id := v_receipt.payment_id;
    else
      select p.id into v_payment_id
      from public.payments p
      where p.tenant_id = v_receipt.tenant_id
        and p.metadata ->> 'payment_receipt_id' = v_receipt.id::text
      limit 1;
    end if;

    if v_payment_id is null then
      insert into public.payments (
        tenant_id, patient_id, patient_invoice_id, status, amount_cents,
        paid_at, due_date, method, metadata
      )
      values (
        v_receipt.tenant_id,
        v_receipt.patient_id,
        v_receipt.patient_invoice_id,
        'paid',
        v_receipt.amount_cents,
        now(),
        null,
        'comprovante',
        jsonb_build_object('source', 'payment_receipt', 'payment_receipt_id', v_receipt.id)
      )
      returning id into v_payment_id;
    end if;

    if v_receipt.patient_invoice_id is not null then
      select * into v_invoice
      from public.patient_invoices
      where tenant_id = v_receipt.tenant_id
        and id = v_receipt.patient_invoice_id
      for update;

      update public.patient_invoices
      set status = 'paid',
          paid_at = coalesce(paid_at, now()),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('approvedPaymentReceiptId', v_receipt.id)
      where tenant_id = v_receipt.tenant_id
        and id = v_receipt.patient_invoice_id;
    end if;

    update public.payment_receipts
    set status = 'approved',
        payment_id = v_payment_id,
        reviewed_by = v_user_id,
        reviewed_at = now(),
        review_note = v_reason,
        rejection_reason = null
    where id = v_receipt.id
    returning * into v_receipt;

    if not exists (
      select 1
      from public.patient_receipts pr
      where pr.tenant_id = v_receipt.tenant_id
        and pr.payment_id = v_payment_id
    ) then
      v_receipt_number := 'REC-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || left(replace(v_receipt.id::text, '-', ''), 6);

      insert into public.patient_receipts (
        tenant_id, patient_id, payment_id, receipt_number, description,
        amount_cents, issued_by, payment_date, metadata
      )
      values (
        v_receipt.tenant_id,
        v_receipt.patient_id,
        v_payment_id,
        v_receipt_number,
        'Recibo gerado apos aprovacao de comprovante',
        v_receipt.amount_cents,
        v_user_id,
        current_date,
        jsonb_build_object('source', 'payment_receipt', 'paymentReceiptId', v_receipt.id)
      );
    end if;

    insert into public.patient_timeline_events (
      tenant_id, patient_id, event_type, category, title, description, status, status_label, event_at, payload
    )
    values (
      v_receipt.tenant_id,
      v_receipt.patient_id,
      'pagamento_recebido',
      'financial',
      'Comprovante aprovado',
      'Pagamento aprovado pela equipe financeira.',
      'recorded',
      'pago',
      now(),
      jsonb_build_object('paymentReceiptId', v_receipt.id, 'paymentId', v_payment_id, 'invoiceId', v_receipt.patient_invoice_id)
    );

    insert into public.notifications (tenant_id, patient_id, title, body, category, status, metadata)
    values (
      v_receipt.tenant_id,
      v_receipt.patient_id,
      'Comprovante aprovado',
      'Seu comprovante foi aprovado e o pagamento foi registrado.',
      'financeiro',
      'unread',
      jsonb_build_object('paymentReceiptId', v_receipt.id)
    );
  else
    update public.payment_receipts
    set status = 'rejected',
        reviewed_by = v_user_id,
        reviewed_at = now(),
        review_note = v_reason,
        rejection_reason = v_reason
    where id = v_receipt.id
    returning * into v_receipt;

    insert into public.patient_timeline_events (
      tenant_id, patient_id, event_type, category, title, description, status, status_label, event_at, payload
    )
    values (
      v_receipt.tenant_id,
      v_receipt.patient_id,
      'pagamento',
      'financial',
      'Comprovante rejeitado',
      'Comprovante de pagamento rejeitado pela equipe financeira.',
      'recorded',
      'rejeitado',
      now(),
      jsonb_build_object('paymentReceiptId', v_receipt.id, 'invoiceId', v_receipt.patient_invoice_id)
    );

    insert into public.notifications (tenant_id, patient_id, title, body, category, status, metadata)
    values (
      v_receipt.tenant_id,
      v_receipt.patient_id,
      'Comprovante rejeitado',
      coalesce(v_reason, 'Revise o comprovante enviado e tente novamente.'),
      'financeiro',
      'unread',
      jsonb_build_object('paymentReceiptId', v_receipt.id)
    );
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_receipt.tenant_id,
    v_user_id,
    'payment_receipt.' || case when v_receipt.status = 'approved' then 'approved' else 'rejected' end,
    'payment_receipt',
    v_receipt.id::text,
    jsonb_build_object('patientId', v_receipt.patient_id, 'invoiceId', v_receipt.patient_invoice_id, 'paymentId', v_payment_id)
  );

  return jsonb_build_object(
    'id', v_receipt.id,
    'status', v_receipt.status,
    'paymentId', v_receipt.payment_id,
    'reviewedAt', v_receipt.reviewed_at
  );
end;
$$;

create or replace function public.get_payment_receipt_download(
  p_receipt_id uuid,
  p_expires_in integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_receipt public.payment_receipts%rowtype;
  v_expires integer := greatest(60, least(coalesce(p_expires_in, 300), 600));
begin
  select * into v_receipt
  from public.payment_receipts pr
  where pr.id = p_receipt_id;

  if v_receipt.id is null or v_receipt.status not in ('pending_review', 'approved', 'rejected') then
    raise exception 'payment_receipt_not_found' using errcode = '22023';
  end if;

  if not public.has_clinical_permission(v_receipt.tenant_id, 'financial.read')
     and not public.can_access_patient_portal_patient(v_receipt.tenant_id, v_receipt.patient_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'bucket', v_receipt.storage_bucket,
    'path', v_receipt.storage_path,
    'fileName', v_receipt.file_name,
    'mimeType', v_receipt.mime_type,
    'expiresInSeconds', v_expires
  );
end;
$$;

create or replace function public.get_patient_finance_m13(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid := p_patient_id;
  v_can_financial boolean := false;
  v_payment_receipts jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_refunds jsonb := '[]'::jsonb;
begin
  select p.tenant_id into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;

  v_can_financial := public.has_clinical_permission(v_tenant_id, 'financial.read');
  if not v_can_financial and not public.can_access_patient_portal_patient(v_tenant_id, v_patient_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'invoiceId', pr.patient_invoice_id,
    'paymentId', pr.payment_id,
    'amountCents', pr.amount_cents,
    'status', pr.status,
    'submittedAt', pr.submitted_at,
    'uploadedAt', pr.uploaded_at,
    'reviewedAt', pr.reviewed_at,
    'reviewNote', case when v_can_financial then pr.review_note else null end,
    'rejectionReason', pr.rejection_reason,
    'fileName', pr.file_name,
    'mimeType', pr.mime_type,
    'sizeBytes', pr.size_bytes
  ) order by pr.submitted_at desc), '[]'::jsonb)
  into v_payment_receipts
  from public.payment_receipts pr
  where pr.tenant_id = v_tenant_id
    and pr.patient_id = v_patient_id
    and pr.status <> 'deleted';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ps.id,
    'status', ps.status,
    'cycle', ps.cycle,
    'amountCents', ps.amount_cents,
    'nextDueDate', ps.next_due_date,
    'description', ps.metadata ->> 'description',
    'createdAt', ps.created_at
  ) order by ps.next_due_date asc nulls last, ps.created_at desc), '[]'::jsonb)
  into v_subscriptions
  from public.patient_subscriptions ps
  where ps.tenant_id = v_tenant_id
    and ps.patient_id = v_patient_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', br.id,
    'invoiceId', br.patient_invoice_id,
    'paymentId', br.payment_id,
    'status', br.status,
    'amountCents', br.amount_cents,
    'reason', br.reason,
    'requestedAt', br.requested_at,
    'processedAt', br.processed_at
  ) order by br.requested_at desc), '[]'::jsonb)
  into v_refunds
  from public.billing_refunds br
  where br.tenant_id = v_tenant_id
    and br.patient_id = v_patient_id;

  return jsonb_build_object(
    'paymentReceipts', v_payment_receipts,
    'subscriptions', v_subscriptions,
    'refunds', v_refunds
  );
end;
$$;

create or replace function public.get_clinic_finance_m13_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_receipt_queue jsonb := '[]'::jsonb;
  v_recurrence jsonb := '{}'::jsonb;
  v_refunds jsonb := '[]'::jsonb;
  v_sync_jobs jsonb := '[]'::jsonb;
  v_last_run jsonb := null;
begin
  select coalesce(
    (
      select p.active_tenant_id
      from public.profiles p
      where p.id = v_user_id
        and p.active_tenant_id is not null
        and security.is_tenant_member(p.active_tenant_id)
      limit 1
    ),
    (
      select tm.tenant_id
      from public.tenant_memberships tm
      where tm.user_id = v_user_id
        and tm.status = 'active'
      order by tm.created_at asc
      limit 1
    )
  )
  into v_tenant_id;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'financial.read', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'patientId', pr.patient_id,
    'patientName', coalesce(nullif(p.preferred_name, ''), pii.full_name, 'Paciente'),
    'invoiceId', pr.patient_invoice_id,
    'amountCents', pr.amount_cents,
    'status', pr.status,
    'submittedAt', pr.submitted_at,
    'fileName', pr.file_name,
    'mimeType', pr.mime_type,
    'sizeBytes', pr.size_bytes
  ) order by pr.submitted_at asc), '[]'::jsonb)
  into v_receipt_queue
  from (
    select *
    from public.payment_receipts pr
    where pr.tenant_id = v_tenant_id
      and pr.status = 'pending_review'
    order by pr.submitted_at asc
    limit 30
  ) pr
  join public.patients p on p.tenant_id = pr.tenant_id and p.id = pr.patient_id
  left join public.patient_pii pii on pii.tenant_id = pr.tenant_id and pii.patient_id = pr.patient_id;

  with subscription_rows as (
    select *
    from public.patient_subscriptions ps
    where ps.tenant_id = v_tenant_id
  ), upcoming as (
    select
      ps.id,
      ps.patient_id,
      coalesce(nullif(p.preferred_name, ''), pii.full_name, 'Paciente') as patient_name,
      ps.status,
      ps.cycle,
      ps.amount_cents,
      ps.next_due_date,
      ps.metadata ->> 'description' as description
    from subscription_rows ps
    join public.patients p on p.tenant_id = ps.tenant_id and p.id = ps.patient_id
    left join public.patient_pii pii on pii.tenant_id = ps.tenant_id and pii.patient_id = ps.patient_id
    where ps.status in ('active', 'paused')
    order by ps.next_due_date asc nulls last, ps.created_at desc
    limit 12
  )
  select jsonb_build_object(
    'active', count(*) filter (where sr.status = 'active'),
    'paused', count(*) filter (where sr.status = 'paused'),
    'cancelled', count(*) filter (where sr.status in ('canceled', 'cancelled')),
    'upcoming', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'patientId', u.patient_id,
        'patientName', u.patient_name,
        'status', u.status,
        'cycle', u.cycle,
        'amountCents', u.amount_cents,
        'nextDueDate', u.next_due_date,
        'description', u.description
      ) order by u.next_due_date asc nulls last)
      from upcoming u
    ), '[]'::jsonb)
  )
  into v_recurrence
  from subscription_rows sr;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', br.id,
    'patientId', br.patient_id,
    'patientName', coalesce(nullif(p.preferred_name, ''), pii.full_name, 'Paciente'),
    'invoiceId', br.patient_invoice_id,
    'paymentId', br.payment_id,
    'status', br.status,
    'amountCents', br.amount_cents,
    'reason', br.reason,
    'requestedAt', br.requested_at,
    'processedAt', br.processed_at,
    'errorCode', br.error_code
  ) order by br.requested_at desc), '[]'::jsonb)
  into v_refunds
  from (
    select *
    from public.billing_refunds br
    where br.tenant_id = v_tenant_id
    order by br.requested_at desc
    limit 12
  ) br
  join public.patients p on p.tenant_id = br.tenant_id and p.id = br.patient_id
  left join public.patient_pii pii on pii.tenant_id = br.tenant_id and pii.patient_id = br.patient_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', bsj.id,
    'invoiceId', bsj.patient_invoice_id,
    'status', bsj.status,
    'source', bsj.source,
    'reason', bsj.reason,
    'requestedAt', bsj.requested_at,
    'processedAt', bsj.processed_at,
    'errorCode', bsj.error_code
  ) order by bsj.requested_at desc), '[]'::jsonb)
  into v_sync_jobs
  from (
    select *
    from public.billing_sync_jobs bsj
    where bsj.tenant_id = v_tenant_id
    order by bsj.requested_at desc
    limit 12
  ) bsj;

  select jsonb_build_object(
    'id', brr.id,
    'source', brr.source,
    'status', brr.status,
    'checkedInvoiceCount', brr.checked_invoice_count,
    'queuedSyncCount', brr.queued_sync_count,
    'pendingReceiptCount', brr.pending_receipt_count,
    'divergenceCount', brr.divergence_count,
    'startedAt', brr.started_at,
    'finishedAt', brr.finished_at
  )
  into v_last_run
  from public.billing_reconciliation_runs brr
  where brr.tenant_id = v_tenant_id
  order by brr.started_at desc
  limit 1;

  return jsonb_build_object(
    'receiptQueue', v_receipt_queue,
    'recurrence', v_recurrence,
    'refunds', v_refunds,
    'syncJobs', v_sync_jobs,
    'lastRun', v_last_run,
    'generatedAt', now()
  );
end;
$$;

create or replace function public.run_billing_reconciliation(
  p_tenant_id uuid default null,
  p_limit integer default 50,
  p_source text default 'cron',
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := p_tenant_id;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_source text := case when lower(coalesce(p_source, 'cron')) in ('manual', 'cron', 'edge') then lower(coalesce(p_source, 'cron')) else 'cron' end;
  v_checked integer := 0;
  v_queued integer := 0;
  v_pending_receipts integer := 0;
  v_divergences integer := 0;
  v_run_id uuid;
begin
  if v_tenant_id is null then
    select coalesce(
      (
        select p.active_tenant_id
        from public.profiles p
        where p.id = v_user_id
          and p.active_tenant_id is not null
          and security.is_tenant_member(p.active_tenant_id)
        limit 1
      ),
      (
        select tm.tenant_id
        from public.tenant_memberships tm
        where tm.user_id = v_user_id
          and tm.status = 'active'
        order by tm.created_at asc
        limit 1
      )
    )
    into v_tenant_id;
  end if;

  if v_tenant_id is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;

  if v_user_id is not null and not security.has_permission(v_tenant_id, 'financial.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_checked
  from (
    select i.id
    from public.patient_invoices i
    where i.tenant_id = v_tenant_id
      and i.asaas_invoice_id is not null
      and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) in ('pendente', 'vencido')
    order by i.due_date asc nulls last, i.created_at asc
    limit v_limit
  ) pending;

  select count(*)::integer
  into v_pending_receipts
  from public.payment_receipts pr
  where pr.tenant_id = v_tenant_id
    and pr.status = 'pending_review';

  select count(*)::integer
  into v_divergences
  from public.asaas_events ae
  where ae.tenant_id = v_tenant_id
    and ae.status in ('failed', 'ignored');

  if not p_dry_run then
    with candidates as (
      select i.id
      from public.patient_invoices i
      where i.tenant_id = v_tenant_id
        and i.asaas_invoice_id is not null
        and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) in ('pendente', 'vencido')
        and not exists (
          select 1
          from public.billing_sync_jobs bsj
          where bsj.tenant_id = i.tenant_id
            and bsj.patient_invoice_id = i.id
            and bsj.status in ('queued', 'processing')
        )
      order by i.due_date asc nulls last, i.created_at asc
      limit v_limit
    ), inserted as (
      insert into public.billing_sync_jobs (
        tenant_id, patient_invoice_id, status, source, reason, requested_by, metadata
      )
      select
        v_tenant_id,
        c.id,
        'queued',
        v_source,
        'pending_or_overdue_reconciliation',
        v_user_id,
        jsonb_build_object('queuedByContract', 'run_billing_reconciliation')
      from candidates c
      returning id
    )
    select count(*)::integer into v_queued from inserted;
  end if;

  insert into public.billing_reconciliation_runs (
    tenant_id, source, status, checked_invoice_count, queued_sync_count,
    pending_receipt_count, divergence_count, metadata
  )
  values (
    v_tenant_id,
    v_source,
    'completed',
    v_checked,
    v_queued,
    v_pending_receipts,
    v_divergences,
    jsonb_build_object('dryRun', coalesce(p_dry_run, true), 'limit', v_limit)
  )
  returning id into v_run_id;

  return jsonb_build_object(
    'id', v_run_id,
    'tenantId', v_tenant_id,
    'checkedInvoiceCount', v_checked,
    'queuedSyncCount', v_queued,
    'pendingReceiptCount', v_pending_receipts,
    'divergenceCount', v_divergences,
    'dryRun', coalesce(p_dry_run, true)
  );
end;
$$;

revoke all on function public.prepare_payment_receipt_upload(uuid, uuid, integer, text, text, integer, text) from public;
revoke all on function public.complete_payment_receipt_upload(uuid, text) from public;
revoke all on function public.review_payment_receipt(uuid, text, text) from public;
revoke all on function public.get_payment_receipt_download(uuid, integer) from public;
revoke all on function public.get_patient_finance_m13(uuid) from public;
revoke all on function public.get_clinic_finance_m13_dashboard() from public;
revoke all on function public.run_billing_reconciliation(uuid, integer, text, boolean) from public;

grant execute on function public.prepare_payment_receipt_upload(uuid, uuid, integer, text, text, integer, text) to authenticated, service_role;
grant execute on function public.complete_payment_receipt_upload(uuid, text) to authenticated, service_role;
grant execute on function public.review_payment_receipt(uuid, text, text) to authenticated, service_role;
grant execute on function public.get_payment_receipt_download(uuid, integer) to authenticated, service_role;
grant execute on function public.get_patient_finance_m13(uuid) to authenticated, service_role;
grant execute on function public.get_clinic_finance_m13_dashboard() to authenticated, service_role;
grant execute on function public.run_billing_reconciliation(uuid, integer, text, boolean) to authenticated, service_role;

comment on table public.payment_receipts is
  'Private patient-submitted payment proof metadata. File bytes live in payment-receipts and are reviewed through audited RPCs.';
comment on table public.billing_refunds is
  'Local refund ledger. Provider identifiers stay server-side and are never returned by browser contracts.';
comment on table public.billing_external_references is
  'Pseudonymous financial references used for provider externalReference instead of clinical patient UUIDs.';
comment on function public.run_billing_reconciliation(uuid, integer, text, boolean) is
  'Cron/service-role friendly billing reconciliation feeder. Dry-run by default; execute mode queues safe sync jobs without provider calls.';
