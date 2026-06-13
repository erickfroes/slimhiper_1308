#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_PATIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEFAULT_TIMEOUT_MS = 20000;
const SUPPORTED_PROFILES = ['clinic', 'admin', 'patient'];

const PROFILE_CONFIG = {
  clinic: {
    envPrefix: 'SLIMHIPER_CLINIC_SMOKE',
    viewport: { width: 390, height: 844 },
    landingPath: '/clinic/dashboard',
    routes: [
      {
        label: 'clinic dashboard',
        path: '/clinic/dashboard',
        expectedText: /Dashboard operacional|Dashboard indisponivel|Dashboard/i,
      },
      {
        label: 'clinic patient 360',
        path: ({ patientId }) => `/clinic/patients/${patientId}`,
        expectedText: /Paciente 360|Paciente 360°/i,
      },
      {
        label: 'clinic settings',
        path: '/clinic/settings',
        expectedText: /Configuracoes|Configuracoes da Clinica/i,
      },
      {
        label: 'clinic inbox',
        path: '/clinic/inbox',
        expectedText: /Inbox|Conversas|Notificacoes/i,
      },
    ],
    interactions: [runClinicPatientSearch],
  },
  admin: {
    envPrefix: 'SLIMHIPER_ADMIN_SMOKE',
    viewport: { width: 1280, height: 720 },
    landingPath: '/admin',
    routes: [
      {
        label: 'admin dashboard',
        path: '/admin',
        expectedText: /SlimHiper|Admin|Tenants|Webhooks/i,
      },
      {
        label: 'admin tenants',
        path: '/admin/tenants',
        expectedText: /Gestao de Tenants|Tenants/i,
      },
      {
        label: 'admin webhooks',
        path: '/admin/webhooks',
        expectedText: /Monitor de Webhooks|Webhooks/i,
      },
    ],
    interactions: [],
  },
  patient: {
    envPrefix: 'SLIMHIPER_PATIENT_SMOKE',
    viewport: { width: 390, height: 844 },
    landingPath: '/patient',
    routes: [
      {
        label: 'patient portal',
        path: '/patient',
        expectedText: /Portal SlimHiper|Ola,/i,
      },
    ],
    interactions: [runPatientDocumentsTab],
  },
};

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeBaseUrl(value) {
  assert(value, 'Missing --base-url or SLIMHIPER_SMOKE_BASE_URL.');
  return value.replace(/\/$/, '');
}

function readFlag(value) {
  return ['1', 'true', 'yes', 'y', 'sim'].includes(String(value ?? '').trim().toLowerCase());
}

function parseProfiles(value) {
  if (!value) return SUPPORTED_PROFILES;
  const profiles = String(value)
    .split(',')
    .map((profile) => profile.trim().toLowerCase())
    .filter(Boolean);
  for (const profile of profiles) {
    assert(
      SUPPORTED_PROFILES.includes(profile),
      `Unsupported smoke profile "${profile}". Use: ${SUPPORTED_PROFILES.join(', ')}.`
    );
  }
  return [...new Set(profiles)];
}

function resolveScreenshotDir(value) {
  const fallback = path.join(
    os.tmpdir(),
    `slimhiper-auth-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`
  );
  const dir = value || fallback;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getCredentials(profile) {
  const { envPrefix } = PROFILE_CONFIG[profile];
  const emailVar = `${envPrefix}_EMAIL`;
  const passwordVar = `${envPrefix}_PASSWORD`;
  const email = process.env[emailVar] || '';
  const password = process.env[passwordVar] || '';
  return { emailVar, passwordVar, email, password };
}

function validateCredentials(profiles) {
  const missing = [];
  for (const profile of profiles) {
    const credentials = getCredentials(profile);
    if (!credentials.email) missing.push(credentials.emailVar);
    if (!credentials.password) missing.push(credentials.passwordVar);
  }
  assert(
    missing.length === 0,
    `Missing smoke credentials: ${missing.join(', ')}. Do not print values; inject them via a secret manager or local shell.`
  );
}

function sanitizeLogMessage(value) {
  return String(value ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    .replace(/(sb-[a-z0-9-]+-auth-token(?:\.[0-9]+)?=)[^;\s]+/gi, '$1<redacted>')
    .replace(/(bearer\s+)[a-z0-9._-]+/gi, '$1<redacted>')
    .replace(/[A-Za-z0-9_-]{32,}/g, '<redacted>')
    .slice(0, 240);
}

async function importPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    throw new Error(
      [
        'Playwright is required for staging-authenticated-browser-smoke.mjs.',
        'Run it in a runner with the playwright package and Chromium browser installed.',
        `Original import error: ${sanitizeLogMessage(error instanceof Error ? error.message : String(error))}`,
      ].join(' ')
    );
  }
}

