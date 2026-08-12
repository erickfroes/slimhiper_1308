import AppLogo from '@/components/ui/AppLogo';
import {
  Bell,
  CalendarDays,
  CreditCard,
  FileText,
  LayoutDashboard,
  LineChart,
  Search,
  Settings,
  Users,
} from 'lucide-react';

const sidebarItems = [
  { label: 'Visão geral', icon: LayoutDashboard, active: true },
  { label: 'Agenda', icon: CalendarDays },
  { label: 'Pacientes', icon: Users },
  { label: 'Documentos', icon: FileText },
  { label: 'Financeiro', icon: CreditCard },
  { label: 'Relatórios', icon: LineChart },
  { label: 'Configurações', icon: Settings },
];

const stats = [
  { label: 'Pacientes ativos', value: '1.248', change: '+12%' },
  { label: 'Consultas', value: '632', change: '+9%' },
  { label: 'Programas', value: '892', change: '+14%' },
  { label: 'Faturamento', value: 'R$ 287.540', change: '+18%' },
];

const agenda = [
  { time: '08:00', title: 'Avaliação inicial', detail: 'Paciente 001' },
  { time: '09:30', title: 'Retorno', detail: 'Paciente 002' },
  { time: '11:00', title: 'Procedimento', detail: 'Paciente 003' },
  { time: '14:00', title: 'Avaliação inicial', detail: 'Paciente 004' },
];

const patients = [
  { initials: 'P1', name: 'Paciente 001', program: 'Programa A', status: 'Ativo' },
  { initials: 'P2', name: 'Paciente 002', program: 'Programa B', status: 'Ativo' },
  { initials: 'P3', name: 'Paciente 003', program: 'Pós-procedimento', status: 'Retorno' },
  { initials: 'P4', name: 'Paciente 004', program: 'Programa A', status: 'Novo' },
];

function MiniLineChart() {
  return (
    <svg
      viewBox="0 0 360 104"
      role="img"
      aria-label="Comparativo visual de receitas e despesas"
      className="h-24 w-full"
    >
      <path
        d="M8 72 C38 58 55 76 84 62 C113 49 130 74 160 54 C196 30 207 62 232 47 C268 25 276 63 306 42 C329 28 344 33 352 24"
        fill="none"
        stroke="#0d9488"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M8 88 C41 80 57 91 84 82 C116 70 134 88 164 74 C198 58 211 83 238 68 C270 54 286 80 315 66 C335 56 345 60 352 52"
        fill="none"
        stroke="#f59e0b"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <g fill="#94a3b8" fontSize="10">
        <text x="8" y="102">
          01
        </text>
        <text x="116" y="102">
          10
        </text>
        <text x="238" y="102">
          20
        </text>
        <text x="335" y="102">
          30
        </text>
      </g>
    </svg>
  );
}

function FunnelChart() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <div className="grid w-full max-w-56 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
        <div className="mx-auto h-8 w-full max-w-44 rounded-t bg-primary" />
        <span>2.350</span>
        <div className="mx-auto h-8 w-10/12 bg-teal-500" />
        <span>1.120</span>
        <div className="mx-auto h-8 w-8/12 bg-sky-200" />
        <span>780</span>
        <div className="mx-auto h-8 w-5/12 rounded-b bg-amber-400" />
        <span>420</span>
      </div>
    </div>
  );
}

