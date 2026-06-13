#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=');
    const value = inlineValue ?? argv[index + 1] ?? 'true';
    args.set(key, value);
    if (inlineValue === undefined && argv[index + 1]?.startsWith('--') === false) index += 1;
  }
  return args;
}

function normalizeBaseUrl(value) {
  if (!value) throw new Error('Missing --base-url or SLIMHIPER_SMOKE_BASE_URL.');
  return value.replace(/\/$/, '');
}

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) return '';
  return String(result.stdout ?? '').trim();
}

async function callHealth(baseUrl, requestId) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: {
      'x-request-id': requestId,
      'x-correlation-id': requestId,
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  return {
    status: response.status,
    latencyMs: Date.now() - started,
    responseRequestId: response.headers.get('x-request-id'),
    healthStatus: typeof body?.status === 'string' ? body.status : null,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.get('base-url') || process.env.SLIMHIPER_SMOKE_BASE_URL);
  const startedAt = new Date();
  const requestId = `controlled-alert-${randomUUID()}`;
  const health = await callHealth(baseUrl, requestId);

  assert(health.status === 200, `health returned ${health.status}`);
  assert(health.responseRequestId, 'health did not return x-request-id');
  assert(health.healthStatus && health.healthStatus !== 'fail', 'health returned fail or missing status');

  const head = runGit(['rev-parse', '--short', 'HEAD']);
  const previous = runGit(['rev-parse', '--short', 'HEAD~1']);
  const branch = runGit(['branch', '--show-current']);
  const status = runGit(['status', '--short']);
  const finishedAt = new Date();

  console.log(
    JSON.stringify(
      {
        event: 'local_alert_rollback_drill_completed',
        baseUrl,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        controlledAlert: {
          requestId,
          simulatedSeverity: 'S4',
          sink: 'local_stdout_only',
          healthStatus: health.healthStatus,
          status: health.status,
          latencyMs: health.latencyMs,
        },
        rollbackTabletop: {
          branch: branch || '<detached-or-unknown>',
          currentCommit: head || '<unknown>',
          previousCommitAvailable: Boolean(previous),
          workingTreeHasChanges: Boolean(status),
          rollbackAction: 'read_only_rehearsal_no_git_mutation',
          abortCriteriaChecked: [
            'health_not_fail',
            'request_id_present',
            'previous_commit_known',
            'working_tree_status_recorded',
          ],
        },
        sensitiveData: 'no_secrets_no_pii_no_provider_payloads',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('Local alert/rollback drill failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
