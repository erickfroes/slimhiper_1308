'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Users,
  Filter,
  Plus,
  RefreshCw,
  ArrowRight,
  Pencil,
  XCircle,
  PhoneCall,
  PlayCircle,
  UserRound,
  Bell,
  Package,
  CalendarPlus,
  UserCheck,
  ClipboardCheck,
  Ban,
  Building2,
  Save,
  CreditCard,
  ReceiptText,
} from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import Dialog from '@/components/ui/Dialog';
import Tabs from '@/components/ui/Tabs';
import DataState from '@/components/ui/DataState';
import type {
  AttendanceQueueStatus,
  AppointmentStatus,
  AppointmentSummary,
  AppointmentType,
  BlockedSlotSummary,
  PatientListRow,
  PatientReturnSummary,
  WaitingQueueEntry,
  CommercialPackage,
  CommercialProgramOption,
  CommercialService,
} from '@/domain/types';
import {
  callAttendanceQueue,
  cancelAppointment,
  cancelProfessionalDayAllocation,
  createAppointment,
  getAgendaDay,
  getAgendaScheduleOptions,
  getNextAppointmentStatus,
  recordPatientReturnAction,
  saveClinicRoom,
  saveProfessionalDayAllocation,
  startAttendanceEncounter,
  updateAppointment,
  updateAppointmentStatus,
  type AgendaRoomStatus,
  type AgendaRoomType,
  type AgendaBillingMode,
  type AgendaManualPaymentMethod,
  type AgendaScheduleOptions,
  type AppointmentMutationInput,
  type ProfessionalDayAllocationStatus,
} from '@/services/agendaApi';
import { getClinicCommercialCatalog } from '@/services/commercialApi';
import { getPatientList } from '@/services/patientsApi';

// ─── WORKFLOW STAGES ──────────────────────────────────────────────────────────

interface WorkflowStage {
  key: AppointmentStatus;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
}

const workflowStages: WorkflowStage[] = [
  {
    key: 'agendado',
    label: 'Agendado',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    dotColor: 'bg-blue-500',
  },
  {
    key: 'confirmado',
    label: 'Confirmado',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    dotColor: 'bg-indigo-500',
  },
  {
    key: 'chegou',
    label: 'Chegou',
    color: 'text-sky-700',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    dotColor: 'bg-sky-500',
  },
  {
    key: 'triagem',
    label: 'Triagem',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    dotColor: 'bg-amber-500',
  },
  {
    key: 'medidas',
    label: 'Medidas',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    dotColor: 'bg-orange-500',
  },
  {
    key: 'bioimpedancia',
    label: 'Bioimpedância',
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    dotColor: 'bg-cyan-500',
  },
  {
    key: 'aguardando_medico',
    label: 'Aguardando médico',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    dotColor: 'bg-purple-500',
  },
  {
    key: 'em_consulta',
    label: 'Consulta',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    dotColor: 'bg-teal-500',
  },
  {
    key: 'checkout',
    label: 'Checkout',
    color: 'text-lime-700',
    bgColor: 'bg-lime-50',
    borderColor: 'border-lime-200',
    dotColor: 'bg-lime-500',
  },
  {
    key: 'concluido',
    label: 'Concluído',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
];

// ─── APPOINTMENT TYPE LABELS ──────────────────────────────────────────────────

const appointmentTypeLabel: Record<AppointmentType, string> = {
  consulta_medica: 'Consulta Médica',
  retorno: 'Retorno',
  nutricao: 'Nutrição',
  avaliacao_inicial: 'Avaliação Inicial',
  bioimpedancia: 'Bioimpedância',
  checkup: 'Checkup',
};

// ─── CALENDAR HELPERS ─────────────────────────────────────────────────────────

const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  chegou: 'Chegou',
  triagem: 'Triagem',
  medidas: 'Medidas',
  bioimpedancia: 'Bioimpedância',
  aguardando_medico: 'Aguardando médico',
  em_consulta: 'Consulta',
  checkout: 'Checkout',
  concluido: 'Concluído',
  falta: 'Falta',
  cancelado: 'Cancelado',
};

type AgendaTab = 'agenda' | 'fila' | 'retornos';

type PatientDrawerTarget =
  | { kind: 'appointment'; item: AppointmentSummary }
  | { kind: 'queue'; item: WaitingQueueEntry }
  | { kind: 'return'; item: PatientReturnSummary };

const queueStatusLabel: Record<AttendanceQueueStatus, string> = {
  scheduled: 'Confirmado',
  waiting: 'Aguardando',
  called: 'Chamado',
  in_attendance: 'Em atendimento',
  checkout: 'Checkout',
  completed: 'Concluido',
  no_show: 'Falta',
  cancelled: 'Cancelado',
  stuck: 'Preso',
};

const returnStatusLabel: Record<PatientReturnSummary['status'], string> = {
  pendente: 'Pendente',
  contatado: 'Contatado',
  agendado: 'Agendado',
  dispensado: 'Dispensado',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

const billingModeLabel: Record<AgendaBillingMode, string> = {
  none: 'Sem cobranca',
  local_invoice: 'Cobranca local pendente',
  manual_paid: 'Pagamento manual local',
};

const manualPaymentMethodLabel: Record<AgendaManualPaymentMethod, string> = {
  pix: 'Pix',
  cartao_credito: 'Cartao credito',
  cartao_debito: 'Cartao debito',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferencia',
};

const appointmentFinancialStatusLabel: Record<
  NonNullable<AppointmentSummary['financialStatus']>,
  string
> = {
  not_required: 'Sem cobranca',
  pending_local_invoice: 'Cobranca pendente',
  manual_paid: 'Pago local',
  failed: 'Financeiro parcial',
};

const appointmentFinancialStatusClass: Record<
  NonNullable<AppointmentSummary['financialStatus']>,
  string
> = {
  not_required: 'border-slate-200 bg-slate-50 text-slate-600',
  pending_local_invoice: 'border-amber-200 bg-amber-50 text-amber-700',
  manual_paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

function isAgendaTab(value: string | null): value is AgendaTab {
  return value === 'agenda' || value === 'fila' || value === 'retornos';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoneyFromCents(value?: number | null) {
  const amount = (value ?? 0) / 100;
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function centsToCurrencyInput(value?: number | null) {
  if (!value) return '';
  return (value / 100).toFixed(2).replace('.', ',');
}

function parseCurrencyToCents(value: string) {
  const normalized = value
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 100)) : 0;
}

function getWeekDates(selectedDate: string) {
  const [year, month, day] = selectedDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return getLocalDateValue(current);
  });
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTimeValue(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function toLocalDateTimeParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: getLocalDateValue(), time: '09:00' };
  }
  return {
    date: getLocalDateValue(date),
    time: getLocalTimeValue(date),
  };
}

type AppointmentFormState = {
  patientId: string;
  type: AppointmentType;
  date: string;
  time: string;
  durationMinutes: string;
  allocationId: string;
  professionalProfileId: string;
  roomId: string;
  unitId: string;
  programId: string;
  packageId: string;
  serviceId: string;
  billingMode: AgendaBillingMode;
  billingAmount: string;
  billingDueDate: string;
  paymentMethod: AgendaManualPaymentMethod;
  billingDescription: string;
  location: string;
  notes: string;
};

type CommercialCatalogState = {
  services: CommercialService[];
  packages: CommercialPackage[];
  programs: CommercialProgramOption[];
};

type RoomFormState = {
  code: string;
  name: string;
  roomType: AgendaRoomType;
  status: AgendaRoomStatus;
  capacity: string;
};

type AllocationFormState = {
  professionalProfileId: string;
  roomId: string;
  startTime: string;
  endTime: string;
  status: ProfessionalDayAllocationStatus;
  notes: string;
};

function createEmptyAppointmentForm(date: string): AppointmentFormState {
  return {
    patientId: '',
    type: 'consulta_medica',
    date,
    time: '09:00',
    durationMinutes: '30',
    allocationId: '',
    professionalProfileId: '',
    roomId: '',
    unitId: '',
    programId: '',
    packageId: '',
    serviceId: '',
    billingMode: 'none',
    billingAmount: '',
    billingDueDate: date,
    paymentMethod: 'pix',
    billingDescription: '',
    location: '',
    notes: '',
  };
}

function createEmptyCommercialCatalog(): CommercialCatalogState {
  return {
    services: [],
    packages: [],
    programs: [],
  };
}

function packageMatchesProgram(pkg: CommercialPackage, programId: string) {
  if (!programId) return true;
  return pkg.programLinks.some((link) => link.programId === programId && link.status === 'ativo');
}

function serviceMatchesPackage(service: CommercialService, pkg?: CommercialPackage | null) {
  if (!pkg) return true;
  return pkg.services.some((item) => item.serviceId === service.id);
}

function getSuggestedBillingAmountCents(
  form: Pick<AppointmentFormState, 'serviceId' | 'packageId'>,
  catalog: CommercialCatalogState
) {
  const selectedService = catalog.services.find((service) => service.id === form.serviceId);
  const selectedPackage = catalog.packages.find((pkg) => pkg.id === form.packageId);
  return selectedService?.basePriceCents ?? selectedPackage?.priceCents ?? 0;
}

function createEmptyRoomForm(): RoomFormState {
  return {
    code: '',
    name: '',
    roomType: 'consulting',
    status: 'active',
    capacity: '1',
  };
}

function createEmptyAllocationForm(): AllocationFormState {
  return {
    professionalProfileId: '',
    roomId: '',
    startTime: '08:00',
    endTime: '12:00',
    status: 'available',
    notes: '',
  };
}

