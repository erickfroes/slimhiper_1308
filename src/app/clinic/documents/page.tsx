import React from 'react';
import Link from 'next/link';
import {
  FileText,
  LayoutTemplate,
  FilePlus2,
  PenSquare,
  Send,
  Download,
  UserRound,
  FolderKanban,
  Activity,
  ExternalLink,
} from 'lucide-react';

import DashboardShell from '@/components/DashboardShell';

type SignatureStatus = 'Pendente' | 'Assinado' | 'Dispensado';
type DocumentStatus = 'Template' | 'Gerado' | 'Pendente assinatura' | 'Assinado';

interface ClinicDocumentRow {
  id: string;
  documento: string;
  paciente: string;
  patientId?: string;
  tipo: string;
  status: DocumentStatus;
  assinatura: SignatureStatus;
  emitidoEm: string;
  ultimoAcesso: string;
  responsavel: string;
}

const clinicDocuments: ClinicDocumentRow[] = [
  {
    id: 'DOC-1209',
    documento: 'Termo de Consentimento Nutricional',
    paciente: 'Ana Pereira',
    patientId: 'patient-005',
    tipo: 'Consentimento',
    status: 'Pendente assinatura',
    assinatura: 'Pendente',
    emitidoEm: '2026-05-06 10:12',
    ultimoAcesso: '2026-05-08 08:40',
    responsavel: 'Dra. Marina Costa',
  },
  {
    id: 'DOC-1182',
    documento: 'Plano Terapêutico Integrado',
    paciente: 'Carlos Souza',
    patientId: 'patient-004',
    tipo: 'Plano de cuidado',
    status: 'Gerado',
    assinatura: 'Dispensado',
    emitidoEm: '2026-05-05 16:34',
    ultimoAcesso: '2026-05-07 19:15',
    responsavel: 'Dr. João Mendes',
  },
  {
    id: 'DOC-1150',
    documento: 'Contrato de Programa Metabólico',
    paciente: 'Juliana Ramos',
    patientId: 'patient-001',
    tipo: 'Contrato',
    status: 'Assinado',
    assinatura: 'Assinado',
    emitidoEm: '2026-05-03 09:02',
    ultimoAcesso: '2026-05-08 07:58',
    responsavel: 'Equipe Comercial',
  },
  {
    id: 'DOC-TPL-044',
    documento: 'Template • Declaração de Comparecimento',
    paciente: '—',
    tipo: 'Template',
    status: 'Template',
    assinatura: 'Dispensado',
    emitidoEm: '2026-04-28 14:10',
    ultimoAcesso: '2026-05-04 11:24',
    responsavel: 'Secretaria Clínica',
  },
];

const d4signPlaceholders = [
  { when: '2026-05-08 08:20', event: 'envelope.created (placeholder)', ref: 'DOC-1209' },
  { when: '2026-05-08 08:22', event: 'recipient.notified (placeholder)', ref: 'DOC-1209' },
  { when: '2026-05-07 17:05', event: 'signature.completed (placeholder)', ref: 'DOC-1150' },
];

function statusBadge(status: DocumentStatus) {
  const classes: Record<DocumentStatus, string> = {
    Template: 'bg-violet-50 text-violet-700 border-violet-200',
    Gerado: 'bg-blue-50 text-blue-700 border-blue-200',
    'Pendente assinatura': 'bg-amber-50 text-amber-700 border-amber-200',
    Assinado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${classes[status]}`}>
      {status}
    </span>
  );
}

function signatureBadge(signature: SignatureStatus) {
  const classes: Record<SignatureStatus, string> = {
    Pendente: 'bg-amber-50 text-amber-700 border-amber-200',
    Assinado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Dispensado: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${classes[signature]}`}>
      {signature}
    </span>
  );
}

function DocumentsContent() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Documentos da Clínica</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Workspace clínico central para templates, documentos emitidos, assinaturas e
            rastreabilidade auditável.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'Criar template', icon: LayoutTemplate },
            { label: 'Gerar documento', icon: FilePlus2 },
            { label: 'Enviar para assinatura', icon: PenSquare },
          ].map((action) => (
            <button
              key={action.label}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
            >
              <action.icon size={14} />
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {[
          { icon: LayoutTemplate, title: 'Templates', value: '18' },
          { icon: FileText, title: 'Documentos gerados', value: '146' },
          { icon: Send, title: 'Pendentes assinatura', value: '12' },
          { icon: Download, title: 'Assinados', value: '98' },
          { icon: UserRound, title: 'Por paciente', value: 'Visão agrupada' },
          { icon: FolderKanban, title: 'Por programa', value: 'Visão agrupada' },
        ].map((item) => (
          <div key={item.title} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <item.icon size={14} /> {item.title}
            </div>
            <div className="text-lg font-semibold text-foreground mt-2">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Workspace de documentos (clínica inteira)
          </h2>
          <span className="text-xs text-muted-foreground">
            Links sempre via placeholder de link temporário auditado
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {[
                  'Documento',
                  'Paciente',
                  'Tipo',
                  'Status',
                  'Assinatura',
                  'Emitido em',
                  'Último acesso',
                  'Responsável',
                  'Ações',
                ].map((header) => (
                  <th key={header} className="px-4 py-3 text-left font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clinicDocuments.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.documento}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.id} · link temporário auditado
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {row.patientId ? (
                      <Link href={`/clinic/patients/${row.patientId}`} className="hover:underline">
                        {row.paciente}
                      </Link>
                    ) : (
                      row.paciente
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">{row.tipo}</td>
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  <td className="px-4 py-3">{signatureBadge(row.assinatura)}</td>
                  <td className="px-4 py-3 text-foreground">{row.emitidoEm}</td>
                  <td className="px-4 py-3 text-foreground">{row.ultimoAcesso}</td>
                  <td className="px-4 py-3 text-foreground">{row.responsavel}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['Reenviar', 'Baixar assinado'].map((action) => (
                        <button
                          key={action}
                          className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted"
                        >
                          {action}
                        </button>
                      ))}
                      {row.patientId && (
                        <Link
                          href={`/clinic/patients/${row.patientId}`}
                          className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted"
                        >
                          Ver Paciente 360
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity size={14} /> Eventos recentes D4Sign (placeholder)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Integração externa ainda não acionada; sem chamadas reais para D4Sign nesta tela.
        </p>
        <div className="mt-3 space-y-2">
          {d4signPlaceholders.map((event) => (
            <div
              key={`${event.when}-${event.ref}`}
              className="flex items-center justify-between text-xs border border-border rounded-xl px-3 py-2"
            >
              <span className="text-foreground">
                {event.when} · {event.event}
              </span>
              <span className="text-muted-foreground inline-flex items-center gap-1">
                {event.ref} <ExternalLink size={12} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ClinicDocumentsPage() {
  return (
    <DashboardShell>
      <DocumentsContent />
    </DashboardShell>
  );
}
