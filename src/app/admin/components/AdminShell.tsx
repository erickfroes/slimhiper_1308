'use client';

import React, { useState } from 'react';
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
  RefreshCw,
  Shield,
  TrendingUp,
  User,
  Webhook,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

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
}: {
  activeSection: AdminShellSection;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-border bg-card sidebar-transition ${collapsed ? 'w-16' : 'w-56'}`}
    >
      <div
        className={`flex items-center border-b border-border py-4 ${collapsed ? 'justify-center px-2' : 'gap-2 px-4'}`}
      >
        <AppLogo size={28} />
        {!collapsed ? (
          <div className="flex flex-col leading-none">
            <span className="text-xs font-bold tracking-tight text-foreground">SlimHiper</span>
            <span className="text-xs font-semibold text-primary">Admin</span>
          </div>
        ) : null}
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
              className={`group relative flex w-full items-center rounded-xl transition-all ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
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
                <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition-opacity group-hover:opacity-100">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        {!collapsed ? (
          <div className="mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 hover:bg-muted">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <User size={12} className="text-primary" />
            </div>
            <div className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-xs font-semibold text-foreground">Platform Admin</span>
              <span className="text-xs text-muted-foreground">Operacoes</span>
            </div>
            <LogOut size={12} className="ml-auto text-muted-foreground" />
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
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
  mainClassName = 'flex-1 overflow-y-auto p-6 scrollbar-thin',
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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar
        activeSection={activeSection}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-3">
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
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <RefreshCw size={12} />
              {refreshLabel}
            </button>
          ) : null}
        </header>
        <main className={mainClassName}>
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
