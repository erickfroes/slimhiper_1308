'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Building2,
  ChevronRight,
  ClipboardList,
  HardDrive,
  Headphones,
  Link2,
  LineChart,
  LogOut,
  Menu,
  RefreshCw,
  Shield,
  TrendingUp,
  User,
  Webhook,
  X,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { redirectToLogin, signOutFromApp } from '@/lib/auth/clientLogout';
import { useAdminPermissions } from './adminPermissions';

export type AdminShellSection =
  | 'overview'
  | 'tenants'
  | 'financial'
  | 'usage'
  | 'storage'
  | 'integrations'
  | 'webhooks'
  | 'observability'
  | 'security'
  | 'support'
  | 'audit';

const navItems: Array<{
  key: AdminShellSection;
  label: string;
  href: string;
  icon: React.ElementType;
}> = [
  { key: 'overview', label: 'Visao Geral', href: '/admin', icon: Activity },
  { key: 'tenants', label: 'Tenants', href: '/admin/tenants', icon: Building2 },
  { key: 'financial', label: 'Financeiro', href: '/admin/billing', icon: TrendingUp },
  { key: 'usage', label: 'Uso e metricas', href: '/admin/usage', icon: Activity },
  { key: 'storage', label: 'Armazenamento', href: '/admin/storage', icon: HardDrive },
  { key: 'integrations', label: 'Integracoes', href: '/admin/integrations', icon: Link2 },
  { key: 'webhooks', label: 'Webhooks', href: '/admin/webhooks', icon: Webhook },
  { key: 'observability', label: 'Observabilidade', href: '/admin/observability', icon: LineChart },
  { key: 'security', label: 'Seguranca', href: '/admin/security', icon: Shield },
  { key: 'support', label: 'Suporte', href: '/admin/support', icon: Headphones },
  { key: 'audit', label: 'Auditoria', href: '/admin/audit', icon: ClipboardList },
];

function AdminSidebar({
  activeSection,
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
  onLogout,
  loggingOut,
}: {
  activeSection: AdminShellSection;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  return (
    <aside
      id="admin-sidebar"
      className={[
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-shrink-0 flex-col border-r border-border bg-card shadow-xl sidebar-transition lg:relative lg:z-auto lg:shadow-none',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        collapsed ? 'lg:w-16' : 'lg:w-56',
      ].join(' ')}
      aria-label="Navegacao administrativa"
    >
      <div
        className={`flex items-center border-b border-border py-4 ${collapsed ? 'lg:justify-center lg:px-2' : 'gap-2 px-4'}`}
      >
        <AppLogo size={28} />
        {!collapsed ? (
          <div className="flex flex-col leading-none">
            <span className="text-xs font-bold tracking-tight text-foreground">SlimHiper</span>
            <span className="text-xs font-semibold text-primary">Admin</span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onCloseMobile}
          className="btn-ghost ml-auto h-9 w-9 justify-center p-0 lg:hidden"
          aria-label="Fechar menu administrativo"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 scrollbar-thin">
        {navItems.map((item) => {
          const ItemIcon = item.icon;
          const active = item.key === activeSection;
          return (
            <Link
              key={item.key}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={onCloseMobile}
              className={`group relative flex w-full items-center rounded-xl transition-all ${
                collapsed ? 'lg:justify-center lg:px-0 gap-3 px-3 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
              }`}
            >
              <ItemIcon size={16} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
              {!collapsed ? (
                <span className={`text-xs ${active ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              ) : (
                <span className="text-xs font-medium lg:hidden">{item.label}</span>
              )}
              {collapsed ? (
                <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition-opacity group-hover:opacity-100 lg:block">
                  {item.label}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        {!collapsed ? (
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={
              loggingOut ? 'Saindo do admin pela barra lateral' : 'Sair do admin pela barra lateral'
            }
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <User size={12} className="text-primary" />
            </div>
            <div className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-xs font-semibold text-foreground">Platform Admin</span>
              <span className="text-xs text-muted-foreground">
                {loggingOut ? 'Saindo...' : 'Operacoes'}
              </span>
            </div>
            <LogOut size={12} className="ml-auto text-muted-foreground" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className="hidden w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground lg:flex"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <ChevronRight size={14} className={collapsed ? '' : 'rotate-180'} />
          {!collapsed ? 'Recolher' : null}
        </button>
      </div>
    </aside>
  );
}

export default function AdminShell({
  activeSection,
  title,
  description,
  breadcrumbs,
  onRefresh,
  refreshLabel = 'Atualizar',
  children,
  mainClassName = 'flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin',
}: {
  activeSection: AdminShellSection;
  title?: string;
  description?: string;
  breadcrumbs?: React.ReactNode;
  onRefresh?: () => void;
  refreshLabel?: string;
  children: React.ReactNode;
  mainClassName?: string;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const adminPermissions = useAdminPermissions();

  async function handleLogout() {
    setLoggingOut(true);
    await signOutFromApp();
    redirectToLogin();
  }

  useEffect(() => {
    if (!mobileOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary focus:shadow"
      >
        Pular para conteudo administrativo
      </a>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
          aria-label="Fechar menu administrativo"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <AdminSidebar
        activeSection={activeSection}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={() => void handleLogout()}
        loggingOut={loggingOut}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="btn-ghost h-9 w-9 justify-center p-0 lg:hidden"
            aria-controls="admin-sidebar"
            aria-expanded={mobileOpen}
            aria-label="Abrir menu administrativo"
          >
            <Menu size={16} aria-hidden="true" />
          </button>
          {breadcrumbs ?? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link href="/admin" className="hover:text-primary">
                Admin
              </Link>
              {title ? (
                <>
                  <ChevronRight size={12} />
                  <span className="font-medium text-foreground">{title}</span>
                </>
              ) : null}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span
              className={[
                'hidden rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex',
                adminPermissions.roleKind === 'support'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : adminPermissions.canMutatePlatform
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-100 text-slate-600',
              ].join(' ')}
              title={
                adminPermissions.error ??
                (adminPermissions.canMutatePlatform
                  ? 'Acoes administrativas liberadas para este papel.'
                  : 'Acoes sensiveis ficam bloqueadas para este papel.')
              }
            >
              {adminPermissions.isLoading ? 'Validando papel' : adminPermissions.roleLabel}
            </span>
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              >
                <RefreshCw size={12} aria-hidden="true" />
                {refreshLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={loggingOut ? 'Saindo do admin' : 'Sair do admin'}
            >
              <LogOut size={12} aria-hidden="true" />
              {loggingOut ? 'Saindo...' : 'Sair'}
            </button>
          </div>
        </header>
        <main id="admin-main" className={mainClassName} tabIndex={-1}>
          {title || description ? (
            <div className="mb-6">
              {title ? <h1 className="text-xl font-bold text-foreground">{title}</h1> : null}
              {description ? (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
