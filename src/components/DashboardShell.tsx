'use client';

import React, { useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  LogOut,
  User,
  MessageSquare,
} from 'lucide-react';

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
  { key: 'nav-configuracoes', label: 'Configurações', href: '/clinic/settings', icon: Settings },
];

interface DashboardShellProps {
  children: React.ReactNode;
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const pathname = usePathname();
  const router = useRouter();

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

          <div className="ml-auto flex items-center gap-2">
            <button className="relative btn-ghost p-2">
              <MessageSquare size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
            </button>
            <button className="relative btn-ghost p-2">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-negative rounded-full" />
            </button>
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
