import { NextResponse } from 'next/server';
import {
  createObservabilityContext,
  logObservedEvent,
  observedHeaders,
} from '@/lib/observability/server';

export const dynamic = 'force-dynamic';

type HealthComponent = {
  status: 'ok' | 'warn' | 'fail';
  detail: string;
};

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function hasAnyEnv(names: string[]) {
  return names.some((name) => hasEnv(name));
}

function hasSupabasePublicConfig() {
  return (
    hasEnv('NEXT_PUBLIC_SUPABASE_URL') &&
    hasAnyEnv(['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'])
  );
}

function currentEnvironment() {
  return (
    process.env.SLIMHIPER_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    'unknown'
  );
}

export async function GET(request: Request) {
  const context = createObservabilityContext('api.health', request);
  const environment = currentEnvironment();
  const mockEnabled = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
  const productionLike = ['staging', 'production'].includes(environment);

  const components: Record<string, HealthComponent> = {
    next: { status: 'ok', detail: 'Next.js route handler respondeu.' },
    supabasePublicConfig: hasSupabasePublicConfig()
      ? { status: 'ok', detail: 'Variaveis publicas Supabase configuradas.' }
      : {
          status: 'warn',
          detail: 'Variaveis publicas Supabase URL/chave publicavel ausentes neste ambiente.',
        },
    mockDataPolicy:
      productionLike && mockEnabled
        ? { status: 'fail', detail: 'Mocks nao podem estar habilitados em staging/producao.' }
        : {
            status: 'ok',
            detail: mockEnabled
              ? 'Mocks habilitados apenas para ambiente descartavel.'
              : 'Mocks desabilitados.',
          },
    releaseMetadata:
      hasEnv('NEXT_PUBLIC_APP_VERSION') || hasEnv('VERCEL_GIT_COMMIT_SHA')
        ? { status: 'ok', detail: 'Metadados de release disponiveis.' }
        : { status: 'warn', detail: 'Metadados de release nao configurados.' },
  };

  const status = Object.values(components).some((component) => component.status === 'fail')
    ? 'fail'
    : Object.values(components).some((component) => component.status === 'warn')
      ? 'warn'
      : 'ok';

  logObservedEvent(
    context,
    'health_check',
    status === 'fail' ? 'error' : 'info',
    status === 'fail' ? 'failure' : 'success',
    {
      environment,
      health_status: status,
      component_count: Object.keys(components).length,
    }
  );

  return NextResponse.json(
    {
      ok: status !== 'fail',
      status,
      environment,
      checkedAt: new Date().toISOString(),
      requestId: context.requestId,
      components,
    },
    { status: status === 'fail' ? 503 : 200, headers: observedHeaders(context) }
  );
}
