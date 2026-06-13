'use client';

import { useEffect } from 'react';

export default function AuthInviteHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const isInviteHash = params.get('type') === 'invite' || hash.includes('access_token=');
    const isInviteSearch = new URLSearchParams(search).get('type') === 'invite';

    if (isInviteHash || isInviteSearch) {
      window.location.replace(`/auth/accept-invite${search}${hash}`);
    }
  }, []);

  return null;
}