export default function ProductPreview({ compact = false }: { compact?: boolean }) {
  return (
    <>
      {compact ? (
        <div
          className="card-shadow-lg overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left sm:hidden"
          aria-label="Prévia visual demonstrativa da operação clínica"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <AppLogo compact size={26} alt="" />
              <div>
                <p className="text-xs font-extrabold text-slate-950">Clínica exemplo</p>
                <p className="text-[11px] text-slate-500">Visão operacional</p>
              </div>
            </div>
            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-primary">
              Demonstração
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] font-semibold text-slate-500">Agenda de hoje</p>
              <p className="mt-1 text-lg font-extrabold text-slate-950">12 consultas</p>
              <p className="text-[11px] font-bold text-primary">3 em andamento</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-semibold text-amber-800">Próxima ação</p>
              <p className="mt-1 text-sm font-extrabold text-slate-950">Documento pendente</p>
              <p className="mt-1 text-[11px] text-amber-800">Revisar antes do checkout</p>
            </div>
          </div>
        </div>
      ) : null}
      <div
        className={[
          'card-shadow-lg relative max-h-[650px] overflow-hidden rounded-xl border border-slate-200 bg-card text-left',
          compact ? 'hidden sm:block' : '',
        ].join(' ')}
        aria-label="Prévia visual do painel SlimHiper com dados demonstrativos"
      >
        <div className="grid min-h-[500px] grid-cols-1 lg:grid-cols-[180px_1fr]">
          <aside className="hidden bg-slate-950 p-4 text-white lg:flex lg:flex-col">
            <div className="mb-5 flex items-center gap-2">
              <AppLogo compact surface="dark" size={28} alt="" />
              <div className="leading-none">
                <p className="text-sm font-bold">SlimHiper</p>
                <p className="text-[11px] text-teal-100/80">Clinic OS</p>
              </div>
            </div>

            <nav className="space-y-1" aria-label="Navegação demonstrativa do produto">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={[
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold',
                      item.active ? 'bg-primary text-white' : 'text-slate-300',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </div>
                );
              })}
            </nav>

            <div className="mt-auto rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] font-semibold">Clínica exemplo</p>
              <p className="mt-1 text-[10px] text-slate-300">Administrador</p>
            </div>
          </aside>

          <div className="min-w-0 bg-slate-50">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-bold text-slate-950">Visão geral</p>
                <p className="mt-0.5 text-xs text-slate-500">Operação clínica demonstrativa</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  Últimos 30 dias
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                  <Search className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </header>

            <div className="space-y-3 p-4 sm:p-5">
              <section
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                aria-label="Indicadores"
              >
                {stats.map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold text-slate-500">{stat.label}</p>
                    <div className="mt-2">
                      <p className="text-xl font-extrabold text-slate-950 2xl:text-2xl">
                        {stat.value}
                      </p>
                      <p className="mt-1 text-xs font-bold text-primary">{stat.change}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">vs. período anterior</p>
                  </div>
                ))}
              </section>

              <section className="grid gap-3 xl:grid-cols-[1fr_1fr_0.95fr]" aria-label="Operação">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-bold text-slate-950">Agenda do dia</p>
                  <div className="mt-3 space-y-2">
                    {agenda.map((item) => (
                      <div
                        key={`${item.time}-${item.title}`}
                        className="grid grid-cols-[42px_1fr] gap-3"
                      >
                        <p className="text-xs font-semibold text-slate-500">{item.time}</p>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{item.title}</p>
                          <p className="text-[11px] text-slate-500">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-bold text-primary">Ver agenda completa</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-bold text-slate-950">Visão do funil</p>
                  <FunnelChart />
                  <p className="text-xs font-bold text-primary">Ver relatório completo</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-bold text-slate-950">Pacientes 360</p>
                  <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-400">
                    Buscar paciente
                  </div>
                  <div className="mt-3 space-y-2">
                    {patients.map((patient) => (
                      <div key={patient.name} className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                          {patient.initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {patient.name}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">{patient.program}</p>
                        </div>
                        <span
                          className={[
                            'rounded-full px-2 py-1 text-[10px] font-bold',
                            patient.status === 'Retorno'
                              ? 'bg-amber-100 text-amber-700'
                              : patient.status === 'Novo'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-emerald-100 text-emerald-700',
                          ].join(' ')}
                        >
                          {patient.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-3 lg:grid-cols-[1fr_0.72fr]" aria-label="Financeiro">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-950">Receitas</p>
                      <p className="text-xl font-extrabold text-slate-950">R$ 287.540</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-950">Despesas</p>
                      <p className="text-xl font-extrabold text-slate-950">R$ 96.230</p>
                    </div>
                  </div>
                  <MiniLineChart />
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-bold text-slate-950">Comunicações</p>
                  <div className="mt-3 space-y-2 text-xs">
                    {['12 novas mensagens', '5 documentos pendentes', '3 lembretes de retorno'].map(
                      (item) => (
                        <div
                          key={item}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-700"
                        >
                          {item}
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        </div>
                      )
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
