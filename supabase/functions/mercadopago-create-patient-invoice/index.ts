import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envString } from '../_shared/env.ts';
import { tenantHasFeatureFlag } from '../_shared/plan-entitlements.ts';
import {
  asPositiveInteger,
  asRecord,
  asString,
  bearerToken,
  centsToProviderAmount,
  corsHeaders,
  isDateInput,
  jsonResponse,
  mercadoPagoFetch,
  MERCADOPAGO_FEATURE_FLAGS,
  MERCADOPAGO_PROVIDER,
  pickPaymentLink,
  safeErrorMessage,
  safeIdempotencyKey,
  safeText,
} from '../_shared/mercadopago.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

async function tenantHasBillingProviderFeature(
  admin: ReturnType<typeof createClient>,
  tenantId: string
) {
  for (const flag of MERCADOPAGO_FEATURE_FLAGS) {
    if (await tenantHasFeatureFlag(admin, tenantId, flag)) return true;
  }
  return false;
}

async function resolvePatientTenant(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  patientId: string;
}) {
  const { supabase, userId, patientId } = params;
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id, tenant_id')
    .eq('id', patientId)
    .maybeSingle();

  if (patientError) throw patientError;
  if (!patient)
    return { error: jsonResponse(Deno.env, 404, { ok: false, error: { code: 'not_found' } }) };

  const tenantId = String(patient.tenant_id ?? '');
  const { data: membership, error: membershipError } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    return {
      error: jsonResponse(Deno.env, 403, {
        ok: false,
        error: { code: 'forbidden', message: 'No active tenant membership.' },
      }),
    };
  }

  const { data: canWrite, error: permissionError } = await supabase.rpc('has_permission', {
    p_tenant_id: tenantId,
    p_permission: 'financial.write',
  });

  if (permissionError) throw permissionError;
  if (canWrite !== true) {
    return {
      error: jsonResponse(Deno.env, 403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing financial.write permission.' },
      }),
    };
  }

  return { tenantId };
}

function siteUrl() {
  const site = envString(Deno.env, 'SITE_URL') || envString(Deno.env, 'NEXT_PUBLIC_SITE_URL');
  if (!site) return '';
  try {
    return new URL(site).origin;
  } catch {
    return '';
  }
}

