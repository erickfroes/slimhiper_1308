'use client';

import React, { useState } from 'react';
import {
  Building2,
  MapPin,
  Users,
  ShieldCheck,
  Palette,
  Globe,
  Plug,
  CreditCard,
  BookOpen,
  Camera,
  Plus,
  Edit2,
  Trash2,
  Check,
  ChevronRight,
  Phone,
  Save,
  Upload,
} from 'lucide-react';
import Icon from '@/components/ui/AppIcon';

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

interface ClinicUnit {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  isMain: boolean;
  active: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  specialty?: string;
  active: boolean;
  avatarInitials: string;
  color: string;
}

interface ClinicRole {
  id: string;
  name: string;
  label: string;
  membersCount: number;
  color: string;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  connected: boolean;
  icon: string;
}

type PermissionKey =
  | 'pacientes' |'agenda' |'atendimento' |'soap' |'nutricao' |'prescricoes' |'documentos' |'financeiro' |'pacotes' |'chat' |'relatorios' |'configuracoes';

interface RolePermissions {
  roleId: string;
  permissions: Record<PermissionKey, { read: boolean; write: boolean }>;
}

const PERMISSION_MODULES: { key: PermissionKey; label: string }[] = [
  { key: 'pacientes', label: 'Pacientes' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'atendimento', label: 'Atendimento' },
  { key: 'soap', label: 'SOAP' },
  { key: 'nutricao', label: 'Nutrição' },
  { key: 'prescricoes', label: 'Prescrições' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'pacotes', label: 'Pacotes' },
  { key: 'chat', label: 'Chat' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'configuracoes', label: 'Configurações' },
];

const mockUnits: ClinicUnit[] = [
  {
    id: 'u1',
    name: 'Unidade Central',
    address: 'Av. Paulista, 1000 – Sala 301',
    city: 'São Paulo, SP',
    phone: '(11) 3000-1234',
    isMain: true,
    active: true,
  },
  {
    id: 'u2',
    name: 'Unidade Moema',
    address: 'Rua Iraí, 220 – Sala 12',
    city: 'São Paulo, SP',
    phone: '(11) 3000-5678',
    isMain: false,
    active: true,
  },
  {
    id: 'u3',
    name: 'Unidade ABC',
    address: 'Av. Industrial, 500',
    city: 'Santo André, SP',
    phone: '(11) 4000-9012',
    isMain: false,
    active: false,
  },
];

const mockTeam: TeamMember[] = [
  {
    id: 't1',
    name: 'Dra. Fernanda Lima',
    role: 'Médica',
    email: 'fernanda@slimhiper.com',
    specialty: 'Endocrinologia',
    active: true,
    avatarInitials: 'FL',
    color: 'bg-teal-100 text-teal-700',
  },
  {
    id: 't2',
    name: 'Nutr. Carlos Mendes',
    role: 'Nutricionista',
    email: 'carlos@slimhiper.com',
    specialty: 'Nutrição Clínica',
    active: true,
    avatarInitials: 'CM',
    color: 'bg-violet-100 text-violet-700',
  },
  {
    id: 't3',
    name: 'Ana Souza',
    role: 'Coordenadora',
    email: 'ana@slimhiper.com',
    active: true,
    avatarInitials: 'AS',
    color: 'bg-blue-100 text-blue-700',
  },
  {
    id: 't4',
    name: 'Beatriz Costa',
    role: 'Recepcionista',
    email: 'beatriz@slimhiper.com',
    active: true,
    avatarInitials: 'BC',
    color: 'bg-amber-100 text-amber-700',
  },
  {
    id: 't5',
    name: 'Dr. Rafael Torres',
    role: 'Médico',
    email: 'rafael@slimhiper.com',
    specialty: 'Nutrologia',
    active: false,
    avatarInitials: 'RT',
    color: 'bg-rose-100 text-rose-700',
  },
];

