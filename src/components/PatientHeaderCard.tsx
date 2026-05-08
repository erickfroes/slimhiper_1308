'use client';

import React from 'react';
import Link from 'next/link';
import {
  Phone,
  Mail,
  User,
  MapPin,
  UserCheck,
  Package,
  CalendarClock,
  Clock,
  Play,
  CalendarPlus,
  FileText,
  MessageSquare,
  CreditCard,
  BarChart2,
  Pencil,
} from 'lucide-react';
import type { Patient360Summary } from '@/domain/types';
import StatusBadge from './StatusBadge';

interface PatientHeaderCardProps {
  data: Patient360Summary;
  patientId: string;
}

const clinicalRiskConfig = {
  baixo: { label: 'Risco Baixo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  moderado: { label: 'Risco Moderado', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  alto: { label: 'Risco Alto', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  critico: { label: 'Risco Crítico', className: 'bg-red-50 text-red-700 border-red-200' },
};

const financialStatusConfig = {
  em_dia: {
    label: 'Financeiro em Dia',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  pendente: {
    label: 'Pagamento Pendente',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  inadimplente: { label: 'Inadimplente', className: 'bg-red-50 text-red-700 border-red-200' },
  isento: { label: 'Isento', className: 'bg-slate-50 text-slate-600 border-slate-200' },
};

const packageStatusConfig = {
  ativo: { label: 'Ativo', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  pausado: { label: 'Pausado', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  concluido: { label: 'Concluído', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  cancelado: { label: 'Cancelado', className: 'bg-red-50 text-red-700 border-red-200' },
  aguardando: { label: 'Aguardando', className: 'bg-blue-50 text-blue-700 border-blue-200' },
};

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} às ${hours}:${minutes}`;
}

function formatAppointmentDate(isoString: string): string {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month} às ${hours}:${minutes}`;
}

function isToday(isoString: string): boolean {
  const date = new Date(isoString);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}

function InfoItem({ icon, label, value, mono }: InfoItemProps) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="mt-0.5 text-muted-foreground flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-0.5">
          {label}
        </p>
        <p
          className={['text-sm font-medium text-foreground truncate', mono ? 'font-mono' : ''].join(
            ' '
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

interface BadgePillProps {
  label: string;
  className: string;
}

function BadgePill({ label, className }: BadgePillProps) {
  return (
    <span
      className={[
        'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border',
        className,
      ].join(' ')}
    >
      {label}
    </span>
  );
}

export default function PatientHeaderCard({ data, patientId }: PatientHeaderCardProps) {
  const {
    profile,
    activePackage,
    financial,
    clinicalRisk,
    mainUnit,
    responsibleProfessional,
    lastUpdate,
    upcomingAppointments,
  } = data;

  const nextAppointment = upcomingAppointments?.find((a) => a.status === 'agendado');
  const hasTodayAppointment = upcomingAppointments?.some(
    (a) => isToday(a.scheduledAt) && a.status === 'agendado'
  );

  const primaryAction = hasTodayAppointment
    ? { label: 'Iniciar atendimento', icon: <Play size={15} /> }
    : { label: 'Novo agendamento', icon: <CalendarPlus size={15} /> };

  const secondaryActions = [
    { label: 'Novo agendamento', icon: <CalendarPlus size={14} /> },
    { label: 'Criar documento', icon: <FileText size={14} /> },
    { label: 'Enviar mensagem', icon: <MessageSquare size={14} /> },
    { label: 'Registrar pagamento', icon: <CreditCard size={14} /> },
    { label: 'Relatório', icon: <BarChart2 size={14} /> },
  ];

  const patientName = profile.name?.trim() || 'Paciente sem nome';

  const initials = patientName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const pkgStatus = activePackage
    ? packageStatusConfig[activePackage.status] ?? packageStatusConfig.ativo
    : null;
  const finStatus = financial
    ? financialStatusConfig[financial.status] ?? financialStatusConfig.em_dia
    : null;
  const riskConfig = clinicalRisk ? clinicalRiskConfig[clinicalRisk] : null;

  return (
    <div className="card-base mb-5 overflow-hidden">
      {/* Top accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-t-2xl" />

      <div className="p-5 pb-4">
        {/* Row 1: Avatar + Identity + Actions */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={`Foto de ${patientName}`}
                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-primary/20"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-100 to-emerald-100 flex items-center justify-center ring-2 ring-primary/10 flex-shrink-0">
                <span className="text-xl font-bold text-teal-700">{initials}</span>
              </div>
            )}
          </div>

          {/* Identity block */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-foreground leading-tight">{patientName}</h2>
              {profile.preferredName && (
                <span className="text-sm text-muted-foreground font-normal">
                  ({profile.preferredName})
                </span>
              )}
              <StatusBadge status={profile.status} />
            </div>

            {/* Age + CPF */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <User size={13} className="text-muted-foreground/70" />
                {profile.age} anos
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-sm text-muted-foreground font-mono">{profile.cpfMasked}</span>
            </div>

            {/* Phone + Email */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Phone size={13} className="text-muted-foreground/70" />
                {profile.phone}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail size={13} className="text-muted-foreground/70" />
                {profile.email}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0 lg:ml-auto">
            {/* Primary action */}
            <Link
              href={`/clinic/patients/${patientId}/encounter`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors"
            >
              {primaryAction.icon}
              {primaryAction.label}
            </Link>

            {/* Secondary actions */}
            {secondaryActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors border border-border"
              >
                {action.icon}
                <span className="hidden sm:inline">{action.label}</span>
              </button>
            ))}

            {/* Editar */}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors border border-border"
            >
              <Pencil size={14} />
              <span className="hidden sm:inline">Editar</span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border my-4" />

        {/* Row 2: Info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-6 gap-y-4">
          {mainUnit && <InfoItem icon={<MapPin size={14} />} label="Unidade" value={mainUnit} />}
          {responsibleProfessional && (
            <InfoItem
              icon={<UserCheck size={14} />}
              label="Profissional"
              value={responsibleProfessional}
            />
          )}
          <InfoItem
            icon={<Package size={14} />}
            label="Pacote ativo"
            value={`${activePackage.programName} — Sem. ${activePackage.currentWeek}/${activePackage.totalWeeks}`}
          />
          {nextAppointment && (
            <InfoItem
              icon={<CalendarClock size={14} />}
              label="Próxima consulta"
              value={formatAppointmentDate(nextAppointment.scheduledAt)}
            />
          )}
          {lastUpdate && (
            <InfoItem
              icon={<Clock size={14} />}
              label="Última atualização"
              value={formatDateTime(lastUpdate)}
            />
          )}
        </div>

        {/* Row 3: Status badges */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {pkgStatus ? (
                  <BadgePill label={pkgStatus.label} className={pkgStatus.className} />
                ) : (
                  <span className="text-sm text-muted-foreground">Sem pacote ativo</span>
                )}
          {finStatus ? (
                  <BadgePill label={finStatus.label} className={finStatus.className} />
                ) : (
                  <span className="text-sm text-muted-foreground">Financeiro não disponível</span>
                )}
          {riskConfig && <BadgePill label={riskConfig.label} className={riskConfig.className} />}
        </div>
      </div>
    </div>
  );
}
