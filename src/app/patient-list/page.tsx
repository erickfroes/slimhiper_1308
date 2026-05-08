import { redirect } from 'next/navigation';

export default function PatientListRedirectPage() {
  redirect('/clinic/patients');
}