function optionalPreferenceUrls(invoiceId: string) {
  const notificationUrl = envString(Deno.env, 'MERCADOPAGO_NOTIFICATION_URL');
  const site = siteUrl();
  return {
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    ...(site
      ? {
          back_urls: {
            success: `${site}/clinic/financeiro?provider=mercadopago&invoice=${invoiceId}&status=success`,
            pending: `${site}/clinic/financeiro?provider=mercadopago&invoice=${invoiceId}&status=pending`,
            failure: `${site}/clinic/financeiro?provider=mercadopago&invoice=${invoiceId}&status=failure`,
          },
          auto_return: 'approved',
        }
      : {}),
  };
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(Deno.env, req) });
  if (req.method !== 'POST') {
    return jsonResponse(
      Deno.env,
      405,
      {
        ok: false,
        error: { code: 'method_not_allowed', message: 'Only POST is allowed.' },
        meta: { timestamp },
      },
      req
    );
  }

  try {
    const token = bearerToken(req);
    if (!token) {
      return jsonResponse(
        Deno.env,
        401,
        {
          ok: false,
          error: { code: 'unauthorized', message: 'Missing bearer token.' },
          meta: { timestamp },
        },
        req
      );
    }

    const supabaseUrl = envString(Deno.env, 'SUPABASE_URL');
    const anonKey = envString(Deno.env, 'SUPABASE_ANON_KEY');
    const serviceRoleKey = envString(Deno.env, 'SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('[mercadopago-create-patient-invoice] missing environment configuration');
      return jsonResponse(
        Deno.env,
        500,
        {
          ok: false,
          error: { code: 'server_misconfigured', message: 'Server configuration error.' },
          meta: { timestamp },
        },
        req
      );
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse(
        Deno.env,
        401,
        {
          ok: false,
          error: { code: 'unauthorized', message: 'Invalid or expired token.' },
          meta: { timestamp },
        },
        req
      );
    }

    const body = await req.json().catch(() => null);
    const patientId = asString(body?.patient_id);
    const amountCents = asPositiveInteger(body?.amount_cents);
    const dueDate = asString(body?.due_date);
    const description = safeText(body?.description, 240);
    const idempotencyKey = safeIdempotencyKey(body?.idempotency_key ?? body?.idempotencyKey);
    const sourceModule = safeText(body?.source_module ?? body?.sourceModule, 80);
    const programId = asString(body?.program_id ?? body?.programId) || null;
    const packageId = asString(body?.package_id ?? body?.packageId) || null;
    const enrollmentId = asString(body?.enrollment_id ?? body?.enrollmentId) || null;
    const serviceId = asString(body?.service_id ?? body?.serviceId) || null;

    if (!patientId || !amountCents || !dueDate || !isDateInput(dueDate) || !description) {
      return jsonResponse(
        Deno.env,
        400,
        {
          ok: false,
          error: {
            code: 'invalid_request',
            message: 'patient_id, amount_cents, due_date and description are required.',
          },
          meta: { timestamp },
        },
        req
      );
    }

    const tenantResolution = await resolvePatientTenant({ supabase, userId: user.id, patientId });
    if (tenantResolution.error) return tenantResolution.error;
    const tenantId = tenantResolution.tenantId as string;

    if (!(await tenantHasBillingProviderFeature(admin, tenantId))) {
      return jsonResponse(
        Deno.env,
        403,
        {
          ok: false,
          error: {
            code: 'plan_feature_disabled',
            message: 'Payment provider is not enabled for this tenant plan.',
          },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    if (idempotencyKey) {
      const { data: existingInvoice, error: existingInvoiceError } = await admin
        .from('patient_invoices')
        .select('id, status, invoice_url, payment_link')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .eq('provider', MERCADOPAGO_PROVIDER)
        .eq('metadata->>idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingInvoiceError) throw existingInvoiceError;
      if (existingInvoice?.id) {
        return jsonResponse(
          Deno.env,
          200,
          {
            ok: true,
            data: {
              id: existingInvoice.id,
              status: existingInvoice.status,
              invoice_url: existingInvoice.invoice_url ?? null,
              payment_link: existingInvoice.payment_link ?? null,
            },
            meta: { tenantId, timestamp, reused: true },
          },
          req
        );
      }
    }

    const externalReference = `shr_inv_${crypto.randomUUID().replaceAll('-', '')}`;
    const { data: invoice, error: insertError } = await admin
      .from('patient_invoices')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        provider: MERCADOPAGO_PROVIDER,
        status: 'pending',
        amount_cents: amountCents,
        due_date: dueDate,
        description,
        source_module: sourceModule || null,
        program_id: programId,
        package_id: packageId,
        enrollment_id: enrollmentId,
        service_id: serviceId,
        metadata: {
          provider: MERCADOPAGO_PROVIDER,
          external_reference: externalReference,
          idempotency_key: idempotencyKey || null,
          source: sourceModule || null,
          program_id: programId,
          package_id: packageId,
          enrollment_id: enrollmentId,
          service_id: serviceId,
        },
      })
      .select('id, status')
      .single();

    if (insertError) throw insertError;

    const preference = await mercadoPagoFetch(Deno.env, '/checkout/preferences', {
      method: 'POST',
      idempotencyKey: idempotencyKey || `invoice:${invoice.id}`,
      body: JSON.stringify({
        items: [
          {
            id: invoice.id,
            title: description,
            description,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: centsToProviderAmount(amountCents),
          },
        ],
        external_reference: externalReference,
        statement_descriptor: 'SLIMHIPER',
        expires: false,
        metadata: {
          local_invoice_id: invoice.id,
          tenant_reference: `tenant_${tenantId.replaceAll('-', '').slice(0, 16)}`,
        },
        ...optionalPreferenceUrls(invoice.id),
      }),
    });

    if (!preference.ok) {
      console.error('[mercadopago-create-patient-invoice] provider_error', {
        status: preference.status,
      });
      await admin
        .from('patient_invoices')
        .update({
          status: 'failed',
          metadata: {
            provider: MERCADOPAGO_PROVIDER,
            external_reference: externalReference,
            idempotency_key: idempotencyKey || null,
            provider_error_code: preference.errorCode,
          },
        })
        .eq('id', invoice.id)
        .eq('tenant_id', tenantId);

      return jsonResponse(
        Deno.env,
        502,
        {
          ok: false,
          error: { code: 'mercadopago_error', message: 'Billing provider request failed.' },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    const providerData = asRecord(preference.data);
    const preferenceId = asString(providerData.id);
    const paymentLink = pickPaymentLink(providerData);
    if (!preferenceId || !paymentLink) {
      await admin
        .from('patient_invoices')
        .update({
          status: 'failed',
          metadata: {
            provider: MERCADOPAGO_PROVIDER,
            external_reference: externalReference,
            idempotency_key: idempotencyKey || null,
            provider_error_code: 'mercadopago_invalid_response',
          },
        })
        .eq('id', invoice.id)
        .eq('tenant_id', tenantId);

      return jsonResponse(
        Deno.env,
        502,
        {
          ok: false,
          error: {
            code: 'mercadopago_invalid_response',
            message: 'Billing provider response invalid.',
          },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    const { data: updatedInvoice, error: updateError } = await admin
      .from('patient_invoices')
      .update({
        provider_invoice_id: preferenceId,
        provider_preference_id: preferenceId,
        invoice_url: paymentLink,
        payment_link: paymentLink,
        metadata: {
          provider: MERCADOPAGO_PROVIDER,
          external_reference: externalReference,
          idempotency_key: idempotencyKey || null,
          provider_preference_id: preferenceId,
          source: sourceModule || null,
          program_id: programId,
          package_id: packageId,
          enrollment_id: enrollmentId,
          service_id: serviceId,
        },
      })
      .eq('id', invoice.id)
      .eq('tenant_id', tenantId)
      .select('id, status, invoice_url, payment_link')
      .single();

    if (updateError) throw updateError;

    return jsonResponse(
      Deno.env,
      200,
      {
        ok: true,
        data: {
          id: updatedInvoice.id,
          status: updatedInvoice.status,
          invoice_url: updatedInvoice.invoice_url ?? null,
          payment_link: updatedInvoice.payment_link ?? null,
        },
        meta: { tenantId, timestamp },
      },
      req
    );
  } catch (error) {
    console.error('[mercadopago-create-patient-invoice] unexpected_error', {
      message: safeErrorMessage(error),
    });

    return jsonResponse(
      Deno.env,
      500,
      {
        ok: false,
        error: { code: 'internal_error', message: 'Unexpected server error.' },
        meta: { timestamp },
      },
      req
    );
  }
});