function appointmentToForm(appointment: AppointmentSummary): AppointmentFormState {
  const parts = toLocalDateTimeParts(appointment.scheduledAt);
  return {
    patientId: appointment.patientId,
    type: appointment.type,
    date: parts.date,
    time: parts.time,
    durationMinutes: String(appointment.durationMinutes || 30),
    allocationId: '',
    professionalProfileId: appointment.professionalProfileId ?? '',
    roomId: appointment.roomId ?? '',
    unitId: appointment.unitId ?? '',
    programId: appointment.programId ?? '',
    packageId: appointment.packageId ?? '',
    serviceId: appointment.serviceId ?? '',
    billingMode:
      appointment.financialStatus === 'manual_paid'
        ? 'manual_paid'
        : appointment.financialStatus === 'pending_local_invoice' ||
            appointment.financialStatus === 'failed'
          ? 'local_invoice'
          : 'none',
    billingAmount: centsToCurrencyInput(appointment.financialAmountCents),
    billingDueDate: appointment.financialDueDate ?? parts.date,
    paymentMethod: (appointment.financialPaymentMethod as AgendaManualPaymentMethod) || 'pix',
    billingDescription:
      appointment.serviceName ??
      appointment.packageName ??
      appointment.programName ??
      appointmentTypeLabel[appointment.type],
    location: appointment.roomName ?? '',
    notes: appointment.notes ?? '',
  };
}

function toAppointmentMutationInput(form: AppointmentFormState): AppointmentMutationInput {
  const amountCents = parseCurrencyToCents(form.billingAmount);
  const billingDescription =
    form.billingDescription.trim() || appointmentTypeLabel[form.type] || 'Agendamento';

  return {
    patientId: form.patientId,
    type: form.type,
    scheduledAt: new Date(`${form.date}T${form.time || '09:00'}:00`).toISOString(),
    durationMinutes: Number(form.durationMinutes) || 30,
    location: form.location,
    notes: form.notes,
    professionalProfileId: form.professionalProfileId || null,
    roomId: form.roomId || null,
    unitId: form.unitId || null,
    commercialContext: {
      programId: form.programId || null,
      packageId: form.packageId || null,
      serviceId: form.serviceId || null,
    },
    billingContext:
      form.billingMode === 'none'
        ? { mode: 'none' }
        : {
            mode: form.billingMode,
            amountCents,
            dueDate: form.billingDueDate || form.date,
            paymentMethod: form.billingMode === 'manual_paid' ? form.paymentMethod : null,
            paidAt: form.billingMode === 'manual_paid' ? new Date().toISOString() : null,
            description: billingDescription,
          },
  };
}

function slugRoomCode(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .toUpperCase();
}

function createEmptyScheduleOptions(date: string): AgendaScheduleOptions {
  return {
    date,
    units: [],
    rooms: [],
    professionals: [],
    allocations: [],
  };
}

// ─── MOCK CALENDAR EVENTS (days with appointments) ────────────────────────────

// ─── MINI CALENDAR ────────────────────────────────────────────────────────────

