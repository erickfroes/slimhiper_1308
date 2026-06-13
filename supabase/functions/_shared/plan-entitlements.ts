type FeatureFlagQuery = {
  eq: (column: string, value: string | boolean) => FeatureFlagQuery;
  maybeSingle: () => Promise<{
    data: { enabled?: boolean | null } | null;
    error: unknown | null;
  }>;
};

type FeatureFlagClient = {
  from: (table: string) => {
    select: (columns: string) => FeatureFlagQuery;
  };
};

export async function tenantHasFeatureFlag(
  supabase: FeatureFlagClient,
  tenantId: string,
  featureFlagKey: string
) {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('key', featureFlagKey)
    .maybeSingle();

  if (error) throw error;
  return data?.enabled === true;
}
