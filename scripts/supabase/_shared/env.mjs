import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const initialEnvKeys = new Set(Object.keys(process.env));

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) return null;

  const [, key, rawValue] = match;
  let value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    const commentIndex = value.search(/\s+#/);
    if (commentIndex >= 0) value = value.slice(0, commentIndex).trim();
  }

  return { key, value: value.replace(/\\n/g, '\n') };
}

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseDotEnvLine(line);
    if (!parsed || initialEnvKeys.has(parsed.key)) continue;
    process.env[parsed.key] = parsed.value;
  }
}

if (process.env.SLIMHIPER_SKIP_DOTENV !== '1') {
  for (const fileName of ['.env', '.env.local']) {
    loadDotEnvFile(path.join(repoRoot, fileName));
  }
}

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

export function isPlaceholderEnvValue(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  if (placeholderValues.has(normalized)) return true;
  return normalized.includes('dummy') || normalized.includes('placeholder');
}

export function getEnvValue(key) {
  const value = process.env[key]?.trim() ?? '';
  return value && !isPlaceholderEnvValue(value) ? value : '';
}

export function envFlag(key) {
  const value = getEnvValue(key).toLowerCase();
  return ['true', '1', 'yes', 'y', 'sim'].includes(value);
}

export function isSandboxLikeUrl(value) {
  const normalized = String(value ?? '').toLowerCase();
  return (
    normalized.includes('sandbox') ||
    normalized.includes('homolog') ||
    normalized.includes('hml') ||
    normalized.includes('localhost') ||
    normalized.includes('127.0.0.1') ||
    normalized.includes('[::1]')
  );
}

export function requireEnv(keys) {
  const missing = keys.filter((key) => !getEnvValue(key));
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

const supabasePublishableKeyCandidates = [
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

export function getSupabasePublishableKey() {
  for (const key of supabasePublishableKeyCandidates) {
    const value = getEnvValue(key);
    if (value) return value;
  }
  return '';
}

export function requireSupabasePublishableKey() {
  const value = getSupabasePublishableKey();
  if (!value) {
    throw new Error(
      `Missing Supabase publishable/anon key env var. Set one of: ${supabasePublishableKeyCandidates.join(', ')}`
    );
  }
  return value;
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
  const value = getEnvValue(key);
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
  return getEnvValue('SUPABASE_SERVICE_ROLE_KEY');
}
