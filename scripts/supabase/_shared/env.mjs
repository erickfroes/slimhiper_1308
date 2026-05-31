export function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

function decodeJwtPayload(jwt) {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;

  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function requireServiceRoleKey(key = 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = process.env[key] ?? '';
  if (!value) return;

  if (value.startsWith('sb_secret_')) {
    throw new Error(
      `${key} received a Supabase SECRET_KEY (sb_secret_...). Use the SERVICE_ROLE_KEY JWT from "npx supabase status --output env" for bootstrap scripts.`
    );
  }

  if (!value.startsWith('eyJ')) {
    throw new Error(
      `${key} must be a JWT service_role key. Use SERVICE_ROLE_KEY, not PUBLISHABLE_KEY or SECRET_KEY.`
    );
  }

  const payload = decodeJwtPayload(value);
  if (payload?.role !== 'service_role') {
    throw new Error(`${key} must have JWT role "service_role".`);
  }
}

export function getRequiredServiceRoleKey() {
  requireServiceRoleKey();
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