function AppointmentFormModal({
  mode,
  form,
  patients,
  patientsLoading,
  commercialCatalog,
  commercialCatalogLoading,
  commercialCatalogError,
  scheduleOptions,
  scheduleOptionsLoading,
  error,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  form: AppointmentFormState;
  patients: PatientListRow[];
  patientsLoading: boolean;
  commercialCatalog: CommercialCatalogState;
  commercialCatalogLoading: boolean;
  commercialCatalogError: string | null;
  scheduleOptions: AgendaScheduleOptions;
  scheduleOptionsLoading: boolean;
  error: string | null;
  submitting: boolean;
  onChange: (patch: Partial<AppointmentFormState>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const activeRooms = scheduleOptions.rooms.filter((room) => room.status === 'active');
  const activeAllocations = scheduleOptions.allocations.filter(
    (allocation) => allocation.status === 'available' || allocation.status === 'scheduled'
  );
  const activePrograms = commercialCatalog.programs.filter((program) => program.status === 'ativo');
  const activePackages = commercialCatalog.packages.filter((pkg) => pkg.status === 'ativo');
  const activeServices = commercialCatalog.services.filter((service) => service.status === 'ativo');
  const selectedPackage = activePackages.find((pkg) => pkg.id === form.packageId) ?? null;
  const programPackages = activePackages.filter((pkg) =>
    packageMatchesProgram(pkg, form.programId)
  );
  const packageServices = activeServices.filter((service) =>
    serviceMatchesPackage(service, selectedPackage)
  );
  const suggestedAmountCents = getSuggestedBillingAmountCents(form, commercialCatalog);

  return (
    <Dialog
      open
      title={mode === 'create' ? 'Nova consulta' : 'Editar consulta'}
      description="A consulta sera gravada no tenant ativo e validada por RLS."
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      placement="center"
    >
      <div className="-m-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="space-y-4 px-5 py-5"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground md:col-span-2">
              Paciente
              <select
                value={form.patientId}
                onChange={(event) => onChange({ patientId: event.target.value })}
                className="input-base text-sm"
                required
                disabled={patientsLoading}
              >
                <option value="">
                  {patientsLoading ? 'Carregando pacientes...' : 'Selecione um paciente'}
                </option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              Tipo
              <select
                value={form.type}
                onChange={(event) => onChange({ type: event.target.value as AppointmentType })}
                className="input-base text-sm"
              >
                {(Object.keys(appointmentTypeLabel) as AppointmentType[]).map((type) => (
                  <option key={type} value={type}>
                    {appointmentTypeLabel[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              Duracao
              <input
                type="number"
                min={10}
                step={5}
                value={form.durationMinutes}
                onChange={(event) => onChange({ durationMinutes: event.target.value })}
                className="input-base text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              Data
              <input
                type="date"
                value={form.date}
                onChange={(event) => onChange({ date: event.target.value })}
                className="input-base text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              Horario
              <input
                type="time"
                value={form.time}
                onChange={(event) => onChange({ time: event.target.value })}
                className="input-base text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground md:col-span-2">
              Escala do dia
              <select
                value={form.allocationId}
                onChange={(event) => {
                  const allocationId = event.target.value;
                  const allocation = activeAllocations.find((item) => item.id === allocationId);
                  onChange({
                    allocationId,
                    professionalProfileId: allocation?.professionalProfileId ?? '',
                    roomId: allocation?.roomId ?? '',
                    unitId: allocation?.unitId ?? '',
                    location: allocation?.roomName ?? form.location,
                  });
                }}
                className="input-base text-sm"
                disabled={scheduleOptionsLoading || activeAllocations.length === 0}
              >
                <option value="">
                  {scheduleOptionsLoading
                    ? 'Carregando escala...'
                    : activeAllocations.length === 0
                      ? 'Nenhuma escala criada para o dia'
                      : 'Selecione profissional e sala'}
                </option>
                {activeAllocations.map((allocation) => (
                  <option key={allocation.id} value={allocation.id}>
                    {allocation.startTime}-{allocation.endTime} · {allocation.professionalName}
                    {allocation.roomName ? ` · ${allocation.roomName}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              Profissional
              <select
                value={form.professionalProfileId}
                onChange={(event) => {
                  const professionalProfileId = event.target.value;
                  const professional = scheduleOptions.professionals.find(
                    (item) => item.id === professionalProfileId
                  );
                  onChange({
                    allocationId: '',
                    professionalProfileId,
                    unitId: professional?.unitId ?? form.unitId,
                  });
                }}
                className="input-base text-sm"
                disabled={scheduleOptionsLoading}
                required={activeAllocations.length > 0}
              >
                <option value="">
                  {activeAllocations.length > 0
                    ? 'Selecione um profissional'
                    : 'Sem profissional estruturado'}
                </option>
                {scheduleOptions.professionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>
                    {professional.name}
                    {professional.specialty ? ` · ${professional.specialty}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              Sala
              <select
                value={form.roomId}
                onChange={(event) => {
                  const roomId = event.target.value;
                  const room = activeRooms.find((item) => item.id === roomId);
                  onChange({
                    allocationId: '',
                    roomId,
                    unitId: room?.unitId ?? form.unitId,
                    location: room?.name ?? form.location,
                  });
                }}
                className="input-base text-sm"
                disabled={scheduleOptionsLoading || activeRooms.length === 0}
              >
                <option value="">
                  {activeRooms.length === 0 ? 'Sem sala ativa' : 'Sem sala estruturada'}
                </option>
                {activeRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} · {room.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground md:col-span-2">
              Sala/local legado
              <input
                value={form.location}
                onChange={(event) => onChange({ location: event.target.value })}
                className="input-base text-sm"
              />
            </label>
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 md:col-span-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Package size={14} />
                Contexto comercial e clinico
              </div>
              {commercialCatalogError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {commercialCatalogError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Programa
                  <select
                    value={form.programId}
                    onChange={(event) => {
                      const programId = event.target.value;
                      const nextPackages = activePackages.filter((pkg) =>
                        packageMatchesProgram(pkg, programId)
                      );
                      const packageStillValid =
                        !form.packageId || nextPackages.some((pkg) => pkg.id === form.packageId);
                      onChange({
                        programId,
                        packageId: packageStillValid ? form.packageId : '',
                        serviceId: packageStillValid ? form.serviceId : '',
                        billingAmount:
                          packageStillValid || form.billingMode === 'none'
                            ? form.billingAmount
                            : '',
                      });
                    }}
                    className="input-base text-sm"
                    disabled={commercialCatalogLoading || activePrograms.length === 0}
                  >
                    <option value="">
                      {commercialCatalogLoading
                        ? 'Carregando...'
                        : activePrograms.length === 0
                          ? 'Sem programa ativo'
                          : 'Sem programa'}
                    </option>
                    {activePrograms.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Pacote
                  <select
                    value={form.packageId}
                    onChange={(event) => {
                      const packageId = event.target.value;
                      const pkg = activePackages.find((item) => item.id === packageId) ?? null;
                      const serviceStillValid =
                        !form.serviceId ||
                        !pkg ||
                        pkg.services.some((service) => service.serviceId === form.serviceId);
                      const nextAmount =
                        form.billingMode === 'none'
                          ? form.billingAmount
                          : centsToCurrencyInput(
                              getSuggestedBillingAmountCents(
                                { packageId, serviceId: serviceStillValid ? form.serviceId : '' },
                                commercialCatalog
                              )
                            );
                      onChange({
                        packageId,
                        serviceId: serviceStillValid ? form.serviceId : '',
                        billingAmount: nextAmount,
                        billingDescription: pkg?.name ?? form.billingDescription,
                      });
                    }}
                    className="input-base text-sm"
                    disabled={commercialCatalogLoading || programPackages.length === 0}
                  >
                    <option value="">
                      {commercialCatalogLoading
                        ? 'Carregando...'
                        : programPackages.length === 0
                          ? 'Sem pacote ativo'
                          : 'Sem pacote'}
                    </option>
                    {programPackages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} - {formatMoneyFromCents(pkg.priceCents)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Servico
                  <select
                    value={form.serviceId}
                    onChange={(event) => {
                      const serviceId = event.target.value;
                      const service = activeServices.find((item) => item.id === serviceId);
                      const nextAmountCents =
                        service?.basePriceCents ??
                        activePackages.find((pkg) => pkg.id === form.packageId)?.priceCents ??
                        0;
                      onChange({
                        serviceId,
                        durationMinutes:
                          service?.durationMinutes && !Number.isNaN(service.durationMinutes)
                            ? String(service.durationMinutes)
                            : form.durationMinutes,
                        billingAmount:
                          form.billingMode === 'none'
                            ? form.billingAmount
                            : centsToCurrencyInput(nextAmountCents),
                        billingDescription: service?.name ?? form.billingDescription,
                      });
                    }}
                    className="input-base text-sm"
                    disabled={commercialCatalogLoading || packageServices.length === 0}
                  >
                    <option value="">
                      {commercialCatalogLoading
                        ? 'Carregando...'
                        : packageServices.length === 0
                          ? 'Sem servico ativo'
                          : 'Sem servico'}
                    </option>
                    {packageServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} - {formatMoneyFromCents(service.basePriceCents)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 md:col-span-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <CreditCard size={14} />
                Financeiro local
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Modo
                  <select
                    value={form.billingMode}
                    onChange={(event) => {
                      const billingMode = event.target.value as AgendaBillingMode;
                      onChange({
                        billingMode,
                        billingAmount:
                          billingMode === 'none'
                            ? ''
                            : form.billingAmount || centsToCurrencyInput(suggestedAmountCents),
                        billingDueDate: form.billingDueDate || form.date,
                      });
                    }}
                    className="input-base text-sm"
                  >
                    {Object.entries(billingModeLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Valor
                  <input
                    value={form.billingAmount}
                    onChange={(event) => onChange({ billingAmount: event.target.value })}
                    className="input-base text-sm"
                    placeholder="0,00"
                    disabled={form.billingMode === 'none'}
                    required={form.billingMode !== 'none'}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Vencimento
                  <input
                    type="date"
                    value={form.billingDueDate}
                    onChange={(event) => onChange({ billingDueDate: event.target.value })}
                    className="input-base text-sm"
                    disabled={form.billingMode === 'none'}
                    required={form.billingMode !== 'none'}
                  />
                </label>
                {form.billingMode === 'manual_paid' ? (
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                    Metodo
                    <select
                      value={form.paymentMethod}
                      onChange={(event) =>
                        onChange({ paymentMethod: event.target.value as AgendaManualPaymentMethod })
                      }
                      className="input-base text-sm"
                    >
                      {Object.entries(manualPaymentMethodLabel).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground md:col-span-2">
                  Descricao
                  <input
                    value={form.billingDescription}
                    onChange={(event) => onChange({ billingDescription: event.target.value })}
                    className="input-base text-sm"
                    placeholder="Descricao da cobranca local"
                    disabled={form.billingMode === 'none'}
                  />
                </label>
              </div>
              {form.billingMode !== 'none' ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <ReceiptText size={13} />
                  Cobranca e pagamento ficam locais; nenhum provider externo sera chamado.
                </div>
              ) : null}
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground md:col-span-2">
              Observacoes
              <textarea
                value={form.notes}
                onChange={(event) => onChange({ notes: event.target.value })}
                className="input-base min-h-20 resize-none text-sm"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-sm disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || patientsLoading}
              className="btn-primary text-sm disabled:opacity-60"
            >
              {submitting ? 'Salvando...' : mode === 'create' ? 'Criar consulta' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}

function CancelAppointmentModal({
  appointment,
  reason,
  error,
  submitting,
  onChangeReason,
  onClose,
  onConfirm,
}: {
  appointment: AppointmentSummary;
  reason: string;
  error: string | null;
  submitting: boolean;
  onChangeReason: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      title="Cancelar consulta"
      description="Informe o motivo operacional para registrar a alteracao na fila e manter a trilha de atendimento."
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      placement="center"
    >
      <div className="-m-5">
        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
            <p className="font-semibold text-foreground">{appointment.patientName}</p>
            <p className="text-xs text-muted-foreground">
              {appointmentTypeLabel[appointment.type]} ·{' '}
              {new Date(appointment.scheduledAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
            Motivo do cancelamento
            <textarea
              value={reason}
              onChange={(event) => onChangeReason(event.target.value)}
              className="input-base min-h-24 resize-none text-sm"
              maxLength={240}
              required
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-sm disabled:opacity-60"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting || reason.trim().length < 3}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle size={14} />
              {submitting ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

interface MiniCalendarProps {
  selectedDate: string;
  calendarEvents: Record<string, number>;
  onSelectDate: (date: string) => void;
}

function MiniCalendar({ selectedDate, calendarEvents, onSelectDate }: MiniCalendarProps) {
  const [selectedYear, selectedMonth] = selectedDate.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selectedYear);
  const [viewMonth, setViewMonth] = useState(selectedMonth - 1);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const today = getLocalDateValue();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {MONTHS_PT[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_PT.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const hasEvents = !!calendarEvents[dateStr];

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={[
                'relative flex flex-col items-center justify-center rounded-lg py-1 text-xs font-medium transition-all duration-150',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : isToday
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {day}
              {hasEvents && !isSelected && (
                <span
                  className={[
                    'w-1 h-1 rounded-full mt-0.5',
                    isToday ? 'bg-primary' : 'bg-muted-foreground/50',
                  ].join(' ')}
                />
              )}
              {hasEvents && isSelected && (
                <span className="w-1 h-1 rounded-full mt-0.5 bg-primary-foreground/60" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-primary/20 inline-block" />
          Hoje
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 inline-block" />
          Com consultas
        </span>
      </div>
    </div>
  );
}

// ─── WORKFLOW KANBAN COLUMN ───────────────────────────────────────────────────

function WeekStrip({
  selectedDate,
  calendarEvents,
  onSelectDate,
}: {
  selectedDate: string;
  calendarEvents: Record<string, number>;
  onSelectDate: (date: string) => void;
}) {
  const days = getWeekDates(selectedDate);
  const today = getLocalDateValue();

  return (
    <div className="grid grid-cols-7 gap-1 rounded-2xl border border-border bg-card p-2 shadow-sm">
      {days.map((dateValue) => {
        const date = new Date(`${dateValue}T00:00:00`);
        const selected = dateValue === selectedDate;
        const count = calendarEvents[dateValue] ?? 0;

        return (
          <button
            key={dateValue}
            type="button"
            onClick={() => onSelectDate(dateValue)}
            className={[
              'min-h-14 rounded-xl px-1.5 py-2 text-center transition-colors',
              selected
                ? 'bg-primary text-primary-foreground'
                : dateValue === today
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted',
            ].join(' ')}
          >
            <span className="block text-[10px] font-semibold uppercase">
              {DAYS_PT[date.getDay()]}
            </span>
            <span className="mt-0.5 block text-sm font-bold tabular-nums">{date.getDate()}</span>
            <span className="mt-0.5 block text-[10px] font-medium opacity-80">
              {count > 0 ? `${count} cons.` : 'Livre'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BlockedSlotsPanel({ slots }: { slots: BlockedSlotSummary[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Ban size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Bloqueios</span>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {slots.length}
        </span>
      </div>
      {slots.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum bloqueio para o dia.</p>
      ) : (
        <div className="space-y-2">
          {slots.map((slot) => (
            <div key={slot.id} className="rounded-xl border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs font-semibold text-foreground">{slot.reason}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(slot.startAt)} - {formatDateTime(slot.endAt)}
              </p>
              {slot.location ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{slot.location}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const roomTypeLabel: Record<AgendaRoomType, string> = {
  consulting: 'Consulta',
  triage: 'Triagem',
  bioimpedance: 'Bioimpedancia',
  procedure: 'Procedimento',
  admin: 'Administrativo',
  other: 'Outro',
};

const roomStatusLabel: Record<AgendaRoomStatus, string> = {
  active: 'Ativa',
  inactive: 'Inativa',
  maintenance: 'Manutencao',
};

const allocationStatusLabel: Record<ProfessionalDayAllocationStatus, string> = {
  scheduled: 'Agendada',
  available: 'Disponivel',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
};

function AgendaSchedulePanel({
  selectedDate,
  options,
  isLoading,
  error,
  roomForm,
  allocationForm,
  submitting,
  onRoomChange,
  onAllocationChange,
  onSaveRoom,
  onSaveAllocation,
  onCancelAllocation,
  onRefresh,
}: {
  selectedDate: string;
  options: AgendaScheduleOptions;
  isLoading: boolean;
  error: string | null;
  roomForm: RoomFormState;
  allocationForm: AllocationFormState;
  submitting: string | null;
  onRoomChange: (patch: Partial<RoomFormState>) => void;
  onAllocationChange: (patch: Partial<AllocationFormState>) => void;
  onSaveRoom: () => void;
  onSaveAllocation: () => void;
  onCancelAllocation: (allocationId: string) => void;
  onRefresh: () => void;
}) {
  const activeRooms = options.rooms.filter((room) => room.status === 'active');
  const activeProfessionals = options.professionals.filter((professional) => professional.isActive);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Salas e escala</h3>
          <p className="text-xs text-muted-foreground">{formatDate(selectedDate)}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="btn-ghost h-8 w-8 p-0 disabled:opacity-50"
          title="Atualizar salas e escala"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : undefined} />
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <form
          className="space-y-2 border-b border-border pb-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveRoom();
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Building2 size={14} />
            Nova sala
          </div>
          <input
            value={roomForm.name}
            onChange={(event) => {
              const name = event.target.value;
              onRoomChange({
                name,
                code: roomForm.code || slugRoomCode(name),
              });
            }}
            className="input-base text-sm"
            placeholder="Nome da sala"
          />
          <div className="grid grid-cols-[1fr_4.5rem] gap-2">
            <input
              value={roomForm.code}
              onChange={(event) => onRoomChange({ code: slugRoomCode(event.target.value) })}
              className="input-base text-sm"
              placeholder="Codigo"
            />
            <input
              type="number"
              min={1}
              value={roomForm.capacity}
              onChange={(event) => onRoomChange({ capacity: event.target.value })}
              className="input-base text-sm"
              aria-label="Capacidade"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={roomForm.roomType}
              onChange={(event) => onRoomChange({ roomType: event.target.value as AgendaRoomType })}
              className="input-base text-sm"
            >
              {Object.entries(roomTypeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={roomForm.status}
              onChange={(event) => onRoomChange({ status: event.target.value as AgendaRoomStatus })}
              className="input-base text-sm"
            >
              {Object.entries(roomStatusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting === 'room' || !roomForm.name.trim() || !roomForm.code.trim()}
            className="btn-secondary w-full justify-center text-xs disabled:opacity-60"
          >
            <Save size={13} />
            {submitting === 'room' ? 'Salvando...' : 'Salvar sala'}
          </button>
        </form>

        <form
          className="space-y-2 border-b border-border pb-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveAllocation();
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <UserCheck size={14} />
            Associar profissional
          </div>
          <select
            value={allocationForm.professionalProfileId}
            onChange={(event) => onAllocationChange({ professionalProfileId: event.target.value })}
            className="input-base text-sm"
            disabled={activeProfessionals.length === 0}
          >
            <option value="">
              {activeProfessionals.length === 0 ? 'Sem profissional ativo' : 'Profissional'}
            </option>
            {activeProfessionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
                {professional.specialty ? ` · ${professional.specialty}` : ''}
              </option>
            ))}
          </select>
          <select
            value={allocationForm.roomId}
            onChange={(event) => onAllocationChange({ roomId: event.target.value })}
            className="input-base text-sm"
            disabled={activeRooms.length === 0}
          >
            <option value="">{activeRooms.length === 0 ? 'Sem sala ativa' : 'Sala'}</option>
            {activeRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} · {room.code}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={allocationForm.startTime}
              onChange={(event) => onAllocationChange({ startTime: event.target.value })}
              className="input-base text-sm"
              aria-label="Inicio"
            />
            <input
              type="time"
              value={allocationForm.endTime}
              onChange={(event) => onAllocationChange({ endTime: event.target.value })}
              className="input-base text-sm"
              aria-label="Fim"
            />
          </div>
          <select
            value={allocationForm.status}
            onChange={(event) =>
              onAllocationChange({ status: event.target.value as ProfessionalDayAllocationStatus })
            }
            className="input-base text-sm"
          >
            {Object.entries(allocationStatusLabel)
              .filter(([value]) => value !== 'cancelled')
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
          <button
            type="submit"
            disabled={
              submitting === 'allocation' ||
              !allocationForm.professionalProfileId ||
              !allocationForm.roomId
            }
            className="btn-secondary w-full justify-center text-xs disabled:opacity-60"
          >
            <Save size={13} />
            {submitting === 'allocation' ? 'Salvando...' : 'Salvar escala'}
          </button>
        </form>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Escala do dia</span>
            <span className="text-xs text-muted-foreground">{options.allocations.length}</span>
          </div>
          {isLoading ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
              Carregando...
            </div>
          ) : options.allocations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
              Nenhuma escala cadastrada.
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {options.allocations.map((allocation) => (
                <div key={allocation.id} className="rounded-xl border border-border px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {allocation.professionalName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {allocation.startTime}-{allocation.endTime}
                        {allocation.roomName ? ` · ${allocation.roomName}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCancelAllocation(allocation.id)}
                      disabled={submitting === allocation.id}
                      className="btn-ghost h-7 w-7 p-0 text-red-600 disabled:opacity-50"
                      title="Cancelar escala"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  stage: WorkflowStage;
  appointments: AppointmentSummary[];
  transitioningId: string | null;
  onAdvanceStatus: (appointment: AppointmentSummary) => void;
  onEditAppointment: (appointment: AppointmentSummary) => void;
  onCancelAppointment: (appointment: AppointmentSummary) => void;
}

function KanbanColumn({
  stage,
  appointments,
  transitioningId,
  onAdvanceStatus,
  onEditAppointment,
  onCancelAppointment,
}: KanbanColumnProps) {
  const items = appointments.filter((a) => a.status === stage.key);

  return (
    <div className="flex flex-col min-w-[200px] flex-1">
      {/* Column header */}
      <div
        className={[
          'flex items-center gap-2 px-3 py-2 rounded-xl border mb-2',
          stage.bgColor,
          stage.borderColor,
        ].join(' ')}
      >
        <span className={['w-2 h-2 rounded-full flex-shrink-0', stage.dotColor].join(' ')} />
        <span className={['text-xs font-semibold flex-1', stage.color].join(' ')}>
          {stage.label}
        </span>
        <span className={['text-xs font-bold tabular-nums', stage.color].join(' ')}>
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-6 rounded-xl border border-dashed border-border bg-muted/30">
            <span className="text-xs text-muted-foreground">Nenhum paciente</span>
          </div>
        ) : (
          items.map((appt) => {
            const nextStatus = getNextAppointmentStatus(appt.status);
            const isTransitioning = transitioningId === appt.id;

            return (
              <div
                key={appt.id}
                className="bg-card rounded-xl border border-border p-3 shadow-sm transition-all duration-150 group"
              >
                <Link
                  href={`/clinic/patients/${appt.patientId}/encounter?appointmentId=${appt.id}`}
                  className="block hover:text-primary"
                >
                  {/* Patient name */}
                  <div className="flex items-start justify-between gap-1 mb-1.5">
                    <span className="text-xs font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {appt.patientName}
                    </span>
                    <ArrowRight
                      size={12}
                      className="text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>

                  {/* Type */}
                  <p className="text-xs text-muted-foreground mb-2 leading-tight">
                    {appointmentTypeLabel[appt.type]}
                  </p>

                  {(appt.serviceName || appt.packageName || appt.programName) && (
                    <p className="mb-2 line-clamp-2 text-xs font-medium text-foreground">
                      {appt.serviceName ?? appt.packageName ?? appt.programName}
                    </p>
                  )}

                  {/* Time + professional */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Clock size={10} className="flex-shrink-0" />
                    <span>
                      {new Date(appt.scheduledAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {appt.professionalName}
                  </div>

                  {/* Room */}
                  {appt.roomName && (
                    <div className="mt-1.5 text-xs text-muted-foreground/70 truncate">
                      {appt.roomName}
                    </div>
                  )}

                  {appt.financialStatus && appt.financialStatus !== 'not_required' && (
                    <div
                      className={[
                        'mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                        appointmentFinancialStatusClass[appt.financialStatus],
                      ].join(' ')}
                    >
                      {appointmentFinancialStatusLabel[appt.financialStatus]}
                      {appt.financialAmountCents
                        ? ` - ${formatMoneyFromCents(appt.financialAmountCents)}`
                        : ''}
                    </div>
                  )}
                </Link>
                {nextStatus ? (
                  <button
                    type="button"
                    onClick={() => onAdvanceStatus(appt)}
                    disabled={isTransitioning}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    title={`Avançar para ${appointmentStatusLabel[nextStatus]}`}
                  >
                    <ArrowRight size={12} />
                    {isTransitioning
                      ? 'Atualizando...'
                      : `Avançar para ${appointmentStatusLabel[nextStatus]}`}
                  </button>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
                    Sem próxima etapa
                  </div>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onEditAppointment(appt)}
                    disabled={isTransitioning}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-60"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancelAppointment(appt)}
                    disabled={
                      isTransitioning || ['concluido', 'cancelado', 'falta'].includes(appt.status)
                    }
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <XCircle size={12} />
                    Cancelar
                  </button>
                </div>{' '}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── DAY SCHEDULE LIST ────────────────────────────────────────────────────────

interface DayScheduleProps {
  appointments: AppointmentSummary[];
  transitioningId: string | null;
  onEditAppointment: (appointment: AppointmentSummary) => void;
  onCancelAppointment: (appointment: AppointmentSummary) => void;
}

function DaySchedule({
  appointments,
  transitioningId,
  onEditAppointment,
  onCancelAppointment,
}: DayScheduleProps) {
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Agenda do Dia</span>
        </div>
        <span className="text-xs text-muted-foreground">{sorted.length} consultas</span>
      </div>

      <div className="divide-y divide-border">
        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground">Nenhuma consulta para esta data.</p>
          </div>
        ) : (
          sorted.map((appt) => {
            const time = new Date(appt.scheduledAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div
                key={appt.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group"
              >
                {/* Time */}
                <div className="w-12 flex-shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                  {time}
                </div>

                {/* Color bar */}
                <div className="w-0.5 h-8 rounded-full bg-primary/30 flex-shrink-0" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {appt.patientName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {appointmentTypeLabel[appt.type]} · {appt.professionalName}
                  </p>
                  {(appt.serviceName || appt.packageName || appt.programName) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {appt.serviceName ?? appt.packageName ?? appt.programName}
                    </p>
                  )}
                </div>

                {/* Status badge */}
                <StatusBadge status={appt.status} size="xs" />
                {appt.financialStatus && appt.financialStatus !== 'not_required' ? (
                  <span
                    className={[
                      'hidden rounded-full border px-2 py-0.5 text-xs font-semibold md:inline-flex',
                      appointmentFinancialStatusClass[appt.financialStatus],
                    ].join(' ')}
                  >
                    {appointmentFinancialStatusLabel[appt.financialStatus]}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onEditAppointment(appt)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  title="Editar consulta"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onCancelAppointment(appt)}
                  disabled={
                    transitioningId === appt.id ||
                    ['concluido', 'cancelado', 'falta'].includes(appt.status)
                  }
                  className="rounded-lg p-1.5 text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Cancelar consulta"
                >
                  <XCircle size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── WAITING QUEUE PANEL ──────────────────────────────────────────────────────

interface WaitingQueuePanelProps {
  queue: WaitingQueueEntry[];
  isLoading: boolean;
  onRefresh: () => void;
}

function WaitingQueuePanel({ queue, isLoading, onRefresh }: WaitingQueuePanelProps) {
  const activeStatuses: AppointmentStatus[] = [
    'triagem',
    'medidas',
    'bioimpedancia',
    'aguardando_medico',
    'em_consulta',
    'checkout',
  ];
  const activeQueue = queue.filter((entry) => activeStatuses.includes(entry.status));
  const waiting = queue.filter((entry) =>
    ['agendado', 'confirmado', 'chegou'].includes(entry.status)
  );

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Fila de Espera</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
            {activeQueue.length} ativos
          </span>
          <button
            onClick={onRefresh}
            className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : undefined} />
          </button>
        </div>
      </div>

      {/* Active patients */}
      {activeQueue.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Em atendimento
          </p>
          <div className="flex flex-col gap-2">
            {activeQueue.map((entry) => (
              <Link
                key={entry.id}
                href={
                  entry.appointmentId
                    ? `/clinic/patients/${entry.patientId}/encounter?appointmentId=${entry.appointmentId}`
                    : `/clinic/patients/${entry.patientId}/encounter`
                }
                className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border hover:border-primary/30 transition-colors cursor-pointer"
              >
                {/* Avatar placeholder */}
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {entry.patientName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {entry.patientName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{entry.professionalName}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={entry.status} size="xs" />
                  {entry.waitingMinutes > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {entry.waitingMinutes}min
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Waiting / scheduled */}
      {waiting.length > 0 && (
        <div className="px-4 pt-3 pb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Aguardando chegada
          </p>
          <div className="flex flex-col gap-2">
            {waiting.map((entry) => (
              <Link
                key={entry.id}
                href={`/clinic/patients/${entry.patientId}`}
                className="flex items-center gap-3 p-2.5 rounded-xl border border-dashed border-border hover:border-primary/30 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-muted-foreground">
                    {entry.patientName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {entry.patientName}
                  </p>
                  <p className="text-xs text-muted-foreground">{entry.scheduledTime}</p>
                </div>
                <StatusBadge status={entry.status} size="xs" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {!isLoading && activeQueue.length === 0 && waiting.length === 0 && (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-muted-foreground">Nenhum paciente na fila.</p>
        </div>
      )}
    </div>
  );
}

// ─── WORKFLOW PROGRESS BAR ────────────────────────────────────────────────────

function QueueStatusBadge({ status }: { status?: AttendanceQueueStatus }) {
  const normalized = status ?? 'waiting';
  const classes: Record<AttendanceQueueStatus, string> = {
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    waiting: 'bg-amber-50 text-amber-700 border-amber-200',
    called: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    in_attendance: 'bg-teal-50 text-teal-700 border-teal-200',
    checkout: 'bg-lime-50 text-lime-700 border-lime-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    no_show: 'bg-red-50 text-red-700 border-red-200',
    cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
    stuck: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
        classes[normalized],
      ].join(' ')}
    >
      {queueStatusLabel[normalized]}
    </span>
  );
}

function QueueWorkspace({
  queue,
  isLoading,
  actionId,
  onRefresh,
  onCall,
  onStart,
  onOpenPatient,
}: {
  queue: WaitingQueueEntry[];
  isLoading: boolean;
  actionId: string | null;
  onRefresh: () => void;
  onCall: (entry: WaitingQueueEntry) => void;
  onStart: (entry: WaitingQueueEntry) => void;
  onOpenPatient: (entry: WaitingQueueEntry) => void;
}) {
  const activeQueue = queue.filter(
    (entry) => !['completed', 'cancelled', 'no_show'].includes(entry.queueStatus ?? 'waiting')
  );
  const calledCount = activeQueue.filter((entry) => entry.queueStatus === 'called').length;
  const waitingCount = activeQueue.filter((entry) =>
    ['scheduled', 'waiting', 'stuck'].includes(entry.queueStatus ?? 'waiting')
  ).length;
  const inAttendanceCount = activeQueue.filter((entry) =>
    ['in_attendance', 'checkout'].includes(entry.queueStatus ?? 'waiting')
  ).length;

  if (isLoading) {
    return (
      <DataState
        kind="loading"
        title="Carregando fila"
        description="Sincronizando agenda e atendimentos do dia."
      />
    );
  }

  if (activeQueue.length === 0) {
    return (
      <DataState
        kind="empty"
        title="Fila vazia"
        description="Consultas confirmadas ou pacientes com check-in aparecem aqui."
        actionLabel="Atualizar"
        onAction={onRefresh}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { label: 'Aguardando', value: waitingCount, icon: Users },
          { label: 'Chamados', value: calledCount, icon: PhoneCall },
          { label: 'Em atendimento', value: inAttendanceCount, icon: UserCheck },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </span>
                <Icon size={16} className="text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {activeQueue.map((entry) => {
          const status = entry.queueStatus ?? 'waiting';
          const canCall = ['scheduled', 'waiting', 'stuck'].includes(status);
          const canStart = ['called', 'waiting', 'in_attendance', 'checkout'].includes(status);
          const busy = actionId === entry.id;

          return (
            <article
              key={entry.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                  {getInitials(entry.patientName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{entry.patientName}</h3>
                    <QueueStatusBadge status={entry.queueStatus} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {appointmentTypeLabel[entry.appointmentType]} - {entry.professionalName}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-muted/40 px-3 py-2">
                  <span className="block font-semibold text-foreground">Horario</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(entry.scheduledTime)}
                  </span>
                </div>
                <div className="rounded-xl bg-muted/40 px-3 py-2">
                  <span className="block font-semibold text-foreground">Espera</span>
                  <span className="text-muted-foreground">{entry.waitingMinutes} min</span>
                </div>
                <div className="rounded-xl bg-muted/40 px-3 py-2">
                  <span className="block font-semibold text-foreground">Sala</span>
                  <span className="text-muted-foreground">{entry.room ?? 'A definir'}</span>
                </div>
                <div className="rounded-xl bg-muted/40 px-3 py-2">
                  <span className="block font-semibold text-foreground">Alertas</span>
                  <span className="text-muted-foreground">{entry.alertCount ?? 0}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenPatient(entry)}
                  className="btn-secondary text-xs"
                >
                  <UserRound size={13} />
                  Paciente
                </button>
                {canCall ? (
                  <button
                    type="button"
                    onClick={() => onCall(entry)}
                    disabled={busy}
                    className="btn-secondary text-xs disabled:opacity-60"
                  >
                    <PhoneCall size={13} />
                    {busy ? 'Chamando...' : 'Chamar'}
                  </button>
                ) : null}
                {canStart ? (
                  <button
                    type="button"
                    onClick={() => onStart(entry)}
                    disabled={busy}
                    className="btn-primary text-xs disabled:opacity-60"
                  >
                    <PlayCircle size={13} />
                    {busy ? 'Abrindo...' : 'Iniciar atendimento'}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ReturnsWorkspace({
  returns,
  isLoading,
  actionId,
  onContacted,
  onDismiss,
  onSchedule,
  onOpenPatient,
}: {
  returns: PatientReturnSummary[];
  isLoading: boolean;
  actionId: string | null;
  onContacted: (item: PatientReturnSummary) => void;
  onDismiss: (item: PatientReturnSummary) => void;
  onSchedule: (item: PatientReturnSummary) => void;
  onOpenPatient: (item: PatientReturnSummary) => void;
}) {
  if (isLoading) {
    return (
      <DataState
        kind="loading"
        title="Carregando retornos"
        description="Buscando proximas acoes de acompanhamento."
      />
    );
  }

  if (returns.length === 0) {
    return (
      <DataState
        kind="empty"
        title="Nenhum retorno pendente"
        description="Retornos criados apos atendimento ou acompanhamento aparecem nesta fila."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {returns.map((item) => {
        const busy = actionId === item.id;
        return (
          <article key={item.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{item.patientName}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              </div>
              <StatusBadge status={item.status} label={returnStatusLabel[item.status]} size="xs" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-muted/40 px-3 py-2">
                <span className="block font-semibold text-foreground">Prazo</span>
                <span className="text-muted-foreground">{formatDate(item.dueDate)}</span>
              </div>
              <div className="rounded-xl bg-muted/40 px-3 py-2">
                <span className="block font-semibold text-foreground">Contato</span>
                <span className="text-muted-foreground">
                  {item.patientPhone ?? 'Nao informado'}
                </span>
              </div>
              <div className="rounded-xl bg-muted/40 px-3 py-2">
                <span className="block font-semibold text-foreground">Pacote</span>
                <span className="text-muted-foreground">
                  {item.activePackageName ?? 'Sem pacote'}
                </span>
              </div>
              <div className="rounded-xl bg-muted/40 px-3 py-2">
                <span className="block font-semibold text-foreground">Alertas</span>
                <span className="text-muted-foreground">{item.alertCount ?? 0}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenPatient(item)}
                className="btn-secondary text-xs"
              >
                <UserRound size={13} />
                Paciente
              </button>
              <button
                type="button"
                onClick={() => onContacted(item)}
                disabled={busy}
                className="btn-secondary text-xs disabled:opacity-60"
              >
                <PhoneCall size={13} />
                Contato feito
              </button>
              <button
                type="button"
                onClick={() => onSchedule(item)}
                disabled={busy}
                className="btn-primary text-xs disabled:opacity-60"
              >
                <CalendarPlus size={13} />
                Agendar
              </button>
              <button
                type="button"
                onClick={() => onDismiss(item)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                <ClipboardCheck size={13} />
                Dispensar
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PatientOperationalDrawer({
  target,
  onClose,
  onStart,
  onScheduleReturn,
}: {
  target: PatientDrawerTarget;
  onClose: () => void;
  onStart: (input: { appointmentId?: string | null; queueId?: string | null }) => void;
  onScheduleReturn: (item: PatientReturnSummary) => void;
}) {
  const item = target.item;
  const appointmentId =
    target.kind === 'appointment'
      ? target.item.id
      : target.kind === 'queue'
        ? target.item.appointmentId
        : target.item.targetAppointmentId;
  const queueId = target.kind === 'queue' ? (target.item.queueId ?? target.item.id) : undefined;
  const patientHref = `/clinic/patients/${item.patientId}`;

  return (
    <Dialog
      open
      title={item.patientName}
      description="Contexto rapido para operar agenda, fila e retorno."
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
      mobileFullscreen
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
            {getInitials(item.patientName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{item.patientName}</p>
            <p className="text-xs text-muted-foreground">
              {item.patientPhone ?? 'Contato nao informado'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Package size={13} />
              Pacote
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {item.activePackageName ?? 'Sem pacote ativo'}
            </p>
          </div>
          <div className="rounded-xl border border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Bell size={13} />
              Alertas
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">{item.alertCount ?? 0}</p>
          </div>
        </div>

        {target.kind === 'queue' ? (
          <div className="rounded-xl border border-border px-3 py-2 text-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">Fila</span>
              <QueueStatusBadge status={target.item.queueStatus} />
            </div>
            <p className="text-xs text-muted-foreground">
              Espera de {target.item.waitingMinutes} min · {target.item.room ?? 'Sala a definir'}
            </p>
          </div>
        ) : null}

        {target.kind === 'appointment' ? (
          <div className="rounded-xl border border-border px-3 py-2 text-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">Consulta</span>
              <StatusBadge status={target.item.status} size="xs" />
            </div>
            <p className="text-xs text-muted-foreground">
              {appointmentTypeLabel[target.item.type]} · {formatDateTime(target.item.scheduledAt)}
            </p>
            {(target.item.serviceName || target.item.packageName || target.item.programName) && (
              <p className="mt-1 text-xs font-medium text-foreground">
                {target.item.serviceName ?? target.item.packageName ?? target.item.programName}
              </p>
            )}
            {target.item.financialStatus && target.item.financialStatus !== 'not_required' ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {appointmentFinancialStatusLabel[target.item.financialStatus]}
                {target.item.financialAmountCents
                  ? ` - ${formatMoneyFromCents(target.item.financialAmountCents)}`
                  : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        {target.kind === 'return' ? (
          <div className="rounded-xl border border-border px-3 py-2 text-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">Retorno</span>
              <StatusBadge
                status={target.item.status}
                label={returnStatusLabel[target.item.status]}
                size="xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Prazo {formatDate(target.item.dueDate)} · {target.item.reason}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Link href={patientHref} className="btn-secondary text-sm">
            <UserRound size={14} />
            Abrir 360
          </Link>
          {appointmentId ? (
            <button
              type="button"
              onClick={() => onStart({ appointmentId, queueId })}
              className="btn-primary text-sm"
            >
              <PlayCircle size={14} />
              Iniciar atendimento
            </button>
          ) : null}
          {target.kind === 'return' ? (
            <button
              type="button"
              onClick={() => onScheduleReturn(target.item)}
              className="btn-secondary text-sm"
            >
              <CalendarPlus size={14} />
              Agendar retorno
            </button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function WorkflowProgressBar({ appointments }: { appointments: AppointmentSummary[] }) {
  const total = appointments.length;
  const concluded = appointments.filter((a) => a.status === 'concluido').length;
  const inProgress = appointments.filter((a) =>
    [
      'chegou',
      'triagem',
      'medidas',
      'bioimpedancia',
      'aguardando_medico',
      'em_consulta',
      'checkout',
    ].includes(a.status)
  ).length;
  const scheduled = appointments.filter((a) =>
    ['agendado', 'confirmado'].includes(a.status)
  ).length;
  const absent = appointments.filter((a) => ['falta', 'cancelado'].includes(a.status)).length;
  const percent = (value: number) => (total > 0 ? `${(value / total) * 100}%` : '0%');

  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">Progresso do Dia</span>
        <span className="text-xs text-muted-foreground">
          {concluded}/{total} concluídas
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted gap-0.5 mb-3">
        {total === 0 ? <div className="w-full bg-muted" /> : null}
        {concluded > 0 && (
          <div
            className="bg-emerald-500 rounded-full transition-all"
            style={{ width: percent(concluded) }}
          />
        )}
        {inProgress > 0 && (
          <div
            className="bg-teal-400 rounded-full transition-all"
            style={{ width: percent(inProgress) }}
          />
        )}
        {scheduled > 0 && (
          <div
            className="bg-blue-300 rounded-full transition-all"
            style={{ width: percent(scheduled) }}
          />
        )}
        {absent > 0 && (
          <div
            className="bg-red-400 rounded-full transition-all"
            style={{ width: percent(absent) }}
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Concluídas', value: concluded, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Em andamento', value: inProgress, color: 'text-teal-600', bg: 'bg-teal-50' },
          { label: 'Agendadas', value: scheduled, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Faltas/Cancel.', value: absent, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((stat) => (
          <div key={stat.label} className={['rounded-xl p-2 text-center', stat.bg].join(' ')}>
            <p className={['text-lg font-bold tabular-nums', stat.color].join(' ')}>{stat.value}</p>
            <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN CONTENT ─────────────────────────────────────────────────────────────

export default function AgendaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateValue());
  const [activeTab, setActiveTab] = useState<AgendaTab>(() => {
    const tab = searchParams.get('tab');
    return isAgendaTab(tab) ? tab : 'agenda';
  });
  const [activeView, setActiveView] = useState<'kanban' | 'lista'>('kanban');
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [waitingQueue, setWaitingQueue] = useState<WaitingQueueEntry[]>([]);
  const [returns, setReturns] = useState<PatientReturnSummary[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlotSummary[]>([]);
  const [scheduleOptions, setScheduleOptions] = useState<AgendaScheduleOptions>(() =>
    createEmptyScheduleOptions(getLocalDateValue())
  );
  const [scheduleOptionsLoading, setScheduleOptionsLoading] = useState(true);
  const [scheduleOptionsError, setScheduleOptionsError] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState<RoomFormState>(() => createEmptyRoomForm());
  const [allocationForm, setAllocationForm] = useState<AllocationFormState>(() =>
    createEmptyAllocationForm()
  );
  const [scheduleSubmitting, setScheduleSubmitting] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [queueActionId, setQueueActionId] = useState<string | null>(null);
  const [returnActionId, setReturnActionId] = useState<string | null>(null);
  const [patientDrawerTarget, setPatientDrawerTarget] = useState<PatientDrawerTarget | null>(null);
  const [schedulingReturnId, setSchedulingReturnId] = useState<string | null>(null);
  const [appointmentFormMode, setAppointmentFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [appointmentForm, setAppointmentForm] = useState<AppointmentFormState>(() =>
    createEmptyAppointmentForm(getLocalDateValue())
  );
  const [appointmentFormError, setAppointmentFormError] = useState<string | null>(null);
  const [appointmentFormSubmitting, setAppointmentFormSubmitting] = useState(false);
  const [patientOptions, setPatientOptions] = useState<PatientListRow[]>([]);
  const [patientOptionsLoading, setPatientOptionsLoading] = useState(false);
  const [commercialCatalog, setCommercialCatalog] = useState<CommercialCatalogState>(() =>
    createEmptyCommercialCatalog()
  );
  const [commercialCatalogLoading, setCommercialCatalogLoading] = useState(false);
  const [commercialCatalogError, setCommercialCatalogError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AppointmentSummary | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const loadAgenda = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await getAgendaDay(selectedDate);
      setAppointments(data.appointments);
      setWaitingQueue(data.waitingQueue);
      setReturns(data.returns);
      setBlockedSlots(data.blockedSlots);
      setCalendarEvents(data.calendarEvents);
    } catch (error) {
      setAppointments([]);
      setWaitingQueue([]);
      setReturns([]);
      setBlockedSlots([]);
      setCalendarEvents({});
      setLoadError(error instanceof Error ? error.message : 'Erro ao carregar agenda.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  const loadScheduleOptions = useCallback(async () => {
    setScheduleOptionsLoading(true);
    setScheduleOptionsError(null);

    try {
      const data = await getAgendaScheduleOptions(selectedDate);
      setScheduleOptions(data);
    } catch (error) {
      setScheduleOptions(createEmptyScheduleOptions(selectedDate));
      setScheduleOptionsError(
        error instanceof Error ? error.message : 'Nao foi possivel carregar salas e escala.'
      );
    } finally {
      setScheduleOptionsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);

  useEffect(() => {
    void loadScheduleOptions();
  }, [loadScheduleOptions]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (isAgendaTab(tab)) setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = useCallback(
    (tab: AgendaTab) => {
      setActiveTab(tab);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set('tab', tab);
      router.replace(`/clinic/agenda?${nextParams.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleAdvanceStatus = useCallback(
    async (appointment: AppointmentSummary) => {
      const nextStatus = getNextAppointmentStatus(appointment.status);
      if (!nextStatus) return;

      setTransitioningId(appointment.id);
      setLoadError(null);

      try {
        await updateAppointmentStatus(appointment.id, nextStatus);
        await loadAgenda();
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível atualizar o status da consulta.'
        );
      } finally {
        setTransitioningId(null);
      }
    },
    [loadAgenda]
  );

  const handleCallQueue = useCallback(
    async (entry: WaitingQueueEntry) => {
      const queueId = entry.queueId ?? entry.id;
      setQueueActionId(entry.id);
      setLoadError(null);

      const result = await callAttendanceQueue(queueId);
      if (result.error) {
        setLoadError(result.error.message);
      } else {
        await loadAgenda();
      }

      setQueueActionId(null);
    },
    [loadAgenda]
  );

  const handleStartAttendance = useCallback(
    async (input: { appointmentId?: string | null; queueId?: string | null }) => {
      if (!input.appointmentId && !input.queueId) return;

      setQueueActionId(input.queueId ?? input.appointmentId ?? null);
      setTransitioningId(input.appointmentId ?? null);
      setLoadError(null);

      const result = await startAttendanceEncounter(input);
      setQueueActionId(null);
      setTransitioningId(null);

      if (result.error || !result.data) {
        setLoadError(result.error?.message ?? 'Nao foi possivel iniciar atendimento.');
        return;
      }

      router.push(result.data.href);
    },
    [router]
  );

  const handleStartQueueEntry = useCallback(
    (entry: WaitingQueueEntry) => {
      void handleStartAttendance({
        appointmentId: entry.appointmentId,
        queueId: entry.queueId ?? entry.id,
      });
    },
    [handleStartAttendance]
  );

  const handleReturnAction = useCallback(
    async (
      item: PatientReturnSummary,
      action: 'contacted' | 'dismissed',
      notes?: string | null
    ) => {
      setReturnActionId(item.id);
      setLoadError(null);

      const result = await recordPatientReturnAction(item.id, action, { notes });
      if (result.error) {
        setLoadError(result.error.message);
      } else {
        await loadAgenda();
      }

      setReturnActionId(null);
    },
    [loadAgenda]
  );

  const loadPatientOptions = useCallback(async () => {
    setPatientOptionsLoading(true);
    try {
      const rows = await getPatientList();
      setPatientOptions(rows);
    } catch (error) {
      setPatientOptions([]);
      setAppointmentFormError(
        error instanceof Error ? error.message : 'Nao foi possivel carregar pacientes.'
      );
    } finally {
      setPatientOptionsLoading(false);
    }
  }, []);

  const loadCommercialCatalog = useCallback(async () => {
    setCommercialCatalogLoading(true);
    setCommercialCatalogError(null);

    const result = await getClinicCommercialCatalog();
    if (result.error || !result.data) {
      setCommercialCatalog(createEmptyCommercialCatalog());
      setCommercialCatalogError(
        result.error?.message ?? 'Nao foi possivel carregar catalogo comercial.'
      );
    } else {
      setCommercialCatalog({
        services: result.data.services,
        packages: result.data.packages,
        programs: result.data.programs,
      });
    }

    setCommercialCatalogLoading(false);
  }, []);

  const handleSaveRoom = async () => {
    const code = roomForm.code.trim();
    const name = roomForm.name.trim();

    if (!code || !name) {
      setScheduleOptionsError('Informe nome e codigo da sala.');
      return;
    }

    setScheduleSubmitting('room');
    setScheduleOptionsError(null);

    const result = await saveClinicRoom({
      code,
      name,
      roomType: roomForm.roomType,
      status: roomForm.status,
      capacity: Number(roomForm.capacity) || 1,
    });

    setScheduleSubmitting(null);

    if (result.error) {
      setScheduleOptionsError(result.error.message);
      return;
    }

    setRoomForm(createEmptyRoomForm());
    await loadScheduleOptions();
  };

  const handleSaveAllocation = async () => {
    if (!allocationForm.professionalProfileId || !allocationForm.roomId) {
      setScheduleOptionsError('Selecione profissional e sala para a escala.');
      return;
    }

    setScheduleSubmitting('allocation');
    setScheduleOptionsError(null);

    const result = await saveProfessionalDayAllocation({
      professionalProfileId: allocationForm.professionalProfileId,
      roomId: allocationForm.roomId,
      workDate: selectedDate,
      startTime: allocationForm.startTime,
      endTime: allocationForm.endTime,
      status: allocationForm.status,
      notes: allocationForm.notes,
    });

    setScheduleSubmitting(null);

    if (result.error) {
      setScheduleOptionsError(result.error.message);
      return;
    }

    setAllocationForm(createEmptyAllocationForm());
    await loadScheduleOptions();
  };

  const handleCancelAllocation = async (allocationId: string) => {
    setScheduleSubmitting(allocationId);
    setScheduleOptionsError(null);

    const result = await cancelProfessionalDayAllocation(allocationId, 'Cancelado pela agenda.');

    setScheduleSubmitting(null);

    if (result.error) {
      setScheduleOptionsError(result.error.message);
      return;
    }

    await loadScheduleOptions();
  };

  const closeAppointmentForm = () => {
    if (appointmentFormSubmitting) return;
    setAppointmentFormMode(null);
    setEditingAppointmentId(null);
    setSchedulingReturnId(null);
    setAppointmentFormError(null);
  };

  const openCreateAppointment = () => {
    setAppointmentFormMode('create');
    setEditingAppointmentId(null);
    setSchedulingReturnId(null);
    setAppointmentForm(createEmptyAppointmentForm(selectedDate));
    setAppointmentFormError(null);
    void loadPatientOptions();
    void loadCommercialCatalog();
  };

  const openScheduleReturn = (item: PatientReturnSummary) => {
    setAppointmentFormMode('create');
    setEditingAppointmentId(null);
    setSchedulingReturnId(item.id);
    setAppointmentForm({
      ...createEmptyAppointmentForm(item.dueDate || selectedDate),
      patientId: item.patientId,
      type: 'retorno',
      notes: item.reason,
    });
    setAppointmentFormError(null);
    setPatientDrawerTarget(null);
    void loadPatientOptions();
    void loadCommercialCatalog();
  };

  const openEditAppointment = (appointment: AppointmentSummary) => {
    setAppointmentFormMode('edit');
    setEditingAppointmentId(appointment.id);
    setSchedulingReturnId(null);
    setAppointmentForm(appointmentToForm(appointment));
    setAppointmentFormError(null);
    void loadPatientOptions();
    void loadCommercialCatalog();
  };

  const handleSubmitAppointmentForm = async () => {
    const activeAllocations = scheduleOptions.allocations.filter(
      (allocation) => allocation.status === 'available' || allocation.status === 'scheduled'
    );
    if (activeAllocations.length > 0 && !appointmentForm.professionalProfileId) {
      setAppointmentFormError('Selecione um profissional da escala do dia.');
      return;
    }

    if (appointmentForm.billingMode !== 'none') {
      const amountCents = parseCurrencyToCents(appointmentForm.billingAmount);
      if (amountCents <= 0) {
        setAppointmentFormError('Informe um valor maior que zero para a cobranca local.');
        return;
      }
      if (!appointmentForm.billingDueDate) {
        setAppointmentFormError('Informe o vencimento da cobranca local.');
        return;
      }
      if (appointmentForm.billingMode === 'manual_paid' && !appointmentForm.paymentMethod) {
        setAppointmentFormError('Informe o metodo do pagamento manual.');
        return;
      }
    }

    setAppointmentFormSubmitting(true);
    setAppointmentFormError(null);

    const input = toAppointmentMutationInput(appointmentForm);
    const result =
      appointmentFormMode === 'edit' && editingAppointmentId
        ? await updateAppointment(editingAppointmentId, input)
        : await createAppointment(input);

    setAppointmentFormSubmitting(false);

    if (result.error || !result.data) {
      setAppointmentFormError(result.error?.message ?? 'Nao foi possivel salvar consulta.');
      return;
    }

    const financialWarning =
      result.data.financialStatus === 'failed'
        ? result.data.financialError
          ? `Consulta salva, mas o financeiro ficou parcial: ${result.data.financialError}.`
          : 'Consulta salva, mas o financeiro ficou parcial.'
        : null;

    if (schedulingReturnId) {
      const returnResult = await recordPatientReturnAction(schedulingReturnId, 'scheduled', {
        appointmentId: result.data.id,
        notes: 'Retorno agendado pela agenda clinica.',
      });

      if (returnResult.error) {
        setAppointmentFormError(returnResult.error.message);
        return;
      }
    }

    const nextDate = appointmentForm.date;
    closeAppointmentForm();
    if (financialWarning) setLoadError(financialWarning);
    if (nextDate !== selectedDate) {
      setSelectedDate(nextDate);
    } else {
      await loadAgenda();
      await loadScheduleOptions();
    }
  };

  const handleCancelAppointment = (appointment: AppointmentSummary) => {
    setCancelTarget(appointment);
    setCancelReason('');
    setCancelError(null);
  };

  const closeCancelAppointment = () => {
    if (cancelSubmitting) return;
    setCancelTarget(null);
    setCancelReason('');
    setCancelError(null);
  };

  const confirmCancelAppointment = async () => {
    if (!cancelTarget) return;

    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setCancelError('Informe um motivo de cancelamento com pelo menos 3 caracteres.');
      return;
    }

    setCancelSubmitting(true);
    setTransitioningId(cancelTarget.id);
    setLoadError(null);
    setCancelError(null);

    const result = await cancelAppointment(cancelTarget.id, reason);
    if (result.error) {
      setCancelError(result.error.message);
    } else {
      setCancelTarget(null);
      setCancelReason('');
      setCancelError(null);
      await loadAgenda();
    }

    setTransitioningId(null);
    setCancelSubmitting(false);
  };

  const formattedDate = (() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  })();

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {appointmentFormMode && (
        <AppointmentFormModal
          mode={appointmentFormMode}
          form={appointmentForm}
          patients={patientOptions}
          patientsLoading={patientOptionsLoading}
          commercialCatalog={commercialCatalog}
          commercialCatalogLoading={commercialCatalogLoading}
          commercialCatalogError={commercialCatalogError}
          scheduleOptions={scheduleOptions}
          scheduleOptionsLoading={scheduleOptionsLoading}
          error={appointmentFormError}
          submitting={appointmentFormSubmitting}
          onChange={(patch) => setAppointmentForm((current) => ({ ...current, ...patch }))}
          onClose={closeAppointmentForm}
          onSubmit={handleSubmitAppointmentForm}
        />
      )}

      {cancelTarget && (
        <CancelAppointmentModal
          appointment={cancelTarget}
          reason={cancelReason}
          error={cancelError}
          submitting={cancelSubmitting}
          onChangeReason={setCancelReason}
          onClose={closeCancelAppointment}
          onConfirm={confirmCancelAppointment}
        />
      )}

      {patientDrawerTarget && (
        <PatientOperationalDrawer
          target={patientDrawerTarget}
          onClose={() => setPatientDrawerTarget(null)}
          onStart={(input) => void handleStartAttendance(input)}
          onScheduleReturn={openScheduleReturn}
        />
      )}

      {/* Page header */}
      <PageHeader
        title="Agenda e Fila"
        subtitle={
          isLoading
            ? `${formattedDate} - carregando`
            : `${formattedDate} - ${appointments.length} consultas`
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              title="Filtros avançados entram junto do contrato real de agenda."
              className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Filter size={14} />
              Filtrar
            </button>
            <button
              type="button"
              onClick={openCreateAppointment}
              className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5"
            >
              <Plus size={14} />
              Nova Consulta
            </button>
          </div>
        }
      />

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Não foi possível concluir a operação da agenda. {loadError}</span>
            <button
              type="button"
              onClick={loadAgenda}
              disabled={isLoading}
              className="btn-secondary text-xs disabled:opacity-60"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : undefined} />
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      <Tabs
        label="Modulos da agenda"
        value={activeTab}
        onValueChange={handleTabChange}
        items={[
          { id: 'agenda', label: 'Agenda', badge: appointments.length },
          { id: 'fila', label: 'Fila', badge: waitingQueue.length },
          { id: 'retornos', label: 'Retornos', badge: returns.length },
        ]}
      />

      {/* Main layout */}
      {activeTab === 'agenda' ? (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
          {/* LEFT COLUMN: Calendar + Queue */}
          <div className="flex flex-col gap-4">
            <WeekStrip
              selectedDate={selectedDate}
              calendarEvents={calendarEvents}
              onSelectDate={setSelectedDate}
            />
            <MiniCalendar
              selectedDate={selectedDate}
              calendarEvents={calendarEvents}
              onSelectDate={setSelectedDate}
            />
            <WaitingQueuePanel queue={waitingQueue} isLoading={isLoading} onRefresh={loadAgenda} />
            <BlockedSlotsPanel slots={blockedSlots} />
            <AgendaSchedulePanel
              selectedDate={selectedDate}
              options={scheduleOptions}
              isLoading={scheduleOptionsLoading}
              error={scheduleOptionsError}
              roomForm={roomForm}
              allocationForm={allocationForm}
              submitting={scheduleSubmitting}
              onRoomChange={(patch) => setRoomForm((current) => ({ ...current, ...patch }))}
              onAllocationChange={(patch) =>
                setAllocationForm((current) => ({ ...current, ...patch }))
              }
              onSaveRoom={handleSaveRoom}
              onSaveAllocation={handleSaveAllocation}
              onCancelAllocation={handleCancelAllocation}
              onRefresh={loadScheduleOptions}
            />
          </div>

          {/* RIGHT COLUMN: Workflow + Schedule */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Progress bar */}
            <WorkflowProgressBar appointments={appointments} />

            {/* View toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
                <button
                  onClick={() => setActiveView('kanban')}
                  className={[
                    'text-xs font-medium px-3 py-1.5 rounded-lg transition-all',
                    activeView === 'kanban'
                      ? 'bg-card shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  Fluxo Clínico
                </button>
                <button
                  onClick={() => setActiveView('lista')}
                  className={[
                    'text-xs font-medium px-3 py-1.5 rounded-lg transition-all',
                    activeView === 'lista'
                      ? 'bg-card shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  Lista do Dia
                </button>
              </div>

              {/* Stage legend */}
              <div className="hidden xl:flex items-center gap-2 flex-wrap">
                {workflowStages.map((stage, i) => (
                  <React.Fragment key={stage.key}>
                    <span
                      className={[
                        'flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border',
                        stage.bgColor,
                        stage.color,
                        stage.borderColor,
                      ].join(' ')}
                    >
                      <span className={['w-1.5 h-1.5 rounded-full', stage.dotColor].join(' ')} />
                      {stage.label}
                    </span>
                    {i < workflowStages.length - 1 && (
                      <ArrowRight size={10} className="text-muted-foreground/40 flex-shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Kanban / List view */}
            {activeView === 'kanban' ? (
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-3 min-w-max">
                  {workflowStages.map((stage) => (
                    <KanbanColumn
                      key={stage.key}
                      stage={stage}
                      appointments={appointments}
                      transitioningId={transitioningId}
                      onAdvanceStatus={handleAdvanceStatus}
                      onEditAppointment={openEditAppointment}
                      onCancelAppointment={handleCancelAppointment}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <DaySchedule
                appointments={appointments}
                transitioningId={transitioningId}
                onEditAppointment={openEditAppointment}
                onCancelAppointment={handleCancelAppointment}
              />
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'fila' ? (
        <QueueWorkspace
          queue={waitingQueue}
          isLoading={isLoading}
          actionId={queueActionId}
          onRefresh={loadAgenda}
          onCall={handleCallQueue}
          onStart={handleStartQueueEntry}
          onOpenPatient={(entry) => setPatientDrawerTarget({ kind: 'queue', item: entry })}
        />
      ) : null}

      {activeTab === 'retornos' ? (
        <ReturnsWorkspace
          returns={returns}
          isLoading={isLoading}
          actionId={returnActionId}
          onContacted={(item) => void handleReturnAction(item, 'contacted')}
          onDismiss={(item) => void handleReturnAction(item, 'dismissed')}
          onSchedule={openScheduleReturn}
          onOpenPatient={(item) => setPatientDrawerTarget({ kind: 'return', item })}
        />
      ) : null}
    </div>
  );
}
