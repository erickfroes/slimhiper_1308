'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Clock3, PackageCheck } from 'lucide-react';
import DataState from '@/components/ui/DataState';
import {
  bookPatientPortalAppointment,
  bookPatientPortalAvulsoAppointment,
  cancelPatientPortalAppointment,
  getPatientPortalAvulsoBookingOptions,
  getPatientPortalBookingOptions,
  getPatientPortalOperationalSnapshot,
  reschedulePatientPortalAppointment,
  type PatientPortalBookingOptions,
  type PatientPortalAvulsoBookingOptions,
  type PatientPortalOperationalSnapshot,
} from '@/services/patientPortalApi';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data indisponível'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function PatientAppointmentsSection({ patientId }: { patientId: string }) {
  const [data, setData] = useState<PatientPortalOperationalSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<PatientPortalBookingOptions | null>(null);
  const [avulsoBooking, setAvulsoBooking] = useState<PatientPortalAvulsoBookingOptions | null>(
    null
  );
  const [serviceId, setServiceId] = useState('');
  const [allocationId, setAllocationId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [avulsoServiceId, setAvulsoServiceId] = useState('');
  const [avulsoAllocationId, setAvulsoAllocationId] = useState('');
  const [avulsoScheduledAt, setAvulsoScheduledAt] = useState('');

  async function reload() {
    const result = await getPatientPortalOperationalSnapshot(patientId);
    setData(result.data);
    setError(result.error?.message ?? null);
  }

  useEffect(() => {
    let active = true;
    void getPatientPortalOperationalSnapshot(patientId).then((result) => {
      if (!active) return;
      setData(result.data);
      setError(result.error?.message ?? null);
      setLoading(false);
    });
    void getPatientPortalBookingOptions(patientId).then((result) => {
      setBooking(result.data);
      if (result.error) setBookingMessage(result.error.message);
    });
    void getPatientPortalAvulsoBookingOptions(patientId).then((result) => {
      if (!active) return;
      setAvulsoBooking(result.data);
    });
    return () => {
      active = false;
    };
  }, [patientId]);

  if (loading) return <DataState kind="loading" title="Carregando atendimentos" />;
  if (error || !data)
    return <DataState kind="error" title="Atendimentos indisponíveis" description={error ?? ''} />;

  const upcoming = data.appointments.filter(
    (item) => !['concluido', 'cancelado', 'falta'].includes(item.status)
  );
  const selectedService = booking?.services.find((service) => service.serviceId === serviceId);
  async function submitBooking() {
    if (!allocationId || !scheduledAt || (!reschedulingId && !selectedService)) return;
    if (reschedulingId) {
      const result = await reschedulePatientPortalAppointment({
        appointmentId: reschedulingId,
        allocationId,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      setBookingMessage(
        result.error?.message ??
          (result.data ? 'Atendimento reagendado.' : 'Não foi possível reagendar.')
      );
      if (result.data) {
        setReschedulingId(null);
        await reload();
      }
      return;
    }
    if (!selectedService) return;
    const result = await bookPatientPortalAppointment({
      patientId,
      serviceId,
      enrollmentId: selectedService.enrollmentId,
      allocationId,
      scheduledAt: new Date(scheduledAt).toISOString(),
    });
    setBookingMessage(
      result.error?.message ?? (result.data ? 'Atendimento agendado.' : 'Não foi possível agendar.')
    );
    if (result.data) await reload();
  }
  async function cancelAppointment(appointmentId: string) {
    setCancellingId(appointmentId);
    const result = await cancelPatientPortalAppointment(appointmentId);
    setCancellingId(null);
    setBookingMessage(
      result.error?.message ??
        (result.data
          ? 'Atendimento cancelado; o saldo foi atualizado.'
          : 'Não foi possível cancelar.')
    );
    if (result.data) await reload();
  }
  async function submitAvulsoBooking() {
    if (!avulsoBooking || !avulsoServiceId || !avulsoAllocationId || !avulsoScheduledAt) return;
    const result = await bookPatientPortalAvulsoAppointment({
      patientId,
      serviceId: avulsoServiceId,
      allocationId: avulsoAllocationId,
      scheduledAt: new Date(avulsoScheduledAt).toISOString(),
    });
    setBookingMessage(
      result.error?.message ??
        (result.data
          ? 'Atendimento avulso agendado. A cobrança está em Financeiro.'
          : 'Não foi possível agendar.')
    );
    if (result.data) await reload();
  }
  return (
    <div className="space-y-6">
      {booking ? (
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h2 className="text-lg font-bold text-foreground">
            {reschedulingId ? 'Reagendar atendimento' : 'Agendar atendimento'}
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {!reschedulingId ? (
              <select
                className="input-base"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">Serviço incluído</option>
                {booking.services.map((service) => (
                  <option
                    key={`${service.serviceId}-${service.enrollmentId}`}
                    value={service.serviceId}
                  >
                    {service.name} · {service.available} disponível
                  </option>
                ))}
              </select>
            ) : (
              <div className="input-base flex items-center text-sm text-muted-foreground">
                Escolha um novo horário abaixo
              </div>
            )}
            <select
              className="input-base"
              value={allocationId}
              onChange={(event) => setAllocationId(event.target.value)}
            >
              <option value="">Profissional e sala</option>
              {booking.allocations.map((allocation) => (
                <option key={allocation.id} value={allocation.id}>
                  {allocation.professionalName} · {allocation.roomName}
                </option>
              ))}
            </select>
            <input
              className="input-base"
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={!allocationId || !scheduledAt || (!reschedulingId && !selectedService)}
            onClick={() => void submitBooking()}
          >
            {reschedulingId ? 'Confirmar reagendamento' : 'Confirmar agendamento'}
          </button>
          {reschedulingId ? (
            <button
              type="button"
              className="ml-3 text-sm font-semibold text-muted-foreground"
              onClick={() => setReschedulingId(null)}
            >
              Cancelar alteração
            </button>
          ) : null}
          {bookingMessage ? (
            <p className="mt-2 text-sm text-muted-foreground">{bookingMessage}</p>
          ) : null}
        </section>
      ) : null}
      {avulsoBooking ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-bold text-foreground">Agendar serviço avulso</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O valor é registrado como cobrança local e aparece em Financeiro.
          </p>
          {avulsoBooking.paymentRequiredBeforeConfirmation ? (
            <p className="mt-2 text-sm font-medium text-amber-700">
              Esta clínica exige confirmação de pagamento pela equipe antes do agendamento avulso.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <select
                className="input-base"
                value={avulsoServiceId}
                onChange={(event) => setAvulsoServiceId(event.target.value)}
              >
                <option value="">Serviço e preço</option>
                {avulsoBooking.services.map((service) => (
                  <option key={service.serviceId} value={service.serviceId}>
                    {service.name} ·{' '}
                    {(service.priceCents / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </option>
                ))}
              </select>
              <select
                className="input-base"
                value={avulsoAllocationId}
                onChange={(event) => setAvulsoAllocationId(event.target.value)}
              >
                <option value="">Profissional e sala</option>
                {avulsoBooking.allocations.map((allocation) => (
                  <option key={allocation.id} value={allocation.id}>
                    {allocation.professionalName} · {allocation.roomName}
                  </option>
                ))}
              </select>
              <input
                className="input-base"
                type="datetime-local"
                value={avulsoScheduledAt}
                onChange={(event) => setAvulsoScheduledAt(event.target.value)}
              />
            </div>
          )}
          {!avulsoBooking.paymentRequiredBeforeConfirmation ? (
            <button
              type="button"
              className="btn-primary mt-3"
              disabled={!avulsoServiceId || !avulsoAllocationId || !avulsoScheduledAt}
              onClick={() => void submitAvulsoBooking()}
            >
              Agendar com cobrança local
            </button>
          ) : null}
        </section>
      ) : null}
      <section>
        <h2 className="text-lg font-bold text-foreground">Meus atendimentos</h2>
        <div className="mt-3 space-y-2">
          {(upcoming.length ? upcoming : data.appointments).slice(0, 8).map((appointment) => (
            <article key={appointment.id} className="rounded-xl border border-border p-3">
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold text-foreground">{appointment.serviceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(appointment.scheduledAt)} · {appointment.professionalName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {appointment.roomName ?? 'Local a confirmar'} · {appointment.status}
                  </p>
                  {appointment.canCancel ? (
                    <div className="mt-2 flex gap-3">
                      <button
                        type="button"
                        disabled={cancellingId === appointment.id}
                        onClick={() => void cancelAppointment(appointment.id)}
                        className="text-xs font-semibold text-negative"
                      >
                        {cancellingId === appointment.id ? 'Cancelando...' : 'Cancelar atendimento'}
                      </button>
                      {booking ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReschedulingId(appointment.id);
                            setBookingMessage(null);
                          }}
                          className="text-xs font-semibold text-primary"
                        >
                          Reagendar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          {!data.appointments.length ? (
            <DataState kind="empty" title="Nenhum atendimento encontrado" />
          ) : null}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-foreground">Saldo dos serviços</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.credits.map((credit) => (
            <article
              key={`${credit.enrollmentId}-${credit.serviceId}`}
              className="rounded-xl border border-border p-3"
            >
              <div className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-primary" />
                <p className="font-semibold">{credit.serviceName}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{credit.programName}</p>
              <p className="mt-3 text-sm">
                <strong>{credit.available}</strong> disponível · {credit.reserved} reservado ·{' '}
                {credit.used} realizado
              </p>
            </article>
          ))}
          {!data.credits.length ? <DataState kind="empty" title="Nenhum crédito ativo" /> : null}
        </div>
      </section>
      {data.pending.length ? (
        <section>
          <h2 className="text-lg font-bold text-foreground">Pendências</h2>
          <div className="mt-3 space-y-2">
            {data.pending.map((item, index) => (
              <a
                key={`${item.kind}-${index}`}
                href={item.href}
                className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm"
              >
                <Clock3 className="h-4 w-4 text-amber-600" />
                {item.title}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
