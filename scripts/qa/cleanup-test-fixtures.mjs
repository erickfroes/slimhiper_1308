#!/usr/bin/env node
import { cleanupQaFixtures, createAdmin } from './qa-fixtures.mjs';

try {
  const result = await cleanupQaFixtures(createAdmin());
  console.log(JSON.stringify({ status: 'cleaned', ...result }));
} catch (error) {
  console.error(`QA fixture cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
