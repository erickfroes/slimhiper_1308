#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const repoRoot = git(['rev-parse', '--show-toplevel']);

function fromRoot(relativePath) {
  return path.join(repoRoot, relativePath);
}

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

function read(relativePath) {
  return readFileSync(fromRoot(relativePath), 'utf8');
}

function exists(relativePath) {
  return existsSync(fromRoot(relativePath));
}

const trackedFiles = git(['ls-files'])
  .split(/\r?\n/)
  .filter(Boolean)
  .map(toPosix);

const results = [];

function add(status, label, detail) {
  results.push({ status, label, detail });
}

function pass(label, detail) {
  add('PASS', label, detail);
}

function warn(label, detail) {
  add('WARN', label, detail);
}

function fail(label, detail) {
  add('FAIL', label, detail);
}

function requireFile(label, relativePath) {
  if (exists(relativePath)) {
    pass(label, relativePath);
  } else {
    fail(label, `${relativePath} is missing`);
  }
}

function hasContent(relativePath, expected) {
  if (!exists(relativePath)) return false;
  const content = read(relativePath);
  return expected.every((entry) => content.includes(entry));
}

const appPages = trackedFiles.filter(
  (file) => file.startsWith('src/app/') && file.endsWith('/page.tsx')
);
const services = trackedFiles.filter(
  (file) => file.startsWith('src/services/') && file.endsWith('.ts') && file.split('/').length === 3
);
const migrations = trackedFiles.filter(
  (file) => file.startsWith('supabase/migrations/') && file.endsWith('.sql')
);
const edgeFunctions = new Set();

for (const file of trackedFiles) {
  if (!file.startsWith('supabase/functions/')) continue;
  const [, , functionName] = file.split('/');
  if (functionName && functionName !== '_shared') edgeFunctions.add(functionName);
}

pass(
  'Repository structure',
  `${appPages.length} app pages, ${services.length} services, ${migrations.length} migrations, ${edgeFunctions.size} Edge Functions`
);

const packageJson = JSON.parse(read('package.json'));
for (const scriptName of ['dev', 'build', 'lint', 'type-check']) {
  if (packageJson.scripts?.[scriptName]) {
    pass(`package.json script: ${scriptName}`, packageJson.scripts[scriptName]);
  } else {
    fail(`package.json script: ${scriptName}`, 'required script is missing');
  }
}

requireFile('Production readiness entrypoint', 'docs/Production_Readiness_Execution_Plan.md');
requireFile('Production readiness plan', 'docs/operations/PRODUCTION_READINESS_EXECUTION_PLAN.md');
requireFile('Production readiness stage tracker', 'docs/operations/PRODUCTION_READINESS_STAGE_TRACKER.md');
requireFile('Supabase static contract audit', 'scripts/operations/check-supabase-contracts.mjs');
requireFile('Release process', 'docs/operations/RELEASE_PROCESS.md');
requireFile('Environment matrix', 'docs/operations/ENVIRONMENT_MATRIX.md');
requireFile('LGPD/security readiness', 'docs/operations/LGPD_SECURITY_READINESS_REVIEW.md');
requireFile('Observability runbook', 'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md');
requireFile('Backup/restore runbook', 'docs/operations/BACKUP_RESTORE_DR_RUNBOOK.md');
requireFile('Incident runbook', 'docs/operations/INCIDENT_RESPONSE_RUNBOOK.md');
requireFile('Browser smoke checklist', 'docs/testing/BROWSER_SMOKE_CHECKLIST.md');

if (
  hasContent('.github/workflows/ci.yml', [
    'npm run type-check',
    'npm run lint',
    'npm run build',
    'scripts/security/check-env-hygiene.mjs',
    'scripts/operations/check-production-readiness.mjs',
    'scripts/operations/check-supabase-contracts.mjs --strict',
    'test-patient360-contract.mjs --mode=fixture',
    'test-d4sign-fixtures.mjs',
    'test-billing-fixtures.mjs',
  ])
) {
  pass('CI required gates', 'quality, env hygiene and fixture contracts are present');
} else {
  fail('CI required gates', '.github/workflows/ci.yml is missing one or more required gates');
}

if (exists('.github/workflows/contract-fixtures.yml')) {
  pass('Manual fixture workflow', '.github/workflows/contract-fixtures.yml');
} else {
  warn('Manual fixture workflow', 'contract fixture workflow is not present');
}

const requiredEnvNames = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_USE_MOCK_DATA',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SLIMHIPER_SMOKE_BASE_URL',
  'D4SIGN_TOKEN_API',
  'D4SIGN_CRYPT_KEY',
  'D4SIGN_WEBHOOK_HMAC_SECRET',
  'ASAAS_API_KEY',
  'ASAAS_WEBHOOK_TOKEN',
  'ALLOW_REMOTE_RLS_SMOKE',
  'ALLOW_REMOTE_PATIENT360_SMOKE',
];
const envExample = exists('.env.example') ? read('.env.example') : '';
const missingEnvNames = requiredEnvNames.filter((name) => !envExample.includes(`${name}=`));
if (missingEnvNames.length === 0) {
  pass('.env.example production checklist', 'required public, backend, provider and smoke names exist');
} else {
  fail('.env.example production checklist', `missing names: ${missingEnvNames.join(', ')}`);
}

const appEnvTokens = [
  process.env.SLIMHIPER_ENVIRONMENT,
  process.env.NEXT_PUBLIC_APP_ENV,
  process.env.NODE_ENV,
]
  .filter(Boolean)
  .map((value) => value.toLowerCase());
