interface ClientEntitlementError {
  message: string;
  code: string;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export async function requireClientFeatureFlag(
  featureFlagKey: string,
  message: string
): Promise<ClientEntitlementError | null> {
  try {
    const response = await fetch('/api/auth/app-session', {
      cache: 'no-store',
      credentials: 'same-origin',
    });

    if (!response.ok) {
      return {
        message: 'Nao foi possivel validar os recursos liberados para este tenant.',
        code: 'entitlement_check_failed',
      };
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const featureFlags = asStringArray(payload.featureFlags);
    if (!featureFlags.includes(featureFlagKey)) {
      return { message, code: 'plan_feature_disabled' };
    }

    return null;
  } catch {
    return {
      message: 'Nao foi possivel validar os recursos liberados para este tenant.',
      code: 'entitlement_check_failed',
    };
  }
}