const mockRoles: ClinicRole[] = [
  {
    id: 'admin',
    name: 'admin',
    label: 'Administrador',
    membersCount: 1,
    color: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  {
    id: 'physician',
    name: 'physician',
    label: 'Médico',
    membersCount: 2,
    color: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    id: 'nutritionist',
    name: 'nutritionist',
    label: 'Nutricionista',
    membersCount: 1,
    color: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    id: 'coordinator',
    name: 'coordinator',
    label: 'Coordenador',
    membersCount: 1,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'receptionist',
    name: 'receptionist',
    label: 'Recepcionista',
    membersCount: 1,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
];

const defaultPermissions = (
  roleId: string
): Record<PermissionKey, { read: boolean; write: boolean }> => {
  const all: Record<PermissionKey, { read: boolean; write: boolean }> = {
    pacientes: { read: true, write: true },
    agenda: { read: true, write: true },
    atendimento: { read: true, write: true },
    soap: { read: true, write: true },
    nutricao: { read: true, write: true },
    prescricoes: { read: true, write: true },
    documentos: { read: true, write: true },
    financeiro: { read: true, write: true },
    pacotes: { read: true, write: true },
    chat: { read: true, write: true },
    relatorios: { read: true, write: true },
    configuracoes: { read: true, write: true },
  };
  if (roleId === 'receptionist') {
    return {
      ...all,
      soap: { read: false, write: false },
      nutricao: { read: false, write: false },
      prescricoes: { read: false, write: false },
      financeiro: { read: true, write: false },
      relatorios: { read: false, write: false },
      configuracoes: { read: false, write: false },
    };
  }
  if (roleId === 'nutritionist') {
    return {
      ...all,
      prescricoes: { read: true, write: false },
      financeiro: { read: true, write: false },
      configuracoes: { read: false, write: false },
    };
  }
  if (roleId === 'physician') {
    return {
      ...all,
      configuracoes: { read: false, write: false },
    };
  }
  if (roleId === 'coordinator') {
    return {
      ...all,
      soap: { read: true, write: false },
      nutricao: { read: true, write: false },
      prescricoes: { read: true, write: false },
      configuracoes: { read: true, write: false },
    };
  }
  return all;
};

const mockRolePermissions: RolePermissions[] = mockRoles.map((r) => ({
  roleId: r.id,
  permissions: defaultPermissions(r.id),
}));

const mockIntegrations: Integration[] = [
  {
    id: 'i1',
    name: 'WhatsApp Business',
    description: 'Envio de mensagens e notificações automáticas',
    category: 'Comunicação',
    connected: true,
    icon: '💬',
  },
  {
    id: 'i2',
    name: 'Google Agenda',
    description: 'Sincronização bidirecional de consultas',
    category: 'Agenda',
    connected: true,
    icon: '📅',
  },
  {
    id: 'i3',
    name: 'Stripe',
    description: 'Processamento de pagamentos e assinaturas',
    category: 'Financeiro',
    connected: false,
    icon: '💳',
  },
  {
    id: 'i4',
    name: 'DocuSign',
    description: 'Assinatura eletrônica de documentos',
    category: 'Documentos',
    connected: false,
    icon: '✍️',
  },
  {
    id: 'i5',
    name: 'Receita Federal',
    description: 'Validação de CPF e dados cadastrais',
    category: 'Compliance',
    connected: true,
    icon: '🏛️',
  },
  {
    id: 'i6',
    name: 'iClinic',
    description: 'Importação de prontuários legados',
    category: 'Migração',
    connected: false,
    icon: '🔄',
  },
];

const mockDefaultPrograms = [
  { id: 'dp1', name: 'Emagrecimento 12 semanas', active: true },
  { id: 'dp2', name: 'Hipertrofia 16 semanas', active: true },
  { id: 'dp3', name: 'Recomposição corporal', active: false },
  { id: 'dp4', name: 'Saúde metabólica 90 dias', active: true },
  { id: 'dp5', name: 'Longevidade preventiva', active: false },
];

// ─── SECTION IDs ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'perfil', label: 'Perfil da clínica', icon: Building2 },
  { id: 'unidades', label: 'Unidades', icon: MapPin },
  { id: 'equipe', label: 'Equipe', icon: Users },
  { id: 'papeis', label: 'Papéis e permissões', icon: ShieldCheck },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'portal', label: 'Portal do paciente', icon: Globe },
  { id: 'integracoes', label: 'Integrações', icon: Plug },
  { id: 'financeiro', label: 'Financeiro', icon: CreditCard },
  { id: 'programas', label: 'Programas padrão', icon: BookOpen },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// ─── TOGGLE COMPONENT ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-primary' : 'bg-border'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ─── SECTION: PERFIL ─────────────────────────────────────────────────────────

function SectionPerfil() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center border-2 border-dashed border-primary/30 cursor-pointer hover:bg-primary/15 transition-colors group relative overflow-hidden">
          <Camera
            size={22}
            className="text-primary/60 group-hover:text-primary transition-colors"
          />
          <span className="absolute bottom-1 text-[9px] text-primary/60 font-medium">Logo</span>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Logo da clínica</p>
          <p className="text-xs text-muted-foreground mt-0.5">PNG ou SVG, máx. 2 MB</p>
          <button className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            <Upload size={12} /> Fazer upload
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Nome da clínica *
          </label>
          <input defaultValue="SlimHiper Clinic" className="input-base w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">CNPJ</label>
          <input defaultValue="12.345.678/0001-90" className="input-base w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            E-mail principal
          </label>
          <input
            defaultValue="contato@slimhiper.com"
            type="email"
            className="input-base w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Telefone</label>
          <input defaultValue="(11) 3000-1234" className="input-base w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Site</label>
          <input defaultValue="https://slimhiper.com.br" className="input-base w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Fuso horário
          </label>
          <select className="input-base w-full text-sm">
            <option>America/Sao_Paulo (UTC-3)</option>
            <option>America/Manaus (UTC-4)</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Especialidades
          </label>
          <input
            defaultValue="Endocrinologia, Nutrologia, Nutrição Clínica"
            className="input-base w-full text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Save size={14} /> Salvar alterações
        </button>
      </div>
    </div>
  );
}

