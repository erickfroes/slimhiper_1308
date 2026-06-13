const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const PRODUCTION_LIKE_ENVIRONMENTS = new Set(['production', 'prod', 'staging']);

function normalizeEnvValue(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function getRuntimeEnvironment() {
  return (
    normalizeEnvValue(process.env.NEXT_PUBLIC_APP_ENV) ||
    normalizeEnvValue(process.env.SLIMHIPER_ENVIRONMENT) ||
    normalizeEnvValue(process.env.VERCEL_ENV) ||
    normalizeEnvValue(process.env.NODE_ENV) ||
    'unknown'
  );
}

export function isProductionLikeEnvironment(environment = getRuntimeEnvironment()) {
  return PRODUCTION_LIKE_ENVIRONMENTS.has(normalizeEnvValue(environment));
}

export function isMockDataRequested() {
  return TRUE_VALUES.has(normalizeEnvValue(process.env.NEXT_PUBLIC_USE_MOCK_DATA));
}

export function isMockDataEnabled(environment = getRuntimeEnvironment()) {
  return isMockDataRequested() && !isProductionLikeEnvironment(environment);
}

export function getMockDataPolicy(environment = getRuntimeEnvironment()) {
  const requested = isMockDataRequested();
  const productionLike = isProductionLikeEnvironment(environment);

  return {
    requested,
    enabled: requested && !productionLike,
    productionLike,
    environment,
    blockedByEnvironment: requested && productionLike,
  };
}
