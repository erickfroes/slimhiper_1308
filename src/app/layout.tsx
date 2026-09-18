import React from 'react';
import { connection } from 'next/server';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import { visualAssets } from '@/lib/visualAssets';
import '../styles/tailwind.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'SlimHiper Clinic OS — Gestão Clínica de Transformação Corporal',
  description:
    'Sistema operacional completo para clínicas de transformação corporal — gerencie pacientes, programas, agenda e financeiro em um único painel.',
  icons: {
    icon: [{ url: visualAssets.brandAppIcon, type: 'image/png' }],
    shortcut: [visualAssets.brandAppIcon],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Per-request CSP nonces cannot be reused from static HTML or CDN caches.
  await connection();
  return (
    <html lang="pt-BR" className={plusJakartaSans.variable}>
      <body className={plusJakartaSans.className}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-plus-jakarta-sans)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
            },
          }}
        />
      </body>
    </html>
  );
}
