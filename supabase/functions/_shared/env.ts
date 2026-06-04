type EnvReader = {
  get(key: string): string | undefined;
};

const placeholderValues = new Set([
  'dummy',
  'fake',
  'placeholder',
  'changeme',
  'change-me',
  'change_me',
  'todo',
  'tbd',
  'none',
  'null',
  'undefined',
  'na',
  'n/a',
  '-',
]);

export function isPlaceholderEnvValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (placeholderValues.has(normalized)) return true;
  return normalized.includes('dummy') || normalized.includes('placeholder');
}

export function envString(env: EnvReader, key: string) {
  const value = env.get(key)?.trim() ?? '';
  return value && !isPlaceholderEnvValue(value) ? value : '';
}

export function envBoolean(env: EnvReader, key: string) {
  const value = envString(env, key).toLowerCase();
  return ['true', '1', 'yes', 'y', 'sim'].includes(value);
}
