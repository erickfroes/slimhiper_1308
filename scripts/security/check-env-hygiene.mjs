#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const allowed = new Set(['.env.example']);
const allowedEnvTemplatePattern = /^\.env(?:\.[a-z0-9_-]+)*\.example$/i;

const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
const trackedEnvLike = output
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((path) => {
    const normalized = path.replace(/\\/g, '/');
    const basename = normalized.split('/').pop() ?? normalized;
    const lower = basename.toLowerCase();
    if (
      allowed.has(normalized) ||
      allowed.has(basename) ||
      allowedEnvTemplatePattern.test(basename)
    ) {
      return false;
    }

    return (
      lower === '.env' ||
      lower.startsWith('.env.') ||
      lower.endsWith('.env') ||
      lower.includes('copia.env') ||
      lower.includes('copy.env')
    );
  });

if (trackedEnvLike.length > 0) {
  console.error('Tracked env-like files are not allowed:');
  for (const path of trackedEnvLike) console.error(`- ${path}`);
  process.exit(1);
}

console.log('Env hygiene check passed.');