async function gotoAndCheck(page, baseUrl, route, context) {
  const routePath = typeof route.path === 'function' ? route.path(context) : route.path;
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded' });
  await verifyRenderedPage(page, route.expectedText, route.label);
  return routePath;
}

async function verifyRenderedPage(page, expectedText, label, minTextLength = 80) {
  await page
    .waitForFunction((minimum) => document.body.innerText.trim().length > minimum, minTextLength, {
      timeout: DEFAULT_TIMEOUT_MS,
    })
    .catch((error) => {
      throw new Error(
        `${label} rendered too little text for smoke validation. ${sanitizeLogMessage(
          error instanceof Error ? error.message : String(error)
        )}`
      );
    });

  await page
    .waitForFunction(
      ({ source, flags }) => new RegExp(source, flags).test(document.body.innerText),
      { source: expectedText.source, flags: expectedText.flags.replace('g', '') },
      { timeout: DEFAULT_TIMEOUT_MS }
    )
    .catch((error) => {
      throw new Error(
        `${label} did not render expected screen copy. ${sanitizeLogMessage(
          error instanceof Error ? error.message : String(error)
        )}`
      );
    });

  const bodyText = await page.locator('body').innerText({ timeout: DEFAULT_TIMEOUT_MS });
  assert(
    bodyText.trim().length > minTextLength,
    `${label} rendered a blank or near-blank body.`
  );

  const hasNextPortal = await page
    .locator('nextjs-portal')
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  const hasOverlayText = await page
    .getByText(/Application error|Unhandled Runtime Error|Hydration failed|Failed to compile/i)
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  assert(!hasNextPortal && !hasOverlayText, `${label} rendered a framework error overlay.`);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert(horizontalOverflow <= 4, `${label} has horizontal page overflow of ${horizontalOverflow}px.`);
}

async function screenshot(page, screenshotDir, label, screenshotsEnabled) {
  if (!screenshotsEnabled) return null;
  const fileName = `${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')}.png`;
  const target = path.join(screenshotDir, fileName);
  await page.screenshot({ path: target, fullPage: false });
  return target;
}

async function waitForClientInteractionReady(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page
    .waitForFunction(() => document.readyState === 'complete', null, { timeout: 5000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function login(page, baseUrl, profile, credentials) {
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'domcontentloaded' });
  await verifyRenderedPage(page, /Entrar|E-mail/i, `${profile} login page`, 12);
  await waitForClientInteractionReady(page);
  await page.locator('#login-email').fill(credentials.email);
  await page.locator('#login-password').fill(credentials.password);

  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), {
      timeout: DEFAULT_TIMEOUT_MS,
    }),
    page.getByRole('button', { name: /^Entrar|Entrando/i }).click(),
  ]).catch(async (error) => {
    const alertText = await page
      .getByRole('alert')
      .innerText({ timeout: 1000 })
      .catch(() => '');
    const suffix = alertText ? ` Alert: ${sanitizeLogMessage(alertText)}.` : '';
    throw new Error(
      `${profile} login did not leave /auth/login.${suffix} ${sanitizeLogMessage(
        error instanceof Error ? error.message : String(error)
      )}`
    );
  });

  const expectedPath = PROFILE_CONFIG[profile].landingPath;
  const currentUrl = new URL(page.url());
  assert(
    currentUrl.pathname.startsWith(expectedPath),
    `${profile} login landed on ${currentUrl.pathname}; expected ${expectedPath}.`
  );
}

async function runClinicPatientSearch({ page }) {
  await waitForClientInteractionReady(page);
  await page.locator('input[aria-label="Buscar pacientes"]').fill('Juliana');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/clinic/patients' && url.search.includes('search='), {
      timeout: DEFAULT_TIMEOUT_MS,
    }),
    page.locator('button[aria-label="Executar busca de pacientes"]').click(),
  ]).catch((error) => {
    throw new Error(
      `clinic patient search did not navigate through the topbar form. ${sanitizeLogMessage(
        error instanceof Error ? error.message : String(error)
      )}`
    );
  });
  await verifyRenderedPage(page, /Pacientes|Paciente|Nenhum paciente encontrado|Juliana/i, 'clinic patient search');
  return '/clinic/patients?search=Juliana';
}

async function runPatientDocumentsTab({ page }) {
  await waitForClientInteractionReady(page);
  const mobileDocsButton = page.getByRole('button', { name: /^Docs$/ }).last();
  if ((await mobileDocsButton.count()) > 0) {
    await mobileDocsButton.click();
  } else {
    await page.getByRole('tab', { name: /Documentos/i }).click();
  }
  await verifyRenderedPage(page, /Documentos liberados|Nenhum documento liberado/i, 'patient documents tab');
  return '/patient#documentos';
}

