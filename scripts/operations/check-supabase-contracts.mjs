#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

function walk(relativePath, predicate) {
  const root = fromRoot(relativePath);
  if (!existsSync(root)) return [];

  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of readdirSync(current)) {
      const absolute = path.join(current, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
        stack.push(absolute);
        continue;
      }

      const relative = toPosix(path.relative(repoRoot, absolute));
      if (!predicate || predicate(relative)) files.push(relative);
    }
  }
  return files.sort();
}

function lineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

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

const sourceFiles = [
  ...walk('src', (file) => /\.(ts|tsx)$/.test(file)),
  ...walk('supabase/functions', (file) => /\.(ts|tsx)$/.test(file)),
];
const migrationFiles = walk('supabase/migrations', (file) => file.endsWith('.sql'));
const edgeFunctionDirs = exists('supabase/functions')
  ? readdirSync(fromRoot('supabase/functions'))
      .filter((entry) => {
        if (entry === '_shared') return false;
        return statSync(fromRoot(`supabase/functions/${entry}`)).isDirectory();
      })
      .sort()
  : [];
const edgeFunctionDirSet = new Set(edgeFunctionDirs);

if (sourceFiles.length === 0) {
  fail('Source scan', 'no src or supabase/functions TypeScript files found');
} else {
  pass('Source scan', `${sourceFiles.length} TypeScript source files scanned`);
}

if (migrationFiles.length === 0) {
  fail('Migration scan', 'no migration SQL files found');
} else {
  pass('Migration scan', `${migrationFiles.length} migration files scanned`);
}

if (edgeFunctionDirs.length === 0) {
  fail('Edge Function scan', 'no supabase/functions directories found');
} else {
  pass('Edge Function scan', `${edgeFunctionDirs.length} Edge Function directories found`);
}

