import {
  Activity,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileText,
  LockKeyhole,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export type MarketingNavItem = {
  label: string;
  href: string;
};

export type IconContentItem = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export type WorkflowStep = IconContentItem & {
  number: string;
};

export const heroContent = {
  eyebrow: 'Clinic OS para operações de transformação corporal',
  title: 'A operação da sua clínica, conectada do primeiro contato ao acompanhamento.',
  description:
    'Agenda, pacientes, prontuário, documentos, financeiro e portal em um fluxo rastreável para a equipe agir com contexto.',
  primaryCta: { label: 'Agendar demonstração', href: '#demonstracao' },
  secondaryCta: { label: 'Conhecer a plataforma', href: '#produto' },
};

export const marketingNavItems: MarketingNavItem[] = [
  { label: 'Produto', href: '#produto' },
  { label: 'Operação', href: '#operacao' },
  { label: 'Segurança', href: '#seguranca' },
  { label: 'Planos', href: '#planos' },
];

export const heroProofItems: IconContentItem[] = [
  {
    title: 'Atendimento conectado',
    description: 'Agenda, prontuário e evolução no mesmo fluxo.',
    icon: ShieldCheck,
  },
  {
    title: 'Operação coordenada',
    description: 'Equipe, tarefas e etapas com menos ruído.',
    icon: BadgeCheck,
  },
  {
    title: 'Dados sob controle',
    description: 'Permissões, auditoria e contexto para decidir.',
    icon: TrendingUp,
  },
];

export const workflowSteps: WorkflowStep[] = [
  {
    number: '1',
    title: 'Captação',
    description: 'Leads organizados e qualificados.',
    icon: UsersRound,
  },
  {
    number: '2',
    title: 'Avaliação',
    description: 'Anamnese, fotos e protocolos.',
    icon: ClipboardCheck,
  },
  {
    number: '3',
    title: 'Programa',
    description: 'Planos personalizados e evolução.',
    icon: BookOpen,
  },
  {
    number: '4',
    title: 'Atendimento',
    description: 'Agenda, equipe e procedimentos.',
    icon: CalendarDays,
  },
  {
    number: '5',
    title: 'Resultado',
    description: 'Acompanhamento, retenção e recorrência.',
    icon: BadgeCheck,
  },
];

export const moduleItems: IconContentItem[] = [
  {
    title: 'Paciente 360',
    description: 'Histórico completo, timeline clínica, medidas e documentos.',
    icon: Activity,
  },
  {
    title: 'Agenda',
    description: 'Visão por profissional, sala e tipo de atendimento.',
    icon: CalendarDays,
  },
  {
    title: 'Programas',
    description: 'Modelos de protocolos, fases, benefícios e check-ins.',
    icon: BookOpen,
  },
  {
    title: 'Documentos',
    description: 'Templates, assinatura digital e organização segura.',
    icon: FileText,
  },
  {
    title: 'Financeiro',
    description: 'Recebimentos, cobranças, recibos e recorrência.',
    icon: CreditCard,
  },
  {
    title: 'Portal do paciente',
    description: 'Acompanhamento, documentos, comunicação e rotina diária.',
    icon: Smartphone,
  },
];

export const securityItems: IconContentItem[] = [
  {
    title: 'RLS e perfis de acesso',
    description: 'RBAC e isolamento por tenant para proteger dados clínicos.',
    icon: LockKeyhole,
  },
  {
    title: 'Auditoria operacional',
    description: 'Trilhas para decisões clínicas, administrativas e financeiras.',
    icon: FileCheck2,
  },
  {
    title: 'D4Sign',
    description: 'Fluxos de assinatura digital para documentos da clínica.',
    icon: FileText,
  },
  {
    title: 'Asaas',
    description: 'Cobranças, pagamentos e recorrência dentro da operação.',
    icon: ReceiptText,
  },
];

export const planItems: IconContentItem[] = [
  {
    title: 'Implantação guiada',
    description: 'Configuração por módulos para sair do papel sem travar a operação.',
    icon: ClipboardCheck,
  },
  {
    title: 'Rotina da equipe',
    description: 'Papéis, permissões e fluxos pensados para clínicas em crescimento.',
    icon: UsersRound,
  },
  {
    title: 'Evolução contínua',
    description: 'Estrutura pronta para ampliar programas, documentos e integrações.',
    icon: MessageSquare,
  },
];