// ─── SECTION: UNIDADES ────────────────────────────────────────────────────────

function SectionUnidades() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{mockUnits.length} unidades cadastradas</p>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:bg-primary/90 transition-colors">
          <Plus size={13} /> Nova unidade
        </button>
      </div>

      <div className="space-y-3">
        {mockUnits.map((unit) => (
          <div
            key={unit.id}
            className={`bg-background border border-border rounded-xl p-4 ${!unit.active ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MapPin size={14} className="text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{unit.name}</span>
                    {unit.isMain && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        Principal
                      </span>
                    )}
                    {!unit.active && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        Inativa
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{unit.address}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin size={11} /> {unit.city}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone size={11} /> {unit.phone}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <Edit2 size={13} />
                </button>
                {!unit.isMain && (
                  <button className="p-1.5 rounded-lg text-muted-foreground hover:bg-negative/10 hover:text-negative transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SECTION: EQUIPE ─────────────────────────────────────────────────────────

function SectionEquipe() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{mockTeam.length} membros</p>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:bg-primary/90 transition-colors">
          <Plus size={13} /> Convidar membro
        </button>
      </div>

      <div className="space-y-2">
        {mockTeam.map((member) => (
          <div
            key={member.id}
            className={`flex items-center gap-3 p-3 bg-background border border-border rounded-xl ${!member.active ? 'opacity-60' : ''}`}
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${member.color}`}
            >
              {member.avatarInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{member.name}</span>
                {!member.active && (
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                    Inativo
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{member.role}</span>
                {member.specialty && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground">{member.specialty}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-xs text-muted-foreground hidden sm:block">{member.email}</span>
              <button className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-2">
                <Edit2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SECTION: PAPÉIS E PERMISSÕES ────────────────────────────────────────────

function SectionPapeis() {
  const [selectedRole, setSelectedRole] = useState<string>('admin');
  const [permissions, setPermissions] = useState<RolePermissions[]>(mockRolePermissions);

  const currentPerms = permissions.find((p) => p.roleId === selectedRole)!;
  const currentRole = mockRoles.find((r) => r.id === selectedRole)!;

  const togglePerm = (key: PermissionKey, type: 'read' | 'write') => {
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.roleId !== selectedRole) return p;
        const updated = { ...p.permissions[key] };
        if (type === 'read') {
          updated.read = !updated.read;
          if (!updated.read) updated.write = false; // can't write without read
        } else {
          updated.write = !updated.write;
          if (updated.write) updated.read = true; // write implies read
        }
        return { ...p, permissions: { ...p.permissions, [key]: updated } };
      })
    );
  };

  return (
    <div className="space-y-5">
      {/* Role selector */}
      <div className="flex flex-wrap gap-2">
        {mockRoles.map((role) => (
          <button
            key={role.id}
            onClick={() => setSelectedRole(role.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-150 ${
              selectedRole === role.id
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {role.label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${selectedRole === role.id ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}
            >
              {role.membersCount}
            </span>
          </button>
        ))}
      </div>

      {/* Permission matrix */}
      <div className="border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_80px_80px] bg-muted/60 border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Módulo
          </span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
            Leitura
          </span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
            Escrita
          </span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {PERMISSION_MODULES.map((mod) => {
            const perm = currentPerms.permissions[mod.key];
            return (
              <div
                key={mod.key}
                className="grid grid-cols-[1fr_80px_80px] items-center px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <span className="text-sm text-foreground font-medium">{mod.label}</span>
                <div className="flex justify-center">
                  <Toggle checked={perm.read} onChange={() => togglePerm(mod.key, 'read')} />
                </div>
                <div className="flex justify-center">
                  <Toggle checked={perm.write} onChange={() => togglePerm(mod.key, 'write')} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Editando permissões de:{' '}
          <span className="font-semibold text-foreground">{currentRole.label}</span>
        </p>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Save size={14} /> Salvar permissões
        </button>
      </div>
    </div>
  );
}

// ─── SECTION: BRANDING ───────────────────────────────────────────────────────

function SectionBranding() {
  const [primaryColor, setPrimaryColor] = useState('#0d9488');
  const [accentColor, setAccentColor] = useState('#059669');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Cor primária
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-border cursor-pointer"
            />
            <input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="input-base flex-1 text-sm font-mono"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Cor de destaque
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-border cursor-pointer"
            />
            <input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="input-base flex-1 text-sm font-mono"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          Fonte principal
        </label>
        <select className="input-base w-full max-w-xs text-sm">
          <option>Plus Jakarta Sans</option>
          <option>DM Sans</option>
          <option>Manrope</option>
          <option>General Sans</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          Favicon / ícone do app
        </label>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-dashed border-primary/30">
            <Building2 size={20} className="text-primary/50" />
          </div>
          <button className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            <Upload size={12} /> Fazer upload
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Save size={14} /> Salvar branding
        </button>
      </div>
    </div>
  );
}

// ─── SECTION: PORTAL DO PACIENTE ─────────────────────────────────────────────

function SectionPortal() {
  const [settings, setSettings] = useState({
    selfScheduling: true,
    chatEnabled: true,
    documentsAccess: true,
    financialAccess: false,
    checkInReminder: true,
    npsEnabled: true,
  });

  const toggle = (key: keyof typeof settings) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  const items = [
    {
      key: 'selfScheduling' as const,
      label: 'Auto-agendamento',
      desc: 'Pacientes podem agendar consultas pelo app',
    },
    {
      key: 'chatEnabled' as const,
      label: 'Chat com equipe',
      desc: 'Mensagens diretas entre paciente e profissional',
    },
    {
      key: 'documentsAccess' as const,
      label: 'Acesso a documentos',
      desc: 'Visualização de laudos, receitas e resultados',
    },
    {
      key: 'financialAccess' as const,
      label: 'Extrato financeiro',
      desc: 'Paciente visualiza cobranças e pagamentos',
    },
    {
      key: 'checkInReminder' as const,
      label: 'Lembretes de check-in',
      desc: 'Notificações push para check-ins pendentes',
    },
    {
      key: 'npsEnabled' as const,
      label: 'Pesquisa de satisfação (NPS)',
      desc: 'Envio automático após consultas',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          URL do portal
        </label>
        <div className="flex items-center gap-2">
          <input
            defaultValue="https://app.slimhiper.com.br/p/slimhiper"
            readOnly
            className="input-base flex-1 text-sm bg-muted/40 text-muted-foreground"
          />
          <button className="px-3 py-2 border border-border rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            Copiar
          </button>
        </div>
      </div>

      <div className="space-y-2 mt-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between p-3.5 bg-background border border-border rounded-xl"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
            <Toggle checked={settings[item.key]} onChange={() => toggle(item.key)} />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Save size={14} /> Salvar configurações
        </button>
      </div>
    </div>
  );
}

// ─── SECTION: INTEGRAÇÕES ─────────────────────────────────────────────────────

function SectionIntegracoes() {
  const [integrations, setIntegrations] = useState(mockIntegrations);

  const toggle = (id: string) =>
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i))
    );

  const categories = Array.from(new Set(integrations.map((i) => i.category)));

  return (
    <div className="space-y-5">
      {categories.map((cat) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {cat}
          </h4>
          <div className="space-y-2">
            {integrations
              .filter((i) => i.category === cat)
              .map((intg) => (
                <div
                  key={intg.id}
                  className="flex items-center gap-3 p-3.5 bg-background border border-border rounded-xl"
                >
                  <span className="text-xl w-8 text-center flex-shrink-0">{intg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{intg.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{intg.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {intg.connected ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <Check size={11} /> Conectado
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Desconectado</span>
                    )}
                    <button
                      onClick={() => toggle(intg.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        intg.connected
                          ? 'bg-muted text-muted-foreground hover:bg-negative/10 hover:text-negative'
                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                      }`}
                    >
                      {intg.connected ? 'Desconectar' : 'Conectar'}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SECTION: FINANCEIRO ─────────────────────────────────────────────────────

function SectionFinanceiro() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Moeda</label>
          <select className="input-base w-full text-sm">
            <option>BRL – Real Brasileiro</option>
            <option>USD – Dólar Americano</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Dia de vencimento padrão
          </label>
          <select className="input-base w-full text-sm">
            {[1, 5, 10, 15, 20, 25, 28].map((d) => (
              <option key={d}>Dia {d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Multa por atraso (%)
          </label>
          <input defaultValue="2" type="number" className="input-base w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Juros mensais (%)
          </label>
          <input defaultValue="1" type="number" className="input-base w-full text-sm" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Chave PIX
          </label>
          <input defaultValue="financeiro@slimhiper.com.br" className="input-base w-full text-sm" />
        </div>
      </div>

      <div className="space-y-2">
        {[
          {
            label: 'Emitir NF-e automaticamente',
            desc: 'Nota fiscal gerada após confirmação de pagamento',
          },
          { label: 'Notificar inadimplência', desc: 'Alerta automático após 5 dias de atraso' },
          { label: 'Recibo por e-mail', desc: 'Enviar comprovante ao paciente após pagamento' },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between p-3.5 bg-background border border-border rounded-xl"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
            <Toggle checked onChange={() => {}} />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Save size={14} /> Salvar configurações
        </button>
      </div>
    </div>
  );
}

// ─── SECTION: PROGRAMAS PADRÃO ───────────────────────────────────────────────

function SectionProgramas() {
  const [programs, setPrograms] = useState(mockDefaultPrograms);

  const toggle = (id: string) =>
    setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Defina quais programas ficam disponíveis por padrão ao criar um novo pacote.
      </p>

      <div className="space-y-2">
        {programs.map((prog) => (
          <div
            key={prog.id}
            className="flex items-center justify-between p-3.5 bg-background border border-border rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${prog.active ? 'bg-primary' : 'bg-muted-foreground/40'}`}
              />
              <span className="text-sm font-medium text-foreground">{prog.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Toggle checked={prog.active} onChange={() => toggle(prog.id)} />
              <button className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <Edit2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
        <Plus size={13} /> Adicionar programa padrão
      </button>
    </div>
  );
}

// ─── SECTION WRAPPER ─────────────────────────────────────────────────────────

interface SectionCardProps {
  id: SectionId;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

function SectionCard({ id, title, icon: Icon, children }: SectionCardProps) {
  return (
    <div id={id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/20">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon size={15} className="text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function ClinicSettingsContent() {
  const [activeSection, setActiveSection] = useState<SectionId>('perfil');

  const scrollTo = (id: SectionId) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex min-h-full">
      {/* Left sidebar nav */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r border-border bg-card sticky top-0 h-screen overflow-y-auto">
        <div className="px-4 py-5 border-b border-border">
          <h1 className="text-sm font-bold text-foreground">Configurações</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Configurações da Clínica</p>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {SECTIONS.map((section) => {
            const SIcon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => scrollTo(section.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                  isActive
                    ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <SIcon size={14} className="flex-shrink-0" />
                <span className={`text-xs ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {section.label}
                </span>
                {isActive && <ChevronRight size={12} className="ml-auto" />}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 px-4 lg:px-8 py-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Configurações da Clínica</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gerencie perfil, equipe, permissões e preferências da clínica
            </p>
          </div>
        </div>

        {/* Mobile section nav */}
        <div className="flex lg:hidden gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {SECTIONS.map((section) => {
            const SIcon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => scrollTo(section.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <SIcon size={12} />
                {section.label}
              </button>
            );
          })}
        </div>

        {/* Sections */}
        <SectionCard id="perfil" title="Perfil da Clínica" icon={Building2}>
          <SectionPerfil />
        </SectionCard>

        <SectionCard id="unidades" title="Unidades" icon={MapPin}>
          <SectionUnidades />
        </SectionCard>

        <SectionCard id="equipe" title="Equipe" icon={Users}>
          <SectionEquipe />
        </SectionCard>

        <SectionCard id="papeis" title="Papéis e Permissões" icon={ShieldCheck}>
          <SectionPapeis />
        </SectionCard>

        <SectionCard id="branding" title="Branding" icon={Palette}>
          <SectionBranding />
        </SectionCard>

        <SectionCard id="portal" title="Portal do Paciente" icon={Globe}>
          <SectionPortal />
        </SectionCard>

        <SectionCard id="integracoes" title="Integrações" icon={Plug}>
          <SectionIntegracoes />
        </SectionCard>

        <SectionCard id="financeiro" title="Financeiro" icon={CreditCard}>
          <SectionFinanceiro />
        </SectionCard>

        <SectionCard id="programas" title="Programas Padrão" icon={BookOpen}>
          <SectionProgramas />
        </SectionCard>
      </div>
    </div>
  );
}
