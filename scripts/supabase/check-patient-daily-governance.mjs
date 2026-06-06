#!/usr/bin/env node
/**
 * Read-only M01 patient daily governance contract check.
 *
 * This script intentionally does not mutate Supabase data. It checks retention
 * columns and calls the service-role helpers in dry-run mode only.
 */
import { createClient } from '@supabase/supabase-js';
import { getEnvValue, getRequiredServiceRoleKey } from './_shared/env.mjs';

const SUPABASE_URL = getEnvValue('SUPABASE_URL') || getEnvValue('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE_KEY = getEnvValue('SUPABASE_SERVICE_ROLE_KEY');

function fail(message) {
  console.error(`[patient-daily-governance] ${message}`);
  process.exitCode = 1;
}

if (!SUPABASE_URL) {
  fail('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  fail('Missing SUPABASE_SERVICE_ROLE_KEY for backend-only read scope.');
  process.exit(1);
}

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

async function assertColumnContract(table, column) {
  const { error } = await supabase.from(table).select(column, { head: true }).limit(1);
  if (error) throw new Error(`${table}.${column}: schema_contract_missing`);
}

async function assertDailyTable(table) {
  const { error } = await supabase.from(table).select('id', { head: true }).limit(1);
  if (error) throw new Error(`${table}: ${safeErrorCode(error)}`);
  await assertColumnContract(table, 'retention_expires_at');
}

async function countDue(table, column, extraFilter) {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .not(column, 'is', null)
    .lt(column, new Date().toISOString());

  if (extraFilter) query = extraFilter(query);

  const { count, error } = await query;
  if (error) throw new Error(`${table}.${column}: ${safeErrorCode(error)}`);
  return count ?? 0;
}

async function dryRunRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${safeErrorCode(error)}`);
  return data;
}

try {
  await Promise.all([
    assertDailyTable('water_entries'),
    assertDailyTable('meal_entries'),
    assertDailyTable('workout_entries'),
    assertDailyTable('daily_checkins'),
    assertColumnContract('meal_entries', 'photo_retention_expires_at'),
    assertColumnContract('meal_entries', 'photo_retention_status'),
  ]);

  const [waterEntries, mealEntries, workoutEntries, dailyCheckins, mealPhotos] = await Promise.all([
    countDue('water_entries', 'retention_expires_at', (query) => query.neq('status', 'deleted')),
    countDue('meal_entries', 'retention_expires_at', (query) => query.neq('status', 'deleted')),
    countDue('workout_entries', 'retention_expires_at', (query) => query.neq('status', 'deleted')),
    countDue('daily_checkins', 'retention_expires_at', (query) => query.neq('status', 'deleted')),
    countDue('meal_entries', 'photo_retention_expires_at', (query) =>
      query
        .not('photo_storage_path', 'is', null)
        .in('photo_retention_status', ['active', 'delete_due'])
    ),
  ]);

  const retentionDryRun = await dryRunRpc('expire_patient_daily_habits_for_retention', {
    p_execute: false,
    p_limit: 1,
  });
  const alertDryRun = await dryRunRpc('emit_patient_daily_operational_alerts', {
    p_target_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    p_execute: false,
    p_limit: 1,
  });

  console.log(
    JSON.stringify(
      {
        dryRun: true,
        generatedAt: new Date().toISOString(),
        dueNow: { waterEntries, mealEntries, workoutEntries, dailyCheckins, mealPhotos },
        retentionDryRun,
        alertDryRun,
        mutation:
          'skipped: read-only script; use execute=true RPCs only from authorized backend jobs',
      },
      null,
      2
    )
  );
} catch (error) {
  fail(error instanceof Error ? error.message : 'Unknown patient daily governance check failure.');
}
