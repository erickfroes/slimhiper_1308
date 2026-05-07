// Mock API service layer for SlimHiper Clinic OS
// Backend integration point: replace each function body with Supabase/API calls

import type {
  Patient360Summary,
  PatientListRow,
  DashboardStats,
  WaitingQueueEntry,
  AppointmentSummary,
  DashboardAlert,
  PatientReviewItem,
  PatientDocument360Item,
} from '@/domain/types';

import {
  mockPatient360Juliana,
  mockPatientList,
  mockDashboardStats,
  mockWaitingQueue,
  mockTodayAppointments,
  mockDashboardAlerts,
  mockPatientsNeedingReview,
  mockDocuments360Juliana,
} from '@/data/mockData';

// Simulate async API delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  await delay(400);
  // TODO: replace with → supabase.from('dashboard_stats').select(...)
  return mockDashboardStats;
}

export async function getWaitingQueue(): Promise<WaitingQueueEntry[]> {
  await delay(350);
  // TODO: replace with → supabase.from('appointments').select(...).eq('date', today).in('status', activeStatuses)
  return mockWaitingQueue;
}

export async function getTodayAppointments(): Promise<AppointmentSummary[]> {
  await delay(400);
  // TODO: replace with → supabase.from('appointments').select(...).eq('date', today)
  return mockTodayAppointments;
}

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  await delay(300);
  // TODO: replace with → supabase.from('alerts').select(...).eq('is_resolved', false).order('severity')
  return mockDashboardAlerts;
}

export async function getPatientsNeedingReview(): Promise<PatientReviewItem[]> {
  await delay(300);
  // TODO: replace with → supabase.from('patients').select(...).filter('alert_count', 'gt', 0).order('alert_count', { ascending: false })
  return mockPatientsNeedingReview;
}

// ─── PATIENTS ─────────────────────────────────────────────────────────────────

export async function getPatientList(): Promise<PatientListRow[]> {
  await delay(500);
  // TODO: replace with → supabase.from('patients').select('*, active_package(*), alerts(count)')
  return mockPatientList;
}

export async function getPatient360(patientId: string): Promise<Patient360Summary | null> {
  await delay(600);
  // TODO: replace with → supabase.from('patients').select('*, packages(*), measurements(*), appointments(*), documents(*), prescriptions(*), nutrition_plans(*), financial(*), chat(*)').eq('id', patientId)
  if (patientId === 'patient-001' || patientId === 'juliana') {
    return mockPatient360Juliana;
  }
  // For demo, return Juliana for any patient ID
  return mockPatient360Juliana;
}

export async function getPatientDocuments360(patientId: string): Promise<PatientDocument360Item[]> {
  await delay(350);
  // TODO: replace with → supabase.from('patient_documents_360').select('*').eq('patient_id', patientId)
  void patientId;
  return mockDocuments360Juliana;
}