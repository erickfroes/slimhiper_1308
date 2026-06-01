import type React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  HardDrive,
  ServerCog,
  ShieldAlert,
  Webhook,
} from 'lucide-react';
import AdminShell from '@/app/admin/components/AdminShell';

type MonitorStatus = 'ok' | 'watch' | 'critical';

type MonitorCard = {
  title: string;
  status: MonitorStatus;
  owner: string;
  target: string;
  signal: string;
  icon: React.ElementType;
};

const statusConfig = {
  ok: {
    label: 'OK',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  watch: {
    label: 'Atencao',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  critical: {
    label: 'Critico',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
};

const monitors: MonitorCard[] = [
  {
    title: 'Frontend Next.js',
    status: 'ok',
    owner: 'Platform on-call',
    target: '/api/health + rotas anonimas/protegidas',
    signal: '5xx, latencia p95, erro de hidratacao e falha de deploy',
    icon: Activity,
  },
  {
    title: 'Auth e sessoes SSR',
    status: 'watch',
    owner: 'Security on-call',
    target: '/api/auth/app-session e redirects fail-closed',
    signal: 'auth/session failures e denied spikes por ambiente',
    icon: ShieldAlert,
  },
  {
    title: 'Edge Functions clinicas',
    status: 'ok',
    owner: 'Backend on-call',
    target: 'Paciente 360, documentos, relatorios, nutricao e billing',
    signal: '5xx, envelope invalido, retries e latencia por funcao',
    icon: ServerCog,
  },
  {
    title: 'Webhooks D4Sign/Asaas',
    status: 'watch',
    owner: 'Integrations on-call',
    target: 'webhook-d4sign e webhook-asaas',
    signal: 'signature failures, idempotencia, dead-letter e divergencia',
    icon: Webhook,
  },
  {
    title: 'Banco e RPCs criticos',
    status: 'ok',
    owner: 'Data on-call',
    target: 'RPCs admin, reports, CRM, estoque, financeiro e Patient 360',
    signal: 'latencia p95, denied spikes, erro de contrato e RLS fail-closed',
    icon: Database,
  },
  {
    title: 'Storage assinado',
    status: 'ok',
    owner: 'Backend on-call',
    target: 'document-signed-url e buckets de documentos',
    signal: '403/404 esperados, assinatura curta e erro de bucket',
    icon: HardDrive,
  },
];

const alertRules = [
  [
    'S1',
    'Indisponibilidade geral, vazamento suspeito ou provider financeiro/documental em erro amplo',
    '15 min',
  ],
  ['S2', '5xx sustentado, webhook falhando, jobs atrasados ou conciliacao divergente', '30 min'],
  ['S3', 'Aumento de denied spikes, latencia p95 ou fila operacional acima do limite', '4 h uteis'],
  ['S4', 'Ruido, melhoria de dashboard, documentacao ou follow-up nao urgente', '2 dias uteis'],
] as const;

function StatusBadge({ status }: { status: MonitorStatus }) {
  const config = statusConfig[status];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

export default function ObservabilityDashboardContent() {
  return (
    <AdminShell
      activeSection="observability"
      title="Observabilidade operacional"
      description="Painel de prontidao por ambiente, sem dados sensiveis, alinhado ao runbook da PR 10.2."
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card-base p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <CheckCircle2 size={16} className="text-emerald-600" /> Health endpoint
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              `/api/health` retorna status seguro por ambiente, request id e componentes sem expor
              secrets, cookies, PII/PHI, payloads de provider ou URLs assinadas.
            </p>
          </div>
          <div className="card-base p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <Clock size={16} className="text-blue-600" /> Smoke pos-deploy
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              `node scripts/observability/post-deploy-smoke.mjs --base-url ...` valida rotas
              anonimas/protegidas e headers de correlacao em modo read-only.
            </p>
          </div>
          <div className="card-base p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <FileText size={16} className="text-primary" /> Runbook
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Canais, severidades, owners, metricas e criterios de escalonamento ficam em
              `docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md`.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {monitors.map((monitor) => {
            const Icon = monitor.icon;
            return (
              <div key={monitor.title} className="card-base p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">{monitor.title}</h2>
                      <p className="text-xs text-muted-foreground">{monitor.owner}</p>
                    </div>
                  </div>
                  <StatusBadge status={monitor.status} />
                </div>
                <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-muted-foreground">Alvo</dt>
                    <dd className="mt-1 text-foreground">{monitor.target}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted-foreground">Sinais monitorados</dt>
                    <dd className="mt-1 text-foreground">{monitor.signal}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>

        <div className="card-base overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <AlertTriangle size={16} className="text-amber-600" /> Severidades e SLA de ack
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Severidade</th>
                  <th className="px-4 py-3 text-left font-semibold">Criterio</th>
                  <th className="px-4 py-3 text-left font-semibold">Ack maximo</th>
                </tr>
              </thead>
              <tbody>
                {alertRules.map(([severity, criterion, ack]) => (
                  <tr key={severity} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono font-bold text-foreground">{severity}</td>
                    <td className="px-4 py-3 text-foreground">{criterion}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{ack}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
