import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ChevronRight, ShieldCheck, type LucideIcon } from 'lucide-react';
import ProductPreview from './ProductPreview';
import {
  heroProofItems,
  marketingNavItems,
  moduleItems,
  planItems,
  securityItems,
  workflowSteps,
  type IconContentItem,
} from './marketingContent';

function IconFrame({
  icon: Icon,
  tone = 'primary',
}: {
  icon: LucideIcon;
  tone?: 'primary' | 'sky';
}) {
  return (
    <span
      className={[
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
        tone === 'sky'
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : 'border-primary/20 bg-primary/10 text-primary',
      ].join(' ')}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex min-h-[76px] max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:flex-nowrap lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Image
            src="/assets/images/app_logo.png"
            alt=""
            width={28}
            height={45}
            className="h-10 w-7 object-contain"
            style={{ height: '40px', width: 'auto' }}
            priority
          />
          <span className="leading-none">
            <span className="block text-xl font-extrabold text-slate-950">SlimHiper</span>
            <span className="block text-sm font-semibold text-muted-foreground">Clinic OS</span>
          </span>
        </Link>

        <nav
          aria-label="Navegação institucional"
          className="order-3 flex w-full gap-1 overflow-x-auto text-sm font-semibold text-slate-700 scrollbar-thin lg:order-none lg:ml-auto lg:w-auto lg:overflow-visible"
        >
          {marketingNavItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-4">
          <Link
            href="/auth/login"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Entrar
          </Link>
          <a href="#demonstracao" className="btn-primary whitespace-nowrap">
            Agendar demonstração
          </a>
        </div>
      </div>
    </header>
  );
}

function HeroProofGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5">
      {heroProofItems.map((item) => (
        <div key={item.title} className="flex items-start gap-3">
          <IconFrame icon={item.icon} />
          <div>
            <p className="text-xs font-bold text-slate-950 sm:text-sm">{item.title}</p>
            <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block sm:text-sm sm:leading-6">
              {item.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HeroSection() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-6 pt-8 sm:px-6 lg:grid-cols-[0.83fr_1.17fr] lg:items-center lg:px-8 lg:pb-8 lg:pt-10">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-extrabold leading-[1.08] text-slate-950 sm:text-5xl lg:text-6xl">
            O sistema operacional para clínicas de transformação corporal
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl">
            Pacientes, programas, agenda, documentos, financeiro e portal do paciente em uma
            operação clínica segura.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a href="#demonstracao" className="btn-primary justify-center px-6 py-3 text-base">
              Agendar demonstração
            </a>
            <Link href="/auth/login" className="btn-secondary justify-center px-6 py-3 text-base">
              Entrar no sistema
            </Link>
          </div>
          <div className="mt-8">
            <HeroProofGrid />
          </div>
        </div>

        <div className="hidden min-w-0 lg:block lg:pl-2">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  title,
  description,
  align = 'left',
}: {
  title: string;
  description: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <h2 className="text-3xl font-extrabold leading-tight text-slate-950 sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
    </div>
  );
}

function WorkflowSection() {
  return (
    <section id="operacao" className="scroll-mt-24 bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Fluxo que conecta toda a operação"
          description="Da chegada do lead ao acompanhamento de resultado, a clínica trabalha com etapas claras e informações no mesmo lugar."
          align="center"
        />

        <ol className="mt-12 grid gap-4 md:grid-cols-5">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="relative">
                {index < workflowSteps.length - 1 ? (
                  <div className="absolute left-[calc(50%+2rem)] top-8 hidden h-px w-[calc(100%-4rem)] bg-border md:block" />
                ) : null}
                <div className="relative flex h-full flex-col items-center rounded-lg border border-border bg-card p-5 text-center card-shadow">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-sm font-extrabold text-slate-950">
                    {step.number}. {step.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function ModuleCard({ item }: { item: IconContentItem }) {
  return (
    <article className="flex gap-4 rounded-lg border border-border bg-card p-5 card-shadow">
      <IconFrame icon={item.icon} />
      <div>
        <h3 className="text-base font-bold text-slate-950">{item.title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
      </div>
    </article>
  );
}

function ProductSection() {
  return (
    <section id="produto" className="scroll-mt-24 bg-card py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:px-8">
        <div className="lg:sticky lg:top-28">
          <SectionHeading
            title="Módulos que simplificam o dia a dia"
            description="SlimHiper reúne as superfícies essenciais da clínica em um produto único, com linguagem operacional para equipes que precisam agir rápido."
          />
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#demonstracao" className="btn-primary">
              Ver em demonstração
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link href="/auth/login" className="btn-secondary">
              Acessar sistema
            </Link>
          </div>
          <div className="mt-8 lg:hidden">
            <ProductPreview />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {moduleItems.map((item) => (
            <ModuleCard key={item.title} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section
      id="seguranca"
      className="scroll-mt-24 border-y border-border bg-background py-16 sm:py-20"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.88fr] lg:items-center lg:px-8">
        <div>
          <SectionHeading
            title="Segurança e integrações para uma operação sensível"
            description="Fluxos clínicos, financeiros e documentais precisam de controle deliberado. A página pública não toca dados reais, mas o produto foi pensado para operar com isolamento, auditoria e permissões."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {securityItems.map((item, index) => (
              <article
                key={item.title}
                className="flex gap-4 rounded-lg border border-border bg-card p-5"
              >
                <IconFrame icon={item.icon} tone={index === 1 ? 'sky' : 'primary'} />
                <div>
                  <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-8 text-center card-shadow-md">
          <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <ShieldCheck className="h-16 w-16" strokeWidth={1.8} aria-hidden="true" />
          </div>
          <h3 className="mt-7 text-2xl font-extrabold text-slate-950">Dados sob controle</h3>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            Acesso por perfil, links temporários, documentos protegidos e rotinas de auditoria
            reduzem ruído em uma operação de alto cuidado.
          </p>
          <div className="mt-7 grid gap-3 text-left">
            {['Permissões por função', 'Assinatura digital', 'Cobrança recorrente'].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
                <span className="text-sm font-bold text-slate-800">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PlansSection() {
  return (
    <section id="planos" className="scroll-mt-24 bg-card py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Planos para evoluir sem trocar de operação"
          description="A proposta institucional inicial evita preços inventados: a demonstração deve mapear estágio da clínica, equipe, módulos prioritários e integrações necessárias."
          align="center"
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {planItems.map((item) => (
            <article key={item.title} className="rounded-lg border border-border bg-background p-6">
              <IconFrame icon={item.icon} />
              <h3 className="mt-5 text-lg font-extrabold text-slate-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section
      id="demonstracao"
      className="scroll-mt-24 bg-primary py-12 text-primary-foreground sm:py-14"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
            Pronto para elevar a operação da sua clínica?
          </h2>
          <p className="mt-3 text-base leading-7 text-teal-50">
            Agende uma demonstração personalizada e veja o SlimHiper na prática.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href="mailto:contato@slimhiper.com?subject=Demonstra%C3%A7%C3%A3o%20SlimHiper"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-extrabold text-primary transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            Agendar demonstração
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a
            href="mailto:contato@slimhiper.com?subject=Contato%20com%20especialista"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/35 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            Falar com especialista
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-slate-950 py-8 text-slate-300">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <Image
            src="/assets/images/app_logo.png"
            alt=""
            width={24}
            height={39}
            className="h-8 w-5 object-contain"
            style={{ height: '32px', width: 'auto' }}
          />
          <div>
            <p className="text-sm font-extrabold text-white">SlimHiper Clinic OS</p>
            <p className="text-xs text-slate-400">Operação clínica, documentos e financeiro.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link
            href="/auth/login"
            className="rounded-lg px-2 py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Entrar
          </Link>
          <a
            href="#produto"
            className="rounded-lg px-2 py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Produto
          </a>
          <a
            href="#seguranca"
            className="rounded-lg px-2 py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Segurança
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function MarketingHome() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <HeroSection />
      <WorkflowSection />
      <ProductSection />
      <SecuritySection />
      <PlansSection />
      <DemoSection />
      <Footer />
    </main>
  );
}
