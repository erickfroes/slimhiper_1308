'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Download,
  FilePlus2,
  FileText,
  LayoutTemplate,
  Lock,
  PenSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import {
  generateClinicDocument,
  getClinicDocumentSignedUrl,
  getClinicDocumentsWorkspace,
  requestClinicDocumentSignature,
  setClinicDocumentPatientRelease,
  type ClinicDocumentRow,
  type ClinicDocumentsWorkspace,
} from '@/services/clinicDocumentsApi';
import { asSafeDocumentUrl } from '@/lib/safeExternalUrl';
import DataState from '@/components/ui/DataState';

function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  const classes =
    normalized.includes('sign') || normalized.includes('pending')
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : normalized.includes('signed')
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : normalized.includes('fail') ||
            normalized.includes('expired') ||
            normalized.includes('cancel')
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-blue-50 text-blue-700 border-blue-200';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}

function signatureBadge(signature: string) {
  const classes =
    signature === 'assinado'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : signature === 'pendente'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : signature === 'falhou' || signature === 'recusado' || signature === 'expirado'
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}>
      {signature}
    </span>
  );
}

function releaseBadge(released: boolean) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
        released
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-100 text-slate-600'
      }`}
    >
      {released ? 'liberado' : 'restrito'}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <article className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon size={16} />
        <p>{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground tabular-nums">{value}</p>
    </article>
  );
}

export default function ClinicDocumentsContent() {
  const [workspace, setWorkspace] = useState<ClinicDocumentsWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getClinicDocumentsWorkspace();
    setWorkspace(result.data);
    setError(result.error?.message ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const availableTemplates = useMemo(
    () => workspace?.templates.filter((template) => template.status === 'active') ?? [],
    [workspace?.templates]
  );

  useEffect(() => {
    if (!workspace) return;
    setSelectedPatientId((current) => current || workspace.patients[0]?.id || '');
    setSelectedTemplateId((current) =>
      availableTemplates.some((template) => template.id === current)
        ? current
        : availableTemplates[0]?.id || ''
    );
  }, [availableTemplates, workspace]);

  const selectedTemplate = useMemo(
    () => availableTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [availableTemplates, selectedTemplateId]
  );

  useEffect(() => {
    const allowed = selectedTemplate?.allowedVariables ?? [];
    setVariables(
      (current) =>
        Object.fromEntries(allowed.map((key) => [key, current[key] ?? ''])) as Record<
          string,
          string
        >
    );
  }, [selectedTemplate]);

  async function handleGenerateDocument() {
    if (!selectedPatientId || !selectedTemplateId) {
      setActionError('Selecione paciente e template para gerar o documento.');
      return;
    }

    setBusyAction('generate');
    setActionError(null);
    setActionMessage(null);
    const result = await generateClinicDocument(selectedPatientId, selectedTemplateId, variables);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel gerar o documento.');
      return;
    }

    setActionMessage('Documento gerado com sucesso.');
    await loadWorkspace();
  }

  async function handleSignature(document: ClinicDocumentRow) {
    setBusyAction(`sign-${document.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await requestClinicDocumentSignature(document.id, document.patientId);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel enviar para assinatura.');
      return;
    }

    setActionMessage('Documento enviado para assinatura.');
    await loadWorkspace();
  }

  async function handlePatientRelease(document: ClinicDocumentRow) {
    setBusyAction(`release-${document.id}`);
    setActionError(null);
    setActionMessage(null);
    const releasedToPatient = !document.releasedToPatient;
    const result = await setClinicDocumentPatientRelease(
      document.id,
      document.patientId,
      releasedToPatient
    );
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel atualizar liberacao.');
      return;
    }

    setActionMessage(
      releasedToPatient
        ? 'Documento liberado para paciente/guardian.'
        : 'Documento removido do acesso paciente/guardian.'
    );
    await loadWorkspace();
  }

  async function handleDownload(document: ClinicDocumentRow) {
    setBusyAction(`download-${document.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await getClinicDocumentSignedUrl(document.id, document.patientId);
    setBusyAction(null);

    if (result.error || !result.data?.url) {
      setActionError(result.error?.message ?? 'Nao foi possivel gerar link temporario.');
      return;
    }

    const safeUrl = asSafeDocumentUrl(result.data.url);
    if (!safeUrl) {
      setActionError('O link gerado nao passou na validacao de seguranca.');
      return;
    }

    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    setActionMessage('Link temporario gerado.');
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <section className="bg-card border border-border rounded-2xl p-5 lg:p-6">
          <h1 className="text-2xl font-bold text-foreground">Documentos da Clinica</h1>
        </section>
        <section className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground">
          Carregando documentos, templates e assinaturas...
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <section className="bg-card border border-border rounded-2xl p-5 lg:p-6">
          <h1 className="text-2xl font-bold text-foreground">Documentos da Clinica</h1>
        </section>
        <section
          role="alert"
          className="bg-card border border-red-200 rounded-2xl p-5 text-sm text-red-700"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Documentos indisponiveis</p>
              <p className="mt-1 text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => void loadWorkspace()}
                className="btn-secondary mt-4 text-xs"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const data = workspace;
  if (!data) return null;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <section className="bg-card border border-border rounded-2xl p-5 lg:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Documentos da Clinica</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Templates, documentos emitidos, assinatura D4Sign e monitor operacional.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadWorkspace()}
            className="btn-secondary text-xs"
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard icon={LayoutTemplate} label="Templates ativos" value={data.metrics.templates} />
        <MetricCard icon={FileText} label="Documentos gerados" value={data.metrics.generated} />
        <MetricCard
          icon={Send}
          label="Pendentes assinatura"
          value={data.metrics.pendingSignature}
        />
        <MetricCard icon={ShieldCheck} label="Assinados" value={data.metrics.signed} />
        <MetricCard icon={AlertTriangle} label="Falhas" value={data.metrics.failed} />
      </section>

      {(actionMessage || actionError) && (
        <section
          role="status"
          className={`rounded-2xl border px-4 py-3 text-sm ${
            actionError
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {actionError ?? actionMessage}
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(320px,420px)_1fr] gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Gerar documento</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Variaveis clinicas protegidas sao preenchidas pela Edge Function.
            </p>
          </div>

          <label className="block text-xs font-medium text-muted-foreground">
            Paciente
            <select
              value={selectedPatientId}
              onChange={(event) => setSelectedPatientId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              <option value="">Selecione</option>
              {data.patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-muted-foreground">
            Template
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              <option value="">Selecione</option>
              {availableTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          {selectedTemplate?.allowedVariables.length ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Variaveis permitidas</p>
              {selectedTemplate.allowedVariables.map((key) => (
                <label key={key} className="block text-xs font-medium text-muted-foreground">
                  {key}
                  <input
                    value={variables[key] ?? ''}
                    onChange={(event) =>
                      setVariables((current) => ({ ...current, [key]: event.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                    maxLength={160}
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Este template usa apenas variaveis protegidas do sistema.
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleGenerateDocument()}
            disabled={busyAction === 'generate' || !selectedPatientId || !selectedTemplateId}
            className="btn-primary w-full text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FilePlus2 size={16} />
            {busyAction === 'generate' ? 'Gerando...' : 'Gerar documento'}
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Documentos emitidos</h2>
            <span className="text-xs text-muted-foreground">{data.documents.length} registros</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1060px] w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  {[
                    'Documento',
                    'Paciente',
                    'Tipo',
                    'Status',
                    'Assinatura',
                    'D4Sign',
                    'Portal',
                    'Atualizado',
                    'Acoes',
                  ].map((header) => (
                    <th key={header} scope="col" className="px-4 py-3 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.documents.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6">
                      <DataState
                        kind="empty"
                        title="Nenhum documento gerado"
                        description="Gere um documento para o tenant ativo usando o painel lateral."
                        className="min-h-40 border-0 bg-transparent"
                      />
                    </td>
                  </tr>
                ) : (
                  data.documents.map((document) => (
                    <tr key={document.id} className="border-t border-border hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{document.name}</p>
                        <p className="text-xs text-muted-foreground">{document.id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/clinic/patients/${document.patientId}`}
                          className="text-foreground hover:underline"
                        >
                          {document.patientName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-foreground">{document.category}</td>
                      <td className="px-4 py-3">{statusBadge(document.status)}</td>
                      <td className="px-4 py-3">{signatureBadge(document.signatureStatus)}</td>
                      <td className="px-4 py-3">
                        {document.d4signEnabled ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            habilitado
                          </span>
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            desabilitado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{releaseBadge(document.releasedToPatient)}</td>
                      <td className="px-4 py-3 text-foreground">{document.updatedAt}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDownload(document)}
                            disabled={busyAction === `download-${document.id}`}
                            className="btn-secondary text-xs"
                          >
                            <Download size={13} />
                            Link
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePatientRelease(document)}
                            disabled={busyAction === `release-${document.id}`}
                            className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {document.releasedToPatient ? <Lock size={13} /> : <Unlock size={13} />}
                            {document.releasedToPatient ? 'Ocultar' : 'Liberar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSignature(document)}
                            disabled={
                              !document.canRequestSignature || busyAction === `sign-${document.id}`
                            }
                            title={
                              document.canRequestSignature
                                ? undefined
                                : document.d4signEnabled
                                  ? 'Assinatura indisponivel neste status'
                                  : 'Template sem D4Sign habilitado'
                            }
                            className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <PenSquare size={13} />
                            Assinar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Activity size={16} /> Monitor operacional de documentos
        </h2>
        <div className="mt-4 space-y-2">
          {data.monitorEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum documento pendente/falhado ou evento D4Sign recente.
            </p>
          ) : (
            data.monitorEvents.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{event.createdAt}</p>
                  {event.error && <p className="mt-1 text-xs text-red-600">{event.error}</p>}
                </div>
                {statusBadge(event.status)}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
