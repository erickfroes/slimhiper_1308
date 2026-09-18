import { secureEdge } from '../_shared/http-security.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envString } from '../_shared/env.ts';
import { tenantHasFeatureFlag } from '../_shared/plan-entitlements.ts';
import {
  asRecord,
  asString,
  bearerToken,
  centsToProviderAmount,
  corsHeaders,
  jsonResponse,
  mercadoPagoFetchWithAccessToken,
  MERCADOPAGO_FEATURE_FLAGS,
  resolveMercadoPagoTenantAccessToken,
  safeErrorMessage,
  safeText,
} from '../_shared/mercadopago.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const cycleMap: Record<string, { frequency: number; frequencyType: string }> = {
  weekly: { frequency: 1, frequencyType: 'weeks' },
  biweekly: { frequency: 2, frequencyType: 'weeks' },
  monthly: { frequency: 1, frequencyType: 'months' },
  quarterly: { frequency: 3, frequencyType: 'months' },
  yearly: { frequency: 12, frequencyType: 'months' },
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(secureEdge(async (req) => {
  const timestamp = new Date().toISOString();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(Deno.env, req) });
  if (req.method !== 'POST') {
    return jsonResponse(Deno.env, 405, { ok: false, error: { code: 'method_not_allowed' } }, req);
  }

  try {
    const token = bearerToken(req);
    if (!token)
      return jsonResponse(Deno.env, 401, { ok: false, error: { code: 'unauthorized' } }, req);

    const supabaseUrl = envString(Deno.env, 'SUPABASE_URL');
    const anonKey = envString(Deno.env, 'SUPABASE_ANON_KEY');
    const serviceRoleKey = envString(Deno.env, 'SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        Deno.env,
        500,
        { ok: false, error: { code: 'server_misconfigured' } },
        req
      );
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse(Deno.env, 401, { ok: false, error: { code: 'unauthorized' } }, req);
    }

    const body = asRecord(await req.json().catch(() => null));
    const packageId = asString(body.package_id ?? body.packageId);
    if (!isUuid(packageId)) {
      return jsonResponse(Deno.env, 400, { ok: false, error: { code: 'invalid_package' } }, req);
    }

    const { data: packageRow, error: packageError } = await supabase
      .from('packages')
      .select(
        'id,tenant_id,name,status,price_cents,billing_cycle,billing_repetitions,billing_trial_days,provider_plan_id'
      )
      .eq('id', packageId)
      .maybeSingle();
    if (packageError) throw packageError;
    if (!packageRow || packageRow.status !== 'ativo' || Number(packageRow.price_cents) <= 0) {
      return jsonResponse(
        Deno.env,
        422,
        { ok: false, error: { code: 'package_not_billable', message: 'Package is not billable.' } },
        req
      );
    }
    const tenantId = asString(packageRow.tenant_id);
    const { data: billingVersion, error: versionError } = await admin
      .from('package_billing_versions')
      .select(
        'id,amount_cents,billing_cycle,billing_repetitions,trial_days,provider_plan_id,provider_status'
      )
      .eq('tenant_id', tenantId)
      .eq('package_id', packageId)
      .eq('is_current', true)
      .maybeSingle();
    if (versionError) throw versionError;
    if (!billingVersion) {
      return jsonResponse(
        Deno.env,
        409,
        { ok: false, error: { code: 'package_billing_version_missing' } },
        req
      );
    }
    const { data: canManage, error: permissionError } = await supabase.rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: 'financial.subscription.manage',
    });
    if (permissionError) throw permissionError;
    if (canManage !== true) {
      return jsonResponse(Deno.env, 403, { ok: false, error: { code: 'forbidden' } }, req);
    }
    let providerEnabled = false;
    for (const flag of MERCADOPAGO_FEATURE_FLAGS) {
      if (await tenantHasFeatureFlag(admin, tenantId, flag)) {
        providerEnabled = true;
        break;
      }
    }
    if (!providerEnabled) {
      return jsonResponse(
        Deno.env,
        403,
        { ok: false, error: { code: 'plan_feature_disabled' } },
        req
      );
    }

    const tenantToken = await resolveMercadoPagoTenantAccessToken(Deno.env, admin, tenantId);
    if (!tenantToken.accessToken) {
      return jsonResponse(
        Deno.env,
        409,
        { ok: false, error: { code: tenantToken.errorCode || 'tenant_mercadopago_not_connected' } },
        req
      );
    }

    const cycle = cycleMap[asString(billingVersion.billing_cycle)] ?? cycleMap.monthly;
    const siteUrl = envString(Deno.env, 'SITE_URL').replace(/\/+$/, '');
    if (!siteUrl.startsWith('https://')) {
      return jsonResponse(
        Deno.env,
        503,
        { ok: false, error: { code: 'server_misconfigured' } },
        req
      );
    }

    const packageUpdate = await admin
      .from('packages')
      .update({ provider_sync_status: 'syncing', provider_error_code: null })
      .eq('tenant_id', tenantId)
      .eq('id', packageId);
    if (packageUpdate.error) throw packageUpdate.error;
    const versionUpdate = await admin
      .from('package_billing_versions')
      .update({ provider_status: 'syncing', provider_error_code: null })
      .eq('id', billingVersion.id);
    if (versionUpdate.error) throw versionUpdate.error;

    const providerPlanId = asString(billingVersion.provider_plan_id);
    const providerResponse = await mercadoPagoFetchWithAccessToken(
      Deno.env,
      tenantToken.accessToken,
      providerPlanId ? `/preapproval_plan/${providerPlanId}` : '/preapproval_plan',
      {
        method: providerPlanId ? 'PUT' : 'POST',
        idempotencyKey: `patient-package-version:${billingVersion.id}`,
        body: JSON.stringify({
          reason: safeText(packageRow.name, 120),
          auto_recurring: {
            frequency: cycle.frequency,
            frequency_type: cycle.frequencyType,
            transaction_amount: centsToProviderAmount(Number(billingVersion.amount_cents)),
            currency_id: 'BRL',
            ...(Number(billingVersion.billing_repetitions) > 0
              ? { repetitions: Number(billingVersion.billing_repetitions) }
              : {}),
            ...(Number(billingVersion.trial_days) > 0
              ? {
                  free_trial: {
                    frequency: Number(billingVersion.trial_days),
                    frequency_type: 'days',
                  },
                }
              : {}),
          },
          back_url: `${siteUrl}/clinic/settings?section=financeiro`,
        }),
      }
    );
    const providerData = asRecord(providerResponse.data);
    const resolvedPlanId = asString(providerData.id) || providerPlanId;
    if (!providerResponse.ok || !resolvedPlanId) {
      await admin
        .from('packages')
        .update({
          provider_sync_status: 'error',
          provider_error_code: providerResponse.errorCode || 'mercadopago_invalid_response',
        })
        .eq('tenant_id', tenantId)
        .eq('id', packageId);
      await admin
        .from('package_billing_versions')
        .update({
          provider_status: 'error',
          provider_error_code: providerResponse.errorCode || 'mercadopago_invalid_response',
        })
        .eq('id', billingVersion.id);
      return jsonResponse(
        Deno.env,
        502,
        { ok: false, error: { code: 'mercadopago_error', message: 'Plan sync failed.' } },
        req
      );
    }

    const syncedPackageUpdate = await admin
      .from('packages')
      .update({
        provider: 'mercadopago',
        provider_plan_id: resolvedPlanId,
        provider_sync_status: 'active',
        provider_last_synced_at: timestamp,
        provider_error_code: null,
      })
      .eq('tenant_id', tenantId)
      .eq('id', packageId);
    if (syncedPackageUpdate.error) throw syncedPackageUpdate.error;
    const syncedVersionUpdate = await admin
      .from('package_billing_versions')
      .update({
        provider_plan_id: resolvedPlanId,
        provider_status: 'active',
        provider_last_synced_at: timestamp,
        provider_error_code: null,
      })
      .eq('id', billingVersion.id);
    if (syncedVersionUpdate.error) throw syncedVersionUpdate.error;
    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: authData.user.id,
      action: 'patient_billing.package_plan_synced',
      entity_type: 'package',
      entity_id: packageId,
      metadata: { provider: 'mercadopago', source: 'clinic_finance_settings' },
    });

    return jsonResponse(
      Deno.env,
      200,
      { ok: true, data: { packageId, providerPlanId: resolvedPlanId, status: 'active' } },
      req
    );
  } catch (error) {
    console.error('[mercadopago-sync-patient-plan] failed', {
      message: safeErrorMessage(error).slice(0, 160),
    });
    return jsonResponse(
      Deno.env,
      500,
      { ok: false, error: { code: 'internal_error' }, meta: { timestamp } },
      req
    );
  }
}, "mercadopago-sync-patient-plan"));
