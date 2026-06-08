#!/usr/bin/env node

/**
 * Trusted M16 operational job runner.
 *
 * Defaults to dry-run. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and
 * never prints secrets or provider payloads.
 */

import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=');
    const value = inlineValue ?? argv[index + 1];
    args.set(key, value);
    if (inlineValue === undefined) index += 1;
  }
  return args;
}

function usage() {
  console.log(
    'Usage: node scripts/supabase/run-operational-job.mjs --job <job.key> [--limit 100] [--execute]'
  );
  console.log('Default mode is dry-run. Use --execute only after reviewing dry-run output.');
}

function asPositiveInteger(value, fallback) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid --limit value: ${value}`);
  }
  return parsed;
}

function sanitizeOutput(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(
    JSON.stringify(value, (key, nested) => {
      if (/token|secret|key|payload|cookie|authorization/i.test(key)) return '[redacted]';
      return nested;
    })
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobKey = args.get('job');
  if (!jobKey || args.has('help')) {
    usage();
    process.exit(jobKey ? 0 : 1);
  }

  requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);

  const limit = asPositiveInteger(args.get('limit'), 100);
  const execute = args.has('execute');
  const dryRun = !execute;

  const supabase = createClient(process.env.SUPABASE_URL, getRequiredServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('run_operational_job', {
    p_job_key: jobKey,
    p_dry_run: dryRun,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`Operational job failed: ${error.message}`);
  }

  console.log(`Operational job ${jobKey} ${dryRun ? 'dry-run' : 'execution'} completed.`);
  console.log(JSON.stringify(sanitizeOutput(data), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
