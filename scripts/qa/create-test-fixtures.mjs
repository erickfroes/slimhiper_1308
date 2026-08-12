#!/usr/bin/env node
import { cleanupQaFixtures, createAdmin, seedQaFixtures } from './qa-fixtures.mjs';

const admin = createAdmin();
try {
  await cleanupQaFixtures(admin);
  const fixture = await seedQaFixtures(admin);
  console.log(JSON.stringify({ status: 'seeded', aliases: Object.keys(fixture.users), tenants: 2 }));
} catch (error) {
  console.error(`QA fixture seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
