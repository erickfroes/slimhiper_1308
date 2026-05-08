import type {
  Patient360Summary,
  PatientTimelineEvent,
  TimelineEventCategory,
  TimelineEventType,
} from '@/domain/types';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { getPatient360 } from '@/services/mockApi';

export interface PatientTimelineFilters {
  category?: TimelineEventCategory;
  types?: TimelineEventType[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function normalizeTimelineEvent(event: unknown): PatientTimelineEvent | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as Record<string, unknown>;

  if (
    typeof record.id !== 'string' ||
    typeof record.patientId !== 'string' ||
    typeof record.type !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.description !== 'string' ||
    typeof record.date !== 'string'
  ) {
    return null;
  }

  return {
    id: record.id,
    patientId: record.patientId,
    type: record.type as TimelineEventType,
    title: record.title,
    description: record.description,
    date: record.date,
    professional: typeof record.professional === 'string' ? record.professional : undefined,
    metadata:
      record.metadata && typeof record.metadata === 'object'
        ? (record.metadata as Record<string, string | number | boolean>)
        : undefined,
    category: typeof record.category === 'string' ? (record.category as TimelineEventCategory) : undefined,
    actorName: typeof record.actorName === 'string' ? record.actorName : undefined,
    statusLabel: typeof record.statusLabel === 'string' ? record.statusLabel : undefined,
    actionLabel: typeof record.actionLabel === 'string' ? record.actionLabel : undefined,
    detailsHref: typeof record.detailsHref === 'string' ? record.detailsHref : undefined,
  };
}

function normalizeSummary(payload: unknown): Patient360Summary {
  return payload as Patient360Summary;
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) {
    return { message: fallback, details: error.message };
  }
  return { message: fallback };
}

async function getSupabaseClient() {
  if (typeof window === 'undefined') {
    return createServerSupabaseClient();
  }
  return createBrowserSupabaseClient();
}

function applyTimelineFilters(events: PatientTimelineEvent[], filters?: PatientTimelineFilters): PatientTimelineEvent[] {
  if (!filters) return events;

  return events
    .filter((event) => (filters.category ? event.category === filters.category : true))
    .filter((event) => (filters.types?.length ? filters.types.includes(event.type) : true))
    .filter((event) => (filters.fromDate ? new Date(event.date) >= new Date(filters.fromDate) : true))
    .filter((event) => (filters.toDate ? new Date(event.date) <= new Date(filters.toDate) : true))
    .slice(0, filters.limit ?? events.length);
}

export async function getPatient360Summary(patientId: string): Promise<{ data: Patient360Summary | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) {
      const summary = await getPatient360(patientId);
      return { data: summary, error: null };
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('patient-360-summary', {
      body: { patientId },
    });

    if (error) {
      return { data: null, error: { message: 'Failed to fetch patient summary.', code: error.name, details: error.message } };
    }

    return { data: normalizeSummary(data), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to load patient summary right now.') };
  }
}

export async function getPatientTimeline(
  patientId: string,
  filters?: PatientTimelineFilters,
): Promise<{ data: PatientTimelineEvent[]; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) {
      const summary = await getPatient360(patientId);
      const events = summary?.recentTimeline ?? [];
      return { data: applyTimelineFilters(events, filters), error: null };
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('patient-timeline', {
      body: { patientId, filters: filters ?? {} },
    });

    if (error) {
      return { data: [], error: { message: 'Failed to fetch patient timeline.', code: error.name, details: error.message } };
    }

    const list = Array.isArray(data) ? data : (data?.events as unknown[] | undefined) ?? [];
    const normalized = list.map(normalizeTimelineEvent).filter((item): item is PatientTimelineEvent => Boolean(item));

    return { data: applyTimelineFilters(normalized, filters), error: null };
  } catch (error) {
    return { data: [], error: safeError(error, 'Unable to load patient timeline right now.') };
  }
}
