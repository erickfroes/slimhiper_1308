'use client';

import { useEffect } from 'react';

export default function AuthInviteHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(search);
    const isInviteHash = params.get('type') === 'invite' || hash.includes('access_token=');
    const searchType = searchParams.get('type');
    const isInviteSearch =
      searchType === 'invite' ||
      searchType === 'recovery' ||
      searchParams.has('code') ||
      searchParams.has('token_hash');

    if (isInviteHash || isInviteSearch) {
      window.location.replace(`/auth/accept-invite${search}${hash}`);
    }
  }, []);

  return null;
}