const productionLike = appEnvTokens.some((value) =>
  ['staging', 'production', 'prod'].includes(value)
);
if (productionLike && process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
  fail(
    'Production-like mock policy',
    'NEXT_PUBLIC_USE_MOCK_DATA=true is not allowed in staging/production'
  );
} else if (productionLike) {
  pass('Production-like mock policy', 'mock flag is absent or false');
} else {
  warn(
    'Production-like mock policy',
    'not running with SLIMHIPER_ENVIRONMENT/NEXT_PUBLIC_APP_ENV/NODE_ENV set to staging or production'
  );
}

const serviceRoleLiteralRefs = trackedFiles.filter((file) => {
  if (!/\.(ts|tsx|js|mjs|md|sql|toml|yml|yaml|example)$/.test(file)) return false;
  if (!exists(file)) return false;
  return read(file).includes('SUPABASE_SERVICE_ROLE_KEY');
});
const allowedServiceRoleLiteral = (file) =>
  file === '.env.example' ||
  file === 'src/lib/supabase/admin.ts' ||
  file.startsWith('scripts/supabase/') ||
  file.startsWith('scripts/operations/') ||
  file.startsWith('supabase/functions/') ||
  file.startsWith('supabase/migrations/') ||
  file.startsWith('docs/') ||
  file === 'AGENTS.md';
const forbiddenServiceRoleLiteralRefs = serviceRoleLiteralRefs.filter(
  (file) => !allowedServiceRoleLiteral(file)
);
if (forbiddenServiceRoleLiteralRefs.length === 0) {
  pass('Service-role literal placement', 'only allowed server/script/docs paths reference the env name');
} else {
  fail(
    'Service-role literal placement',
    forbiddenServiceRoleLiteralRefs.slice(0, 20).join(', ')
  );
}

const mockFlagRefs = trackedFiles.filter((file) => {
  if (!file.startsWith('src/')) return false;
  if (!/\.(ts|tsx)$/.test(file)) return false;
  return read(file).includes('NEXT_PUBLIC_USE_MOCK_DATA');
});
const allowedMockFlagRefs = new Set(['src/lib/mockMode.ts']);
const directMockFlagRefs = mockFlagRefs.filter((file) => !allowedMockFlagRefs.has(file));
if (directMockFlagRefs.length === 0) {
  pass(
    'Mock flag policy',
    'NEXT_PUBLIC_USE_MOCK_DATA is centralized through src/lib/mockMode.ts'
  );
} else {
  warn(
    'Mock flag policy',
    `${directMockFlagRefs.length} source files still read NEXT_PUBLIC_USE_MOCK_DATA directly`
  );
}

const mockProviderModules = [
  '@/services/mockApi',
  '@/data/mockData',
  '@/data/mockBuilderData',
  '@/data/mockCommercialData',
];
const staticMockImportPattern = new RegExp(
  `import\\s+(?:type\\s+)?[\\s\\S]*?\\s+from\\s+['"](${mockProviderModules
    .map((moduleName) => moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})['"]`,
  'g'
);
const allowedMockProviderFiles = new Set([
  'src/services/mockApi.ts',
  'src/data/mockData.ts',
  'src/data/mockBuilderData.ts',
  'src/data/mockCommercialData.ts',
]);
const staticMockImportRefs = trackedFiles.filter((file) => {
  if (!file.startsWith('src/')) return false;
  if (!/\.(ts|tsx)$/.test(file)) return false;
  if (allowedMockProviderFiles.has(file)) return false;
  const content = read(file);
  staticMockImportPattern.lastIndex = 0;
  return staticMockImportPattern.test(content);
});
if (staticMockImportRefs.length === 0) {
  pass('Static mock imports in src', 'none found outside mock provider modules');
} else {
  warn(
    'Static mock imports in src',
    `${staticMockImportRefs.length} files statically import mock providers: ${staticMockImportRefs
      .slice(0, 20)
      .join(', ')}`
  );
}

if (exists('src/app/api/health/route.ts')) {
  const healthRoute = read('src/app/api/health/route.ts');
  if (
    healthRoute.includes('getMockDataPolicy') &&
    healthRoute.includes('blockedByEnvironment') &&
    healthRoute.includes('productionLike')
  ) {
    pass('/api/health mock gate', 'health route checks production-like mock policy');
  } else {
    warn('/api/health mock gate', 'health route exists but mock policy check was not detected');
  }
} else {
  fail('/api/health mock gate', 'health route is missing');
}

const statusWeight = { PASS: 0, WARN: 1, FAIL: 2 };
const sortedResults = [...results].sort(
  (a, b) => statusWeight[b.status] - statusWeight[a.status] || a.label.localeCompare(b.label)
);

for (const result of sortedResults) {
  console.log(`[${result.status}] ${result.label}: ${result.detail}`);
}

const failures = results.filter((result) => result.status === 'FAIL');
const warnings = results.filter((result) => result.status === 'WARN');

console.log('');
console.log(
  `Summary: ${results.length - warnings.length - failures.length} pass, ${warnings.length} warn, ${failures.length} fail.`
);

if (failures.length > 0) {
  console.error('Production readiness audit failed.');
  process.exit(1);
}

if (strict && warnings.length > 0) {
  console.error('Production readiness audit failed in --strict mode because warnings are present.');
  process.exit(1);
}

console.log(
  'Production readiness audit completed. External staging/provider/LGPD evidence is still required for go-live.'
);
