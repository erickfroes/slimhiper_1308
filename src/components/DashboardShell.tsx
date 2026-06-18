'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { redirectToLogin, signOutFromApp } from '@/lib/auth/clientLogout';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  BookOpen,
  FileText,
  CreditCard,
  Settings,
  BarChart3,
  Inbox,
  TrendingUp,
  PackageSearch,
  ChevronLeft,
  ChevronRight,
  Bell,
  AlertTriangle,
  Check,
  Search,
  LogOut,
  User,
  MessageSquare,
  UsersRound,
} from 'lucide-react';
import {
  getCommunicationsSummary,
  markNotificationRead,
  markThreadRead,
  type CommunicationsSummary,
} from '@/services/notificationsApi';
import {
  isClinicPathAllowed,
  normalizePlanEntitlements,
  type PlanEntitlements,
} from '@/services/planEntitlements';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ElementType;
}

interface AppSessionAccessPayload {
  user?: {
    id?: string;
    email?: string | null;
    fullName?: string | null;
    platformRole?: string | null;
  } | null;
  activeTenantMembership?: {
    roleCode?: string | null;
    legacyRole?: string | null;
    roleKey?: string | null;
    status?: string | null;
  } | null;
  permissions?: string[];
  planEntitlements?: PlanEntitlements;
}

const clinicNavItems: NavItem[] = [
  { key: 'nav-dashboard', label: 'Dashboard', href: '/clinic/dashboard', icon: LayoutDashboard },
  { key: 'nav-pacientes', label: 'Pacientes', href: '/clinic/patients', icon: Users },
  { key: 'nav-agenda', label: 'Agenda', href: '/clinic/agenda', icon: CalendarDays },
  { key: 'nav-crm', label: 'CRM', href: '/clinic/crm', icon: TrendingUp },
  { key: 'nav-inventory', label: 'Estoque', href: '/clinic/inventory', icon: PackageSearch },
  { key: 'nav-programas', label: 'Programas', href: '/clinic/programs', icon: BookOpen },
  {
    key: 'nav-comunidade',
    label: 'Comunidade',
    href: '/clinic/community',
    icon: UsersRound,
  },
  {
    key: 'nav-documentos',
    label: 'Documentos',
    href: '/clinic/documents',
    icon: FileText,
  },
  {
    key: 'nav-financeiro',
    label: 'Financeiro',
    href: '/clinic/financeiro',
    icon: CreditCard,
  },
  {
    key: 'nav-relatorios',
    label: 'Relatórios',
    href: '/clinic/reports',
    icon: BarChart3,
  },
  {
    key: 'nav-inbox',
    label: 'Inbox',
    href: '/clinic/inbox',
    icon: Inbox,
  },
  { key: 'nav-configuracoes', label: 'Configurações', href: '/clinic/settings', icon: Settings },
];

interface DashboardShellProps {
  children: React.ReactNode;
}

