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
  normalizeSubscriptionStatus,
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

const cycleMap: Record<string, { local: string; frequency: number; frequencyType: string }> = {
  weekly: { local: 'weekly', frequency: 1, frequencyType: 'weeks' },
  biweekly: { local: 'biweekly', frequency: 2, frequencyType: 'weeks' },
  monthly: { local: 'monthly', frequency: 1, frequencyType: 'months' },
  quarterly: { local: 'quarterly', frequency: 3, frequencyType: 'months' },
  yearly: { local: 'yearly', frequency: 12, frequencyType: 'months' },
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
      console.error('[mercadopago-create-patient-subscription] missing environment configuration');
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
    const packageId = asString(body?.package_id ?? body?.packageId) || null;
    const amountCents = asPositiveInteger(body?.amount_cents);
    const nextDueDate = asString(body?.next_due_date);
    const description = safeText(body?.description || 'Assinatura SlimHiper', 240);
    const cycle = cycleMap[asString(body?.cycle, 'monthly').toLowerCase()] ?? cycleMap.monthly;
    const idempotencyKey = safeIdempotencyKey(body?.idempotency_key ?? body?.idempotencyKey);
    const sourceModule = safeText(body?.source_module ?? body?.sourceModule, 80);
    const programId = asString(body?.program_id ?? body?.programId) || null;
    const enrollmentId = asString(body?.enrollment_id ?? body?.enrollmentId) || null;
    const serviceId = asString(body?.service_id ?? body?.serviceId) || null;

    if (!patientId || !amountCents || !nextDueDate || !isDateInput(nextDueDate)) {
      return jsonResponse(
        Deno.env,
        400,
        {
          ok: false,
          error: {
            code: 'invalid_request',
            message: 'patient_id, amount_cents and next_due_date are required.',
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

    const { data: pii, error: piiError } = await supabase
      .from('patient_pii')
      .select('email')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .maybeSingle();
    if (piiError) throw piiError;
    const payerEmail = asString(pii?.email);
    if (!payerEmail) {
      return jsonResponse(
        Deno.env,
        422,
        {
          ok: false,
          error: {
            code: 'missing_patient_billing_email',
            message: 'Patient billing email is required for Mercado Pago subscriptions.',
          },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    if (idempotencyKey) {
      const { data: existingSubscription, error: existingSubscriptionError } = await admin
        .from('patient_subscriptions')
        .select('id, status, metadata')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .eq('provider', MERCADOPAGO_PROVIDER)
        .eq('metadata->>idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingSubscriptionError) throw existingSubscriptionError;
      if (existingSubscription?.id) {
        const metadata = asRecord(existingSubscription.metadata);
        return jsonResponse(
          Deno.env,
          200,
          {
            ok: true,
            data: {
              id: existingSubscription.id,
              status: existingSubscription.status,
              payment_link: metadata.payment_link ?? null,
            },
            meta: { tenantId, timestamp, reused: true },
          },
          req
        );
      }
    }

    const externalReference = `shr_sub_${crypto.randomUUID().replaceAll('-', '')}`;
    const { data: subscription, error: insertError } = await admin
      .from('patient_subscriptions')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        provider: MERCADOPAGO_PROVIDER,
        status: 'active',
        cycle: cycle.local,
        amount_cents: amountCents,
        next_due_date: nextDueDate,
        source_module: sourceModule || null,
        program_id: programId,
        package_id: packageId,
        enrollment_id: enrollmentId,
        service_id: serviceId,
        metadata: {
          provider: MERCADOPAGO_PROVIDER,
          description,
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

    const providerResponse = await mercadoPagoFetchWithAccessToken(
      Deno.env,
      tenantToken.accessToken,
      '/preapproval',
      {
        method: 'POST',
        idempotencyKey: idempotencyKey || `subscription:${subscription.id}`,
        body: JSON.stringify({
          reason: description,
          external_reference: externalReference,
          payer_email: payerEmail,
          status: 'pending',
          auto_recurring: {
            frequency: cycle.frequency,
            frequency_type: cycle.frequencyType,
            transaction_amount: centsToProviderAmount(amountCents),
            currency_id: 'BRL',
            start_date: `${nextDueDate}T00:00:00.000-03:00`,
          },
        }),
      }
    );

    if (!providerResponse.ok) {
      console.error('[mercadopago-create-patient-subscription] provider_error', {
        status: providerResponse.status,
      });
      await admin
        .from('patient_subscriptions')
        .update({
          status: 'canceled',
          metadata: {
            provider: MERCADOPAGO_PROVIDER,
            external_reference: externalReference,
            idempotency_key: idempotencyKey || null,
            provider_error_code: providerResponse.errorCode,
          },
        })
        .eq('id', subscription.id)
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

    const providerData = asRecord(providerResponse.data);
    const preapprovalId = asString(providerData.id);
    const paymentLink = pickPaymentLink(providerData);
    if (!preapprovalId) {
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

    const providerStatus = normalizeSubscriptionStatus(providerData.status);
    await admin
      .from('patient_subscriptions')
      .update({
        provider_subscription_id: preapprovalId,
        status: providerStatus,
        metadata: {
          provider: MERCADOPAGO_PROVIDER,
          description,
          external_reference: externalReference,
          idempotency_key: idempotencyKey || null,
          provider_subscription_id: preapprovalId,
          payment_link: paymentLink,
          source: sourceModule || null,
          program_id: programId,
          package_id: packageId,
          enrollment_id: enrollmentId,
          service_id: serviceId,
        },
      })
      .eq('id', subscription.id)
      .eq('tenant_id', tenantId);

    return jsonResponse(
      Deno.env,
      200,
      {
        ok: true,
        data: {
          id: subscription.id,
          status: providerStatus,
          payment_link: paymentLink,
        },
        meta: { tenantId, timestamp },
      },
      req
    );
  } catch (error) {
    console.error('[mercadopago-create-patient-subscription] unexpected_error', {
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
