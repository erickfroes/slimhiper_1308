import {
  Activity,
  CheckCircle2,
  FileClock,
  FilePlus2,
  LayoutTemplate,
  Lock,
  Send,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import type React from 'react';

import DataState from '@/components/ui/DataState';
import type { ClinicDocumentAuditEvent } from '@/services/clinicDocumentsApi';

const iconByAction: Array<[RegExp, React.ElementType]> = [
  [/document\.generated/, FilePlus2],
  [/status_changed/, FileClock],
  [/signature_requested/, Send],
  [/signature_status_changed|d4sign|webhook|signed/i, ShieldCheck],
  [/released_to_patient/, Unlock],
  [/hidden_from_patient/, Lock],
  [/document_template/, LayoutTemplate],
];

function getAuditIcon(action: string) {
  return iconByAction.find(([pattern]) => pattern.test(action))?.[1] ?? Activity;
}

function getAuditTone(action: string) {
  if (/failed|error|hidden|archived|rejected|cancel/i.test(action)) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  if (/signature|pending|sent|viewed/i.test(action)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (/released|published|generated|signed|duplicated/i.test(action)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

export default function DocumentAuditTimeline({ events }: { events: ClinicDocumentAuditEvent[] }) {
  if (events.length === 0) {
    return (
      <DataState
        kind="empty"
        title="Auditoria vazia"
        description="Nenhum evento auditavel foi encontrado para este documento, assinatura ou template vinculado."
        className="min-h-32"
      />
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {events.map((event) => {
        const Icon = getAuditIcon(event.action);
        return (
          <li key={event.id} className="relative">
            <span className="absolute -left-[25px] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card">
              <Icon size={12} aria-hidden="true" />
            </span>
            <article className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{event.createdAt}</p>
                  {event.detail ? (
                    <p className="mt-1 break-words text-xs text-muted-foreground">{event.detail}</p>
                  ) : null}
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getAuditTone(event.action)}`}
                >
                  <CheckCircle2 size={12} aria-hidden="true" />
                  {event.scopeLabel ?? 'Auditoria'}
                </span>
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
