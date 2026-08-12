'use client';

import { useEffect } from 'react';

export default function AuthInviteHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(search);
    const hashType = params.get('type');
    const isRecoveryHash = hashType === 'recovery';
    const isInviteHash =
      hashType === 'invite' || (hash.includes('access_token=') && !isRecoveryHash);
    const searchType = searchParams.get('type');
    const isRecoverySearch = searchType === 'recovery';
    const isInviteSearch =
      searchType === 'invite' || searchParams.has('code') || searchParams.has('token_hash');

    if (isRecoveryHash || isRecoverySearch) {
      window.location.replace(`/auth/reset-password${search}${hash}`);
    } else if (isInviteHash || isInviteSearch) {
      window.location.replace(`/auth/accept-invite${search}${hash}`);
    }
  }, []);

  return null;
}
