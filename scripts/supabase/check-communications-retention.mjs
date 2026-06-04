#!/usr/bin/env node
/**
 * Read-only communications retention check for Phase 8.4.
 *
 * This script intentionally does not mutate Supabase data. It reports how many
 * chat messages, chat threads, and notifications are past their retention date.
 * To archive/expire data, run the documented service-role RPC
 * `archive_expired_communications(false)` only from an authorized environment.
 */
import { createClient } from '@supabase/supabase-js';
import { getEnvValue, getRequiredServiceRoleKey } from './_shared/env.mjs';

const SUPABASE_URL = getEnvValue('SUPABASE_URL') || getEnvValue('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE_KEY = getEnvValue('SUPABASE_SERVICE_ROLE_KEY');

function fail(message) {
  console.error(`[communications-retention] ${message}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.');
if (!SERVICE_ROLE_KEY) fail('Missing SUPABASE_SERVICE_ROLE_KEY for backend-only read scope.');

const supabase = createClient(SUPABASE_URL, getRequiredServiceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function safeErrorCode(error) {
  const raw = error?.code ?? error?.name ?? 'query_failed';
  return String(raw)
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, 80);
}

async function countExpired(table, extraFilter) {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('archived_at', null)
    .not('retention_until', 'is', null)
    .lt('retention_until', new Date().toISOString());

  if (extraFilter) query = extraFilter(query);

  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${safeErrorCode(error)}`);
  return count ?? 0;
}

try {
  const [messages, notifications, threads] = await Promise.all([
    countExpired('patient_chat_messages'),
    countExpired('notifications'),
    countExpired('patient_chat_threads'),
  ]);

  console.log(
    JSON.stringify(
      {
        dryRun: true,
        generatedAt: new Date().toISOString(),
        expired: { messages, notifications, threads },
        mutation:
          'skipped: read-only script; use archive_expired_communications(false) only when authorized',
      },
      null,
      2
    )
  );
} catch (error) {
  fail(error instanceof Error ? error.message : 'Unknown retention check failure.');
}
