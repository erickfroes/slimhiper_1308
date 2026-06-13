'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type AdminRoleKind = 'owner' | 'admin' | 'support' | 'none';

export interface AdminPermissions {
  authenticated: boolean;
  platformRole: string | null;
  roleKind: AdminRoleKind;
  roleLabel: string;
  permissions: string[];
  canAccessAdmin: boolean;
  canMutatePlatform: boolean;
  canCreateTenant: boolean;
  canManageTenantUsers: boolean;
  canManageTenantConfig: boolean;
  canManageSupport: boolean;
  canManageBreakGlass: boolean;
  canReprocessWebhooks: boolean;
  canAcknowledgeIncidents: boolean;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

interface AppSessionResponse {
  authenticated?: boolean;
  platformRole?: string | null;
  permissions?: string[];
  canAccessPlatformAdmin?: boolean;
}

function normalizeRole(role: string | null | undefined) {
  return role?.trim().toLowerCase() ?? null;
}

function roleKindFromPlatformRole(role: string | null | undefined): AdminRoleKind {
  const normalized = normalizeRole(role);
  if (normalized === 'platform_owner') return 'owner';
  if (normalized === 'platform_admin') return 'admin';
  if (normalized === 'platform_support') return 'support';
  return 'none';
}

function roleLabelFromKind(kind: AdminRoleKind) {
  if (kind === 'owner') return 'Platform owner';
  if (kind === 'admin') return 'Platform admin';
  if (kind === 'support') return 'Platform support';
  return 'Sem acesso admin';
}

export function buildAdminPermissions(
  session: AppSessionResponse | null,
  state: { isLoading: boolean; error: string | null; reload: () => void }
): AdminPermissions {
  const roleKind = roleKindFromPlatformRole(session?.platformRole);
  const canMutatePlatform = roleKind === 'owner' || roleKind === 'admin';

  return {
    authenticated: session?.authenticated === true,
    platformRole: session?.platformRole ?? null,
    roleKind,
    roleLabel: roleLabelFromKind(roleKind),
    permissions: session?.permissions ?? [],
    canAccessAdmin: session?.canAccessPlatformAdmin === true,
    canMutatePlatform,
    canCreateTenant: canMutatePlatform,
    canManageTenantUsers: canMutatePlatform,
    canManageTenantConfig: canMutatePlatform,
    canManageSupport: canMutatePlatform,
    canManageBreakGlass: canMutatePlatform,
    canReprocessWebhooks: canMutatePlatform,
    canAcknowledgeIncidents: canMutatePlatform || roleKind === 'support',
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}

export function useAdminPermissions(): AdminPermissions {
  const [session, setSession] = useState<AppSessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(null);

    fetch('/api/auth/app-session', { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as AppSessionResponse | null;
        if (!response.ok || !body) throw new Error('admin_session_unavailable');
        return body;
      })
      .then((body) => {
        if (!mounted) return;
        setSession(body);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setError('Nao foi possivel confirmar a sessao administrativa.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [reloadToken]);

  return useMemo(
    () => buildAdminPermissions(session, { isLoading, error, reload }),
    [error, isLoading, reload, session]
  );
}

export function adminActionDisabledReason(
  permissions: Pick<AdminPermissions, 'isLoading' | 'canMutatePlatform' | 'roleLabel'>
) {
  if (permissions.isLoading) return 'Confirmando permissoes administrativas.';
  if (!permissions.canMutatePlatform) {
    return `${permissions.roleLabel} possui acesso de leitura nesta operacao.`;
  }
  return null;
}
