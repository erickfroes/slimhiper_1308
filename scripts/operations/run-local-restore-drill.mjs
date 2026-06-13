#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const DEFAULT_DB_CONTAINER = 'supabase_db_slimhiper_1308';
const dbContainer = process.env.SLIMHIPER_DB_CONTAINER || DEFAULT_DB_CONTAINER;
const sourceDb = process.env.SLIMHIPER_RESTORE_SOURCE_DB || 'postgres';
const restoreDb = `slimhiper_restore_drill_${Date.now()}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').slice(0, 1000);
    throw new Error(`${command} ${args.join(' ')} failed: ${stderr || 'no stderr'}`);
  }

  return result.stdout;
}

function dockerExec(args, options) {
  return run('docker', ['exec', ...args], options);
}

function dockerExecInput(args, input) {
  return run('docker', ['exec', '-i', ...args], { input, maxBuffer: 128 * 1024 * 1024 });
}

function queryScalar(database, sql) {
  return dockerExec([
    dbContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-At',
    '-c',
    sql,
  ]).trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const startedAt = new Date();
  let restoreCreated = false;

  try {
    dockerExec([dbContainer, 'pg_isready', '-U', 'postgres', '-d', sourceDb]);

    const dump = dockerExec(
      [
        dbContainer,
        'pg_dump',
        '-U',
        'postgres',
        '-d',
        sourceDb,
        '--schema=auth',
        '--schema=public',
        '--schema=security',
        '--schema=storage',
        '--schema-only',
        '--no-owner',
        '--no-privileges',
      ],
      { maxBuffer: 128 * 1024 * 1024 }
    );
    assert(dump.includes('CREATE TABLE') || dump.includes('CREATE FUNCTION'), 'schema dump was empty.');

    dockerExec([dbContainer, 'createdb', '-U', 'postgres', restoreDb]);
    restoreCreated = true;
    dockerExec([
      dbContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      restoreDb,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'drop schema public cascade;',
    ]);
    dockerExecInput(
      [dbContainer, 'psql', '-U', 'postgres', '-d', restoreDb, '-v', 'ON_ERROR_STOP=1'],
      dump
    );

    const tableCount = Number(
      queryScalar(
        restoreDb,
        "select count(*) from information_schema.tables where table_schema in ('auth', 'public', 'security', 'storage');"
      )
    );
    const policyCount = Number(
      queryScalar(
        restoreDb,
        "select count(*) from pg_policies where schemaname in ('auth', 'public', 'security', 'storage');"
      )
    );
    const functionCount = Number(
      queryScalar(
        restoreDb,
        "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('auth', 'public', 'security', 'storage');"
      )
    );

    assert(tableCount > 0, 'restore drill found no restored tables.');
    assert(policyCount > 0, 'restore drill found no restored RLS policies.');
    assert(functionCount > 0, 'restore drill found no restored functions.');

    const finishedAt = new Date();
    console.log(
      JSON.stringify(
        {
          event: 'local_restore_drill_completed',
          source: 'local_supabase_schema_only',
          restoredDatabase: '<temporary-database-dropped>',
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
          checks: {
            pgReady: 'passed',
            schemaDump: 'passed',
            restore: 'passed',
            publicTables: tableCount,
            publicPolicies: policyCount,
            publicFunctions: functionCount,
          },
          sensitiveData: 'not_dumped_schema_only',
        },
        null,
        2
      )
    );
  } finally {
    if (restoreCreated) {
      dockerExec([dbContainer, 'dropdb', '-U', 'postgres', '--if-exists', restoreDb]);
    }
  }
}

main().catch((error) => {
  console.error('Local restore drill failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
