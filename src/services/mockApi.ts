// Mock API service layer for SlimHiper Clinic OS
// Backend integration point: replace each function body with Supabase/API calls

import type {
  Patient360Summary,
  PatientListRow,
  DashboardStats,
  WaitingQueueEntry,
  AppointmentSummary,
} from '@/domain/types';

import {
  mockPatient360Juliana,
  mockPatientList,
  mockDashboardStats,
  mockWaitingQueue,
  mockTodayAppointments,
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