'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { createClient } from '@/lib/supabase/client';
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
  ChevronLeft,
  ChevronRight,
  Bell,
  AlertTriangle,
  Check,
  Search,
  LogOut,
  User,
  MessageSquare,
} from 'lucide-react';
import {
  getCommunicationsSummary,
  markNotificationRead,
  markThreadRead,
  type CommunicationsSummary,
} from '@/services/notificationsApi';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ElementType;
}

const clinicNavItems: NavItem[] = [
  { key: 'nav-dashboard', label: 'Dashboard', href: '/clinic/dashboard', icon: LayoutDashboard },
  { key: 'nav-pacientes', label: 'Pacientes', href: '/clinic/patients', icon: Users },
  { key: 'nav-agenda', label: 'Agenda', href: '/clinic/agenda', icon: CalendarDays },
  { key: 'nav-crm', label: 'CRM', href: '/clinic/crm', icon: TrendingUp },
  { key: 'nav-programas', label: 'Programas', href: '/clinic/programs', icon: BookOpen },
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

export default function DashboardShell({ children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [summary, setSummary] = useState<CommunicationsSummary | null>(null);
  const [communicationsLoading, setCommunicationsLoading] = useState(true);
  const [communicationsError, setCommunicationsError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<'messages' | 'notifications' | null>(null);
  const topbarMenuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const totalUnreadMessages = summary?.unreadMessages ?? 0;
  const totalUnreadNotifications = summary?.unreadNotifications ?? 0;
  const formattedUnreadMessages = formatBadgeCount(totalUnreadMessages);
  const formattedUnreadNotifications = formatBadgeCount(totalUnreadNotifications);
  const topMessages = useMemo(() => summary?.messages ?? [], [summary]);
  const topNotifications = useMemo(() => summary?.notifications ?? [], [summary]);

  useEffect(() => {
    let mounted = true;

    async function loadSummary() {
      setCommunicationsLoading(true);
      const result = await getCommunicationsSummary();
      if (!mounted) return;

      if (result.error) {
        setCommunicationsError('Nao foi possivel carregar inbox e notificacoes.');
        setSummary(null);
      } else {
        setCommunicationsError(null);
        setSummary(result.data);
      }
      setCommunicationsLoading(false);
    }

    void loadSummary();
    const interval = window.setInterval(() => void loadSummary(), 60000);

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

  const isActive = (href: string) => {
    if (href === '/clinic/dashboard') return pathname === '/clinic/dashboard' || pathname === '/';
    return pathname.startsWith(href);
  };

  async function handleLogout() {
    const supabase = createClient();
    await supabase?.auth?.signOut();

    router.push('/auth/login');
    router.refresh();
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = patientSearch.trim();
    router.push(
      query ? `/clinic/patients?search=${encodeURIComponent(query)}` : '/clinic/patients'
    );
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
          collapsed ? 'w-16' : 'w-60',
          'fixed lg:relative h-full',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Logo */}
        <div
          className={[
            'flex items-center border-b border-border flex-shrink-0',
            collapsed ? 'justify-center px-0 py-4' : 'gap-2 px-4 py-4',
          ].join(' ')}
        >
          <div className="flex items-center gap-2">
            <AppLogo size={32} />
            {!collapsed && (
              <div className="flex flex-col leading-none">
                <span className="font-bold text-sm text-foreground tracking-tight">SlimHiper</span>
                <span className="text-xs text-muted-foreground font-medium">Clinic OS</span>
              </div>
            )}
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-0.5">
          {clinicNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={[
                  'relative flex items-center rounded-xl transition-all duration-150 group',
                  collapsed ? 'justify-center px-0 py-2.5 mx-0' : 'gap-3 px-3 py-2.5',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary',
                ].join(' ')}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
                {!collapsed && (
                  <span className={['text-sm', active ? 'font-semibold' : 'font-medium'].join(' ')}>
                    {item.label}
                  </span>
                )}
                {/* Tooltip for collapsed */}
                {collapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-foreground text-background text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: user + collapse toggle */}
        <div className="border-t border-border p-2 flex-shrink-0">
          {!collapsed && (
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-3 py-2 rounded-xl hover:bg-muted transition-colors cursor-pointer mb-1 text-left"
              title="Sair"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User size={14} className="text-primary" />
              </div>
              <div className="flex flex-col leading-none min-w-0">
                <span className="text-xs font-semibold text-foreground truncate">
                  Coord. Ana Souza
                </span>
                <span className="text-xs text-muted-foreground">Coordenadora</span>
              </div>
              <LogOut size={14} className="ml-auto text-muted-foreground flex-shrink-0" />
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full py-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150"
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
        <header className="flex items-center gap-3 px-4 lg:px-6 py-3 bg-card border-b border-border flex-shrink-0">
          <button className="lg:hidden btn-ghost p-2" onClick={() => setMobileOpen(true)}>
            <LayoutDashboard size={18} />
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
              className="input-base pl-9 py-1.5 text-sm"
            />
          </form>

          <div className="ml-auto flex items-center gap-2" ref={topbarMenuRef}>
            <div className="relative">
              <button
                type="button"
                className="relative btn-ghost p-2"
                aria-label={`Abrir inbox de conversas${totalUnreadMessages ? `, ${totalUnreadMessages} nao lidas` : ''}`}
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
                <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Conversas</p>
                      <p className="text-xs text-muted-foreground">Unread count real por tenant.</p>
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
                        className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"
                      >
                        <AlertTriangle size={14} className="shrink-0" /> {communicationsError}
                      </div>
                    ) : communicationsLoading ? (
                      <div className="space-y-2 p-2" aria-label="Carregando conversas">
                        {[0, 1, 2].map((item) => (
                          <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />
                        ))}
                      </div>
                    ) : topMessages.length === 0 ? (
                      <div className="rounded-xl p-4 text-center text-xs text-muted-foreground">
                        Nenhuma conversa recente.
                      </div>
                    ) : (
                      topMessages.map((message) => (
                        <div key={message.id} className="rounded-xl p-2 hover:bg-muted/60">
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
                                nao lidas
                              </span>
                            </Link>
                            {message.unreadCount > 0 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const result = await markThreadRead(message.threadId);
                                  if (result.data) setSummary(result.data);
                                }}
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
                type="button"
                className="relative btn-ghost p-2"
                aria-label={`Abrir notificacoes${totalUnreadNotifications ? `, ${totalUnreadNotifications} nao lidas` : ''}`}
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
                <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Notificacoes</p>
                      <p className="text-xs text-muted-foreground">Somente itens autorizados.</p>
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
                        className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"
                      >
                        <AlertTriangle size={14} className="shrink-0" /> {communicationsError}
                      </div>
                    ) : communicationsLoading ? (
                      <div className="space-y-2 p-2" aria-label="Carregando notificacoes">
                        {[0, 1, 2].map((item) => (
                          <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />
                        ))}
                      </div>
                    ) : topNotifications.length === 0 ? (
                      <div className="rounded-xl p-4 text-center text-xs text-muted-foreground">
                        Nenhuma notificacao pendente.
                      </div>
                    ) : (
                      topNotifications.map((notification) => (
                        <div key={notification.id} className="rounded-xl p-2 hover:bg-muted/60">
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
                                onClick={async () => {
                                  const result = await markNotificationRead(
                                    notification.notificationId
                                  );
                                  if (result.data) setSummary(result.data);
                                }}
                                className="btn-ghost p-1.5"
                                aria-label={`Marcar notificacao ${notification.title} como lida`}
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
            <button
              type="button"
              onClick={handleLogout}
              className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer"
              title="Sair"
            >
              <User size={14} className="text-primary" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
