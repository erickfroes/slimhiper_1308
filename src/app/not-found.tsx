'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { SystemNotFound } from '@/components/ui';

export default function NotFound() {
  const router = useRouter();

  const handleGoHome = () => {
    router?.push('/');
  };

  const handleGoBack = () => {
    if (typeof window !== 'undefined') {
      window.history?.back();
    }
  };

  return <SystemNotFound onBack={handleGoBack} onHome={handleGoHome} />;
}