const migrationFunctionNames = new Set();
const createFunctionPattern =
  /\bcreate\s+(?:or\s+replace\s+)?function(?:\s+if\s+not\s+exists)?\s+(?:(?:"?[a-zA-Z_][\w]*"?\.)?)"?([a-zA-Z_][\w]*)"?\s*\(/gi;

for (const file of migrationFiles) {
  const content = read(file);
  for (const match of content.matchAll(createFunctionPattern)) {
    migrationFunctionNames.add(match[1]);
  }
}

if (migrationFunctionNames.size === 0) {
  fail('RPC definition inventory', 'no SQL function definitions detected in migrations');
} else {
  pass('RPC definition inventory', `${migrationFunctionNames.size} SQL function names detected`);
}

const rpcUsages = [];
const edgeReferences = [];
const dynamicEdgeInvocations = [];
const rpcPattern = /\.\s*rpc\s*(?:<[^>]*>)?\(\s*['"`]([a-zA-Z_][\w]*)['"`]/g;
const directEdgeInvokePattern =
  /functions\s*\.\s*invoke\s*(?:<[^>]*>)?\(\s*['"`]([a-zA-Z0-9][a-zA-Z0-9_-]*)['"`]/g;
const helperEdgeInvokePattern =
  /\b(?=[a-zA-Z_$][\w$]*)(?=[\w$]*invoke)[a-zA-Z_$][\w$]*\s*(?:<[^>]*>)?\(\s*['"`]([a-zA-Z0-9][a-zA-Z0-9_-]*-[a-zA-Z0-9_-]*)['"`]/gi;
const dynamicEdgeInvokePattern = /functions\s*\.\s*invoke\s*(?:<[^>]*>)?\(\s*([^'"`\s][^,\r\n)]*)/g;

for (const file of sourceFiles) {
  const content = read(file);

  for (const match of content.matchAll(rpcPattern)) {
    rpcUsages.push({ name: match[1], file, line: lineNumber(content, match.index ?? 0) });
  }

  for (const match of content.matchAll(directEdgeInvokePattern)) {
    edgeReferences.push({
      name: match[1],
      file,
      line: lineNumber(content, match.index ?? 0),
      via: 'direct',
    });
  }

  for (const match of content.matchAll(helperEdgeInvokePattern)) {
    edgeReferences.push({
      name: match[1],
      file,
      line: lineNumber(content, match.index ?? 0),
      via: 'helper',
    });
  }

  for (const match of content.matchAll(dynamicEdgeInvokePattern)) {
    const expression = match[1].trim();
    if (expression.startsWith("'") || expression.startsWith('"') || expression.startsWith('`')) {
      continue;
    }
    dynamicEdgeInvocations.push({
      expression,
      file,
      line: lineNumber(content, match.index ?? 0),
    });
  }
}

const uniqueRpcUsages = uniqueBy(rpcUsages, (usage) => usage.name);
const missingRpcDefinitions = uniqueRpcUsages
  .filter((usage) => !migrationFunctionNames.has(usage.name))
  .sort((a, b) => a.name.localeCompare(b.name));

if (uniqueRpcUsages.length === 0) {
  warn('RPC usage inventory', 'no Supabase RPC usages detected in source');
} else {
  pass('RPC usage inventory', `${uniqueRpcUsages.length} unique RPC names detected in source`);
}

if (missingRpcDefinitions.length === 0) {
  pass('RPC definitions covered by migrations', 'all detected RPC names have migration definitions');
} else {
  warn(
    'RPC definitions covered by migrations',
    missingRpcDefinitions
      .slice(0, 30)
      .map((usage) => `${usage.name} (${usage.file}:${usage.line})`)
      .join(', ')
  );
}

const uniqueEdgeReferences = uniqueBy(edgeReferences, (usage) => `${usage.name}:${usage.file}`);
const missingEdgeFunctions = uniqueBy(
  uniqueEdgeReferences.filter((usage) => !edgeFunctionDirSet.has(usage.name)),
  (usage) => usage.name
).sort((a, b) => a.name.localeCompare(b.name));

if (uniqueEdgeReferences.length === 0) {
  warn('Edge Function reference inventory', 'no literal Edge Function references detected in source');
} else {
  pass(
    'Edge Function reference inventory',
    `${uniqueEdgeReferences.length} literal references detected in source`
  );
}

if (missingEdgeFunctions.length === 0) {
  pass('Edge Function directories covered', 'all literal references have directories');
} else {
  warn(
    'Edge Function directories covered',
    missingEdgeFunctions
      .slice(0, 30)
      .map((usage) => `${usage.name} (${usage.file}:${usage.line})`)
      .join(', ')
  );
}

const uniqueDynamicInvocations = uniqueBy(
  dynamicEdgeInvocations,
  (usage) => `${usage.file}:${usage.line}:${usage.expression}`
);
const edgeReferenceFiles = new Set(uniqueEdgeReferences.map((usage) => usage.file));
const opaqueDynamicInvocations = uniqueDynamicInvocations.filter(
  (usage) => !edgeReferenceFiles.has(usage.file)
);
if (uniqueDynamicInvocations.length === 0) {
  pass('Dynamic Edge Function invocations', 'none detected');
} else if (opaqueDynamicInvocations.length === 0) {
  pass(
    'Dynamic Edge Function invocations',
    `${uniqueDynamicInvocations.length} wrapper calls detected, all backed by literal references in the same file`
  );
} else {
  warn(
    'Dynamic Edge Function invocations',
    opaqueDynamicInvocations
      .slice(0, 30)
      .map((usage) => `${usage.expression} (${usage.file}:${usage.line})`)
      .join(', ')
  );
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
  console.error('Supabase static contract audit failed.');
  process.exit(1);
}

if (strict && warnings.length > 0) {
  console.error('Supabase static contract audit failed in --strict mode because warnings are present.');
  process.exit(1);
}

console.log(
  'Supabase static contract audit completed. Runtime RLS/RBAC and provider evidence still require authorized local/staging smokes.'
);