function attachConsoleCollectors(page, profile) {
  const issues = [];
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    issues.push({
      profile,
      type: message.type(),
      text: sanitizeLogMessage(message.text()),
    });
  });
  page.on('pageerror', (error) => {
    issues.push({
      profile,
      type: 'pageerror',
      text: sanitizeLogMessage(error.message),
    });
  });
  return issues;
}

async function runProfile({ browser, baseUrl, profile, patientId, screenshotDir, screenshotsEnabled }) {
  const config = PROFILE_CONFIG[profile];
  const credentials = getCredentials(profile);
  const context = await browser.newContext({
    viewport: config.viewport,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const consoleIssues = attachConsoleCollectors(page, profile);
  const results = [];

  try {
    await login(page, baseUrl, profile, credentials);
    results.push({
      profile,
      target: `${profile} login`,
      path: new URL(page.url()).pathname,
      screenshot: await screenshot(page, screenshotDir, `${profile}-landing`, screenshotsEnabled),
    });

    for (const interaction of config.interactions) {
      const routePath = await interaction({ page, baseUrl, patientId });
      results.push({
        profile,
        target: interaction.name,
        path: routePath,
        screenshot: await screenshot(page, screenshotDir, `${profile}-${interaction.name}`, screenshotsEnabled),
      });
    }

    for (const route of config.routes) {
      const routePath = await gotoAndCheck(page, baseUrl, route, { patientId });
      results.push({
        profile,
        target: route.label,
        path: routePath,
        screenshot: await screenshot(page, screenshotDir, `${profile}-${route.label}`, screenshotsEnabled),
      });
    }
  } finally {
    await context.close();
  }

  return { results, consoleIssues };
}

function assertConsoleHealth(allIssues, failOnConsoleWarning) {
  const relevantIssues = allIssues.filter(
    (issue) => issue.type === 'error' || issue.type === 'pageerror' || failOnConsoleWarning
  );
  if (relevantIssues.length === 0) return;

  const summary = relevantIssues
    .slice(0, 5)
    .map((issue) => `[${issue.profile}] ${issue.type}: ${issue.text}`)
    .join(' | ');
  throw new Error(`Browser console/page errors detected (${relevantIssues.length}). ${summary}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.get('base-url') || process.env.SLIMHIPER_SMOKE_BASE_URL);
  const profiles = parseProfiles(args.get('profiles') || process.env.SLIMHIPER_SMOKE_PROFILES);
  const patientId = args.get('patient-id') || process.env.SLIMHIPER_SMOKE_PATIENT_ID || DEFAULT_PATIENT_ID;
  const headed =
    readFlag(args.get('headed')) ||
    String(process.env.SLIMHIPER_SMOKE_HEADLESS ?? '').trim().toLowerCase() === 'false';
  const headless = !headed;
  const failOnConsoleWarning =
    readFlag(args.get('fail-on-console-warning')) || readFlag(process.env.SLIMHIPER_FAIL_ON_CONSOLE_WARNING);
  const screenshotsEnabled =
    !readFlag(args.get('no-screenshots')) &&
    String(process.env.SLIMHIPER_SMOKE_SCREENSHOTS ?? '').trim().toLowerCase() !== 'false';
  const screenshotDir = resolveScreenshotDir(process.env.SLIMHIPER_SMOKE_SCREENSHOT_DIR);

  validateCredentials(profiles);

  const { chromium } = await importPlaywright();
  let browser;
  try {
    browser = await chromium.launch({ headless });
  } catch (error) {
    throw new Error(
      [
        'Could not launch Chromium for authenticated browser smoke.',
        'Ensure Playwright browsers are installed in this runner.',
        `Original launch error: ${sanitizeLogMessage(error instanceof Error ? error.message : String(error))}`,
      ].join(' ')
    );
  }

  const allResults = [];
  const allIssues = [];
  try {
    for (const profile of profiles) {
      const { results, consoleIssues } = await runProfile({
        browser,
        baseUrl,
        profile,
        patientId,
        screenshotDir,
        screenshotsEnabled,
      });
      allResults.push(...results);
      allIssues.push(...consoleIssues);
    }
  } finally {
    await browser.close();
  }

  assertConsoleHealth(allIssues, failOnConsoleWarning);

  console.log('Authenticated browser smoke passed.');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Profiles: ${profiles.join(', ')}`);
  for (const result of allResults) {
    const screenshotSuffix = result.screenshot ? ` screenshot=${result.screenshot}` : '';
    console.log(`- [${result.profile}] ${result.path}: ${result.target}${screenshotSuffix}`);
  }
  if (allIssues.length > 0) {
    console.log(`Console warnings captured but not blocking: ${allIssues.length}.`);
  }
}

main().catch((error) => {
  console.error('Authenticated browser smoke failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