function formatBadgeCount(count: number) {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

function formatRelativeTimestamp(value: string) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return 'Agora';
  if (diffMinutes < 60) return `${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatRoleLabel(value: string | null | undefined) {
  const normalized = value?.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return 'Minha conta';
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [summary, setSummary] = useState<CommunicationsSummary | null>(null);
  const [communicationsLoading, setCommunicationsLoading] = useState(true);
  const [communicationsError, setCommunicationsError] = useState<string | null>(null);
  const [sessionAccess, setSessionAccess] = useState<AppSessionAccessPayload | null>(null);
  const [openMenu, setOpenMenu] = useState<'messages' | 'notifications' | null>(null);
  const topbarMenuRef = useRef<HTMLDivElement | null>(null);
  const messagesButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);
  const messagesPanelRef = useRef<HTMLDivElement | null>(null);
  const notificationsPanelRef = useRef<HTMLDivElement | null>(null);
  const communicationsRequestIdRef = useRef(0);
  const cachedSummaryRef = useRef<CommunicationsSummary | null>(null);
  const messagesPanelId = useId();
  const notificationsPanelId = useId();
  const messagesPanelTitleId = useId();
  const notificationsPanelTitleId = useId();
  const pathname = usePathname();
  const router = useRouter();

  const totalUnreadMessages = summary?.unreadMessages ?? 0;
  const totalUnreadNotifications = summary?.unreadNotifications ?? 0;
  const formattedUnreadMessages = formatBadgeCount(totalUnreadMessages);
  const formattedUnreadNotifications = formatBadgeCount(totalUnreadNotifications);
  const topMessages = useMemo(() => summary?.messages ?? [], [summary]);
  const topNotifications = useMemo(() => summary?.notifications ?? [], [summary]);
  const visibleNavItems = useMemo(() => {
    if (!sessionAccess) return clinicNavItems;
    const entitlements = normalizePlanEntitlements(sessionAccess.planEntitlements);
    return clinicNavItems.filter((item) =>
      isClinicPathAllowed(item.href, entitlements, sessionAccess.permissions ?? [])
    );
  }, [sessionAccess]);
  const userDisplayName =
    sessionAccess?.user?.fullName?.trim() || sessionAccess?.user?.email?.trim() || 'Minha conta';
  const userRoleLabel = formatRoleLabel(
    sessionAccess?.activeTenantMembership?.roleKey ??
      sessionAccess?.activeTenantMembership?.roleCode ??
      sessionAccess?.activeTenantMembership?.legacyRole ??
      sessionAccess?.user?.platformRole
  );

  useEffect(() => {
    let mounted = true;

    async function loadSessionAccess() {
      try {
        const response = await fetch('/api/auth/app-session');
        const payload = (await response.json().catch(() => null)) as AppSessionAccessPayload | null;
        if (mounted && response.ok) setSessionAccess(payload);
      } catch {
        if (mounted) setSessionAccess(null);
      }
    }

    void loadSessionAccess();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSummary({ background = false }: { background?: boolean } = {}) {
      const requestId = communicationsRequestIdRef.current + 1;
      communicationsRequestIdRef.current = requestId;

      if (!background && cachedSummaryRef.current === null) {
        setCommunicationsLoading(true);
      }

      try {
        const result = await getCommunicationsSummary();
        if (!mounted || communicationsRequestIdRef.current !== requestId) return;

        if (result.error) {
          setCommunicationsError(
            cachedSummaryRef.current
              ? 'Comunicações temporariamente indisponíveis. Último resumo mantido.'
              : 'Não foi possível carregar inbox e notificações.'
          );
        } else {
          setCommunicationsError(null);
          cachedSummaryRef.current = result.data;
          setSummary(result.data);
        }
      } catch {
        if (!mounted || communicationsRequestIdRef.current !== requestId) return;
        setCommunicationsError(
          cachedSummaryRef.current
            ? 'Comunicações temporariamente indisponíveis. Último resumo mantido.'
            : 'Comunicações temporariamente indisponíveis.'
        );
      } finally {
        if (mounted && communicationsRequestIdRef.current === requestId) {
          setCommunicationsLoading(false);
        }
      }
    }

    void loadSummary();
    const interval = window.setInterval(() => void loadSummary({ background: true }), 60000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!topbarMenuRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        const previousMenu = openMenu;
        setOpenMenu(null);
        if (previousMenu === 'messages') messagesButtonRef.current?.focus();
        if (previousMenu === 'notifications') notificationsButtonRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openMenu]);

  useEffect(() => {
    const panel =
      openMenu === 'messages'
        ? messagesPanelRef.current
        : openMenu === 'notifications'
          ? notificationsPanelRef.current
          : null;
    if (!panel) return;

    const focusTarget = panel.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    window.requestAnimationFrame(() => focusTarget?.focus());
  }, [openMenu]);

  const isActive = (href: string) => {
    if (href === '/clinic/dashboard') return pathname === '/clinic/dashboard' || pathname === '/';
    return pathname.startsWith(href);
  };

  async function handleLogout() {
    await signOutFromApp();
    redirectToLogin();
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = patientSearch.trim();
    router.push(
      query ? `/clinic/patients?search=${encodeURIComponent(query)}` : '/clinic/patients'
    );
  }

  async function handleMarkThreadRead(threadId: string) {
    try {
      const result = await markThreadRead(threadId);
      if (result.data) {
        cachedSummaryRef.current = result.data;
        setSummary(result.data);
        setCommunicationsError(null);
      }
      if (result.error) setCommunicationsError('Não foi possível atualizar a conversa.');
    } catch {
      setCommunicationsError('Não foi possível atualizar a conversa.');
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    try {
      const result = await markNotificationRead(notificationId);
      if (result.data) {
        cachedSummaryRef.current = result.data;
        setSummary(result.data);
        setCommunicationsError(null);
      }
      if (result.error) setCommunicationsError('Não foi possível atualizar a notificação.');
    } catch {
      setCommunicationsError('Não foi possível atualizar a notificação.');
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'flex flex-col bg-card border-r border-border sidebar-transition z-50 flex-shrink-0',
          collapsed ? 'w-64 lg:w-16' : 'w-64',
          'fixed lg:relative h-full',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Logo */}
        <div
          className={[
            'flex items-center border-b border-border flex-shrink-0',
            collapsed ? 'gap-2 px-4 py-4 lg:justify-center lg:px-0' : 'gap-2 px-4 py-4',
          ].join(' ')}
        >
          <div className="flex items-center gap-2">
            <AppLogo size={32} />
            {(!collapsed || mobileOpen) && (
              <div className="flex flex-col leading-none lg:hidden">
                <span className="font-bold text-sm text-foreground tracking-tight">SlimHiper</span>
                <span className="text-xs text-muted-foreground font-medium">Clinic OS</span>
              </div>
            )}
            {!collapsed && !mobileOpen && (
              <div className="hidden flex-col leading-none lg:flex">
                <span className="font-bold text-sm text-foreground tracking-tight">SlimHiper</span>
                <span className="text-xs text-muted-foreground font-medium">Clinic OS</span>
              </div>
            )}
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-0.5">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
                className={[
                  'relative flex items-center rounded-xl transition-all duration-150 group',
                  collapsed
                    ? 'gap-3 px-3 py-2.5 lg:mx-0 lg:justify-center lg:px-0'
                    : 'gap-3 px-3 py-2.5',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                ].join(' ')}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
                {(!collapsed || mobileOpen) && (
                  <span className={['text-sm', active ? 'font-semibold' : 'font-medium'].join(' ')}>
                    {item.label}
                  </span>
                )}
                {/* Tooltip for collapsed */}
                {collapsed && (
                  <span className="absolute left-full ml-2 hidden px-2 py-1 bg-foreground text-background text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 lg:block">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: user + collapse toggle */}
        <div className="border-t border-border p-2 flex-shrink-0">
          {(!collapsed || mobileOpen) && (
            <div className="mb-1 flex items-center gap-1">
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title="Abrir perfil"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-primary" />
                </div>
                <div className="flex min-w-0 flex-col leading-none">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {userDisplayName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{userRoleLabel}</span>
                </div>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Sair da conta"
                title="Sair"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden items-center justify-center w-full py-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150 lg:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? (
              <ChevronRight size={16} />
            ) : (
              <span className="flex items-center gap-2 text-xs font-medium">
                <ChevronLeft size={16} />
                Recolher
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="app-topbar flex-shrink-0">
          <button
            type="button"
            className="lg:hidden btn-ghost p-2"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu da clínica"
            aria-expanded={mobileOpen}
          >
            <LayoutDashboard size={18} aria-hidden="true" />
          </button>

          {/* Search */}
          <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={patientSearch}
              onChange={(event) => setPatientSearch(event.target.value)}
              placeholder="Buscar pacientes..."
              aria-label="Buscar pacientes"
              className="input-base py-1.5 pl-9 pr-10 text-sm"
            />
            <button
              type="submit"
              className="btn-ghost absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
              aria-label="Executar busca de pacientes"
            >
              <Search size={14} aria-hidden="true" />
            </button>
          </form>

          <div className="ml-auto flex items-center gap-2" ref={topbarMenuRef}>
            <div className="relative">
              <button
                ref={messagesButtonRef}
                type="button"
                className="relative btn-ghost p-2"
                aria-label={`Abrir inbox de conversas${totalUnreadMessages ? `, ${totalUnreadMessages} não lidas` : ''}`}
                aria-haspopup="menu"
                aria-controls={messagesPanelId}
                aria-expanded={openMenu === 'messages'}
                onClick={() =>
                  setOpenMenu((current) => (current === 'messages' ? null : 'messages'))
                }
              >
                <MessageSquare size={18} />
                {communicationsLoading ? (
                  <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50" />
                ) : formattedUnreadMessages ? (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-[18px] text-primary-foreground">
                    {formattedUnreadMessages}
                  </span>
                ) : null}
              </button>
              {openMenu === 'messages' && (
                <div
                  id={messagesPanelId}
                  ref={messagesPanelRef}
                  aria-labelledby={messagesPanelTitleId}
                  role="dialog"
                  aria-label="Conversas recentes"
                  className="absolute right-0 z-50 mt-2 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-lg border border-border bg-card shadow-lg sm:w-80"
                >
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div id={messagesPanelTitleId}>
                      <p className="text-sm font-semibold text-foreground">Conversas</p>
                      <p className="text-xs text-muted-foreground">
                        Conversas recentes da clínica.
                      </p>
                    </div>
                    <Link
                      href="/clinic/inbox?tab=conversas"
                      className="text-xs font-semibold text-primary"
                      onClick={() => setOpenMenu(null)}
                    >
                      Ver inbox
                    </Link>
                  </div>
                  <div className="max-h-96 overflow-y-auto p-2">
                    {communicationsError ? (
                      <div
                        role="alert"
                        className="mb-2 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"
                      >
                        <AlertTriangle size={14} className="shrink-0" /> {communicationsError}
                      </div>
                    ) : null}
                    {communicationsLoading && topMessages.length === 0 ? (
                      <div className="space-y-2 p-2" aria-label="Carregando conversas">
                        {[0, 1, 2].map((item) => (
                          <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />
                        ))}
                      </div>
                    ) : topMessages.length === 0 && !communicationsError ? (
                      <div className="rounded-xl p-4 text-center text-xs text-muted-foreground">
                        Nenhuma conversa recente.
                      </div>
                    ) : (
                      topMessages.map((message) => (
                        <div
                          key={message.id}
                          className="rounded-xl p-2 hover:bg-muted/60 focus-within:bg-muted/60"
                        >
                          <div className="flex items-start gap-2">
                            <Link
                              href={message.href}
                              className="min-w-0 flex-1"
                              onClick={() => setOpenMenu(null)}
                            >
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {message.patientName}
                              </span>
                              <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {message.body}
                              </span>
                              <span className="mt-1 block text-[11px] text-muted-foreground">
                                {formatRelativeTimestamp(message.createdAt)} · {message.unreadCount}{' '}
                                não lidas
                              </span>
                            </Link>
                            {message.unreadCount > 0 && (
                              <button
                                type="button"
                                onClick={() => void handleMarkThreadRead(message.threadId)}
                                className="btn-ghost p-1.5"
                                aria-label={`Marcar conversa de ${message.patientName} como lida`}
                              >
                                <Check size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <button
                ref={notificationsButtonRef}
                type="button"
                className="relative btn-ghost p-2"
                aria-label={`Abrir notificações${totalUnreadNotifications ? `, ${totalUnreadNotifications} não lidas` : ''}`}
                aria-haspopup="menu"
                aria-controls={notificationsPanelId}
                aria-expanded={openMenu === 'notifications'}
                onClick={() =>
                  setOpenMenu((current) => (current === 'notifications' ? null : 'notifications'))
                }
              >
                <Bell size={18} />
                {communicationsLoading ? (
                  <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50" />
                ) : formattedUnreadNotifications ? (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-negative px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                    {formattedUnreadNotifications}
                  </span>
                ) : null}
              </button>
              {openMenu === 'notifications' && (
                <div
                  id={notificationsPanelId}
                  ref={notificationsPanelRef}
                  aria-labelledby={notificationsPanelTitleId}
                  role="dialog"
                  aria-label="Notificações recentes"
                  className="absolute right-0 z-50 mt-2 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-lg border border-border bg-card shadow-lg sm:w-80"
                >
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div id={notificationsPanelTitleId}>
                      <p className="text-sm font-semibold text-foreground">Notificações</p>
                      <p className="text-xs text-muted-foreground">
                        Itens autorizados para sua sessão.
                      </p>
                    </div>
                    <Link
                      href="/clinic/inbox?tab=notificacoes"
                      className="text-xs font-semibold text-primary"
                      onClick={() => setOpenMenu(null)}
                    >
                      Ver todas
                    </Link>
                  </div>
                  <div className="max-h-96 overflow-y-auto p-2">
                    {communicationsError ? (
                      <div
                        role="alert"
                        className="mb-2 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"
                      >
                        <AlertTriangle size={14} className="shrink-0" /> {communicationsError}
                      </div>
                    ) : null}
                    {communicationsLoading && topNotifications.length === 0 ? (
                      <div className="space-y-2 p-2" aria-label="Carregando Notificações">
                        {[0, 1, 2].map((item) => (
                          <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />
                        ))}
                      </div>
                    ) : topNotifications.length === 0 && !communicationsError ? (
                      <div className="rounded-xl p-4 text-center text-xs text-muted-foreground">
                        Nenhuma notificação pendente.
                      </div>
                    ) : (
                      topNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className="rounded-xl p-2 hover:bg-muted/60 focus-within:bg-muted/60"
                        >
                          <div className="flex items-start gap-2">
                            <Link
                              href={notification.href}
                              className="min-w-0 flex-1"
                              onClick={() => setOpenMenu(null)}
                            >
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {notification.title}
                              </span>
                              <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {notification.body || notification.category}
                              </span>
                              <span className="mt-1 block text-[11px] text-muted-foreground">
                                {formatRelativeTimestamp(notification.createdAt)} ·{' '}
                                {notification.category}
                              </span>
                            </Link>
                            {notification.status === 'unread' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleMarkNotificationRead(notification.notificationId)
                                }
                                className="btn-ghost p-1.5"
                                aria-label={`Marcar notificação ${notification.title} como lida`}
                              >
                                <Check size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <Link
              href="/profile"
              className="btn-ghost h-7 w-7 rounded-full p-0 bg-primary/10"
              aria-label="Abrir perfil do usuario"
              title={userDisplayName}
            >
              <User size={14} className="text-primary" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="btn-ghost h-7 w-7 rounded-full p-0"
              aria-label="Sair da conta"
              title="Sair"
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="app-shell-main overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
