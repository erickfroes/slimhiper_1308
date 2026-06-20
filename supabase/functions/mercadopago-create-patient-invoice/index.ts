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
  mercadoPagoFetchWithAccessToken,
  MERCADOPAGO_FEATURE_FLAGS,
  MERCADOPAGO_PROVIDER,
  pickPaymentLink,
  resolveMercadoPagoTenantAccessToken,
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

function notificationUrlForTenant(tenantId: string) {
  const notificationUrl = envString(Deno.env, 'MERCADOPAGO_NOTIFICATION_URL');
  if (!notificationUrl) return '';
  try {
    const url = new URL(notificationUrl);
    url.searchParams.set('tenant_id', tenantId);
    return url.toString();
  } catch {
    return '';
  }
}

function optionalPreferenceUrls(invoiceId: string, tenantId: string) {
  const notificationUrl = notificationUrlForTenant(tenantId);
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

function clampInstallments(value: unknown, fallback = 12) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(12, Math.max(1, Math.trunc(parsed)));
}

function preferencePaymentMethods(maxInstallments: number) {
  return {
    payment_methods: {
      installments: clampInstallments(maxInstallments),
    },
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
    const invoiceId = asString(body?.invoice_id ?? body?.invoiceId);
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
    const maxInstallments = clampInstallments(body?.max_installments ?? body?.maxInstallments);

    if (invoiceId) {
      const { data: existingInvoice, error: invoiceError } = await admin
        .from('patient_invoices')
        .select(
          'id,tenant_id,patient_id,provider,status,amount_cents,due_date,paid_at,description,invoice_url,payment_link,asaas_invoice_id,provider_payment_id,provider_invoice_id,provider_preference_id,metadata,source_module,program_id,package_id,enrollment_id,service_id'
        )
        .eq('id', invoiceId)
        .maybeSingle();

      if (invoiceError) throw invoiceError;
      const invoice = existingInvoice ? asRecord(existingInvoice) : null;
      const invoicePatientId = asString(invoice?.patient_id);
      const invoiceTenantId = asString(invoice?.tenant_id);
      if (!invoice || !invoicePatientId || !invoiceTenantId) {
        return jsonResponse(
          Deno.env,
          404,
          {
            ok: false,
            error: { code: 'invoice_not_found', message: 'Invoice was not found.' },
            meta: { timestamp },
          },
          req
        );
      }

      const tenantResolution = await resolvePatientTenant({
        supabase,
        userId: user.id,
        patientId: invoicePatientId,
      });
      if (tenantResolution.error) return tenantResolution.error;
      const tenantId = tenantResolution.tenantId as string;
      if (tenantId !== invoiceTenantId) {
        return jsonResponse(
          Deno.env,
          403,
          {
            ok: false,
            error: { code: 'forbidden', message: 'Invoice tenant mismatch.' },
            meta: { timestamp },
          },
          req
        );
      }

      const invoiceStatus = asString(invoice.status).toLowerCase();
      if (
        asString(invoice.paid_at) ||
        ['paid', 'pago', 'received', 'confirmed', 'cancelled', 'canceled', 'cancelado'].includes(
          invoiceStatus
        )
      ) {
        return jsonResponse(
          Deno.env,
          409,
          {
            ok: false,
            error: {
              code: 'invoice_not_payable',
              message: 'Only open invoices can receive a payment link.',
            },
            meta: { tenantId, timestamp },
          },
          req
        );
      }

      const existingPaymentLink = asString(invoice.payment_link) || asString(invoice.invoice_url);
      if (existingPaymentLink) {
        return jsonResponse(
          Deno.env,
          200,
          {
            ok: true,
            data: {
              id: invoiceId,
              status: invoice.status,
              invoice_url: invoice.invoice_url ?? null,
              payment_link: invoice.payment_link ?? invoice.invoice_url ?? null,
            },
            meta: { tenantId, timestamp, reused: true },
          },
          req
        );
      }

      if (
        asString(invoice.asaas_invoice_id) ||
        asString(invoice.provider_payment_id) ||
        asString(invoice.provider_invoice_id) ||
        asString(invoice.provider_preference_id)
      ) {
        return jsonResponse(
          Deno.env,
          409,
          {
            ok: false,
            error: {
              code: 'invoice_provider_already_linked',
              message: 'Invoice already has provider identifiers.',
            },
            meta: { tenantId, timestamp },
          },
          req
        );
      }

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

      const tenantToken = await resolveMercadoPagoTenantAccessToken(Deno.env, admin, tenantId);
      if (!tenantToken.accessToken) {
        return jsonResponse(
          Deno.env,
          409,
          {
            ok: false,
            error: {
              code: tenantToken.errorCode || 'tenant_mercadopago_not_connected',
              message: 'Mercado Pago OAuth account is not active for this tenant.',
            },
            meta: { tenantId, timestamp },
          },
          req
        );
      }

      const invoiceMetadata = asRecord(invoice.metadata);
      const invoiceAmountCents = asPositiveInteger(invoice.amount_cents);
      const invoiceDescription =
        safeText(invoice.description, 240) || `Cobranca ${invoiceId.slice(0, 8)}`;
      const maxInstallments = clampInstallments(
        body?.max_installments ??
          body?.maxInstallments ??
          invoiceMetadata.max_installments ??
          invoiceMetadata.maxInstallments ??
          invoiceMetadata.installments
      );

      if (!invoiceAmountCents) {
        return jsonResponse(
          Deno.env,
          400,
          {
            ok: false,
            error: {
              code: 'invalid_invoice_amount',
              message: 'Invoice amount must be greater than zero.',
            },
            meta: { tenantId, timestamp },
          },
          req
        );
      }

      const externalReference =
        asString(invoiceMetadata.external_reference) ||
        `shr_inv_${crypto.randomUUID().replaceAll('-', '')}`;
      const preference = await mercadoPagoFetchWithAccessToken(
        Deno.env,
        tenantToken.accessToken,
        '/checkout/preferences',
        {
          method: 'POST',
          idempotencyKey: idempotencyKey || `invoice:${invoiceId}`,
          body: JSON.stringify({
            items: [
              {
                id: invoiceId,
                title: invoiceDescription,
                description: invoiceDescription,
                quantity: 1,
                currency_id: 'BRL',
                unit_price: centsToProviderAmount(invoiceAmountCents),
              },
            ],
            external_reference: externalReference,
            statement_descriptor: 'SLIMHIPER',
            expires: false,
            metadata: {
              local_invoice_id: invoiceId,
              tenant_reference: `tenant_${tenantId.replaceAll('-', '').slice(0, 16)}`,
            },
            ...preferencePaymentMethods(maxInstallments),
            ...optionalPreferenceUrls(invoiceId, tenantId),
          }),
        }
      );

      if (!preference.ok) {
        console.error('[mercadopago-create-patient-invoice] provider_error', {
          status: preference.status,
        });
        await admin
          .from('patient_invoices')
          .update({
            metadata: {
              ...invoiceMetadata,
              provider: MERCADOPAGO_PROVIDER,
              external_reference: externalReference,
              idempotency_key: idempotencyKey || null,
              max_installments: maxInstallments,
              provider_error_code: preference.errorCode,
            },
          })
          .eq('id', invoiceId)
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
            metadata: {
              ...invoiceMetadata,
              provider: MERCADOPAGO_PROVIDER,
              external_reference: externalReference,
              idempotency_key: idempotencyKey || null,
              max_installments: maxInstallments,
              provider_error_code: 'mercadopago_invalid_response',
            },
          })
          .eq('id', invoiceId)
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
          provider: MERCADOPAGO_PROVIDER,
          provider_invoice_id: preferenceId,
          provider_preference_id: preferenceId,
          invoice_url: paymentLink,
          payment_link: paymentLink,
          metadata: {
            ...invoiceMetadata,
            provider: MERCADOPAGO_PROVIDER,
            external_reference: externalReference,
            idempotency_key: idempotencyKey || null,
            provider_preference_id: preferenceId,
            max_installments: maxInstallments,
          },
        })
        .eq('id', invoiceId)
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
    }

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

    const tenantToken = await resolveMercadoPagoTenantAccessToken(Deno.env, admin, tenantId);
    if (!tenantToken.accessToken) {
      return jsonResponse(
        Deno.env,
        409,
        {
          ok: false,
          error: {
            code: tenantToken.errorCode || 'tenant_mercadopago_not_connected',
            message: 'Mercado Pago OAuth account is not active for this tenant.',
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
          max_installments: maxInstallments,
        },
      })
      .select('id, status')
      .single();

    if (insertError) throw insertError;

    const preference = await mercadoPagoFetchWithAccessToken(
      Deno.env,
      tenantToken.accessToken,
      '/checkout/preferences',
      {
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
          ...preferencePaymentMethods(maxInstallments),
          ...optionalPreferenceUrls(invoice.id, tenantId),
        }),
      }
    );

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
            max_installments: maxInstallments,
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
            max_installments: maxInstallments,
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
          max_installments: maxInstallments,
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
