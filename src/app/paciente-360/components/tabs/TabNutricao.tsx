'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type {
  PatientNutritionPlanSummary,
  NutritionMeal,
  NutritionFoodGroup,
  NutritionPlanHistory,
  MealAdherenceEntry,
  MealPhoto,
  NutritionTeamNote,
} from '@/domain/types';
import {
  Flame,
  Beef,
  Wheat,
  Droplets,
  UtensilsCrossed,
  Leaf,
  Apple,
  Fish,
  Clock,
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  Copy,
  Send,
  Archive,
  Smartphone,
  XCircle,
  Camera,
  MessageSquare,
  Lock,
  History,
  BarChart2,
  Utensils,
  AlertTriangle,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import {
  archivePatientNutritionPlan,
  getPatientNutritionPlan,
  getMealPhotoSignedUrl,
  savePatientNutritionPlan,
} from '@/services/nutritionApi';

interface TabNutricaoProps {
  patientId: string;
  initialPlan?: PatientNutritionPlanSummary | null;
}

// ─── Food group icon + color map ─────────────────────────────────────────────
const foodGroupConfig: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; border: string }
> = {
  fonte_proteica: { icon: Beef, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  carboidrato: {
    icon: Wheat,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  vegetais: {
    icon: Leaf,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  gorduras_boas: {
    icon: Fish,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  frutas: { icon: Apple, color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' },
  liquidos: { icon: Droplets, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-200' },
};

// ─── Macro bar ────────────────────────────────────────────────────────────────
function MacroBar({
  label,
  value,
  max,
  color,
  icon: IconComp,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  icon: React.ElementType;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const bgColor = color.replace('text-', 'bg-').replace('-600', '-50');
  const barColor = color.replace('text-', 'bg-');
  return (
    <div className="card-base p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bgColor}`}>
          <IconComp size={15} className={color} />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{value}g por dia</p>
        </div>
        <span className={`ml-auto text-sm font-bold tabular-nums ${color}`}>{value}g</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className={`rounded-full h-2 transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Meal row ─────────────────────────────────────────────────────────────────
function MealRow({ meal }: { meal: NutritionMeal }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
          <UtensilsCrossed size={14} className="text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{meal.name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock size={11} />
            {meal.time} · {meal.targetCalories} kcal
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mr-2 hidden sm:flex">
          <span className="text-red-600 font-medium">{meal.targetProteinG}g prot</span>
          <span className="text-amber-600 font-medium">{meal.targetCarbsG}g carb</span>
          <span className="text-blue-600 font-medium">{meal.targetFatG}g gord</span>
        </div>
        {open ? (
          <ChevronUp size={15} className="text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown size={15} className="text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {open && meal.description && (
        <div className="px-4 pb-3 pt-1 bg-muted/20 border-t border-border">
          <p className="text-xs text-muted-foreground">{meal.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs sm:hidden">
            <span className="text-red-600 font-medium">{meal.targetProteinG}g proteína</span>
            <span className="text-amber-600 font-medium">{meal.targetCarbsG}g carb</span>
            <span className="text-blue-600 font-medium">{meal.targetFatG}g gordura</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Food group card ──────────────────────────────────────────────────────────
function FoodGroupCard({ group }: { group: NutritionFoodGroup }) {
  const cfg = foodGroupConfig[group.category] ?? {
    icon: Leaf,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  };
  const IconComp = cfg.icon;
  return (
    <div className={`rounded-xl border p-4 ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-white/70 flex items-center justify-center">
          <IconComp size={14} className={cfg.color} />
        </div>
        <p className={`text-xs font-bold ${cfg.color}`}>{group.label}</p>
        <span className="ml-auto text-xs text-muted-foreground font-medium">
          {group.dailyServings}x/dia
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{group.portionDescription}</p>
      <div className="flex flex-wrap gap-1">
        {group.examples.map((ex) => (
          <span
            key={ex}
            className="text-xs bg-white/80 border border-white/60 text-foreground px-2 py-0.5 rounded-full"
          >
            {ex}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Adherence bar ────────────────────────────────────────────────────────────
function AdherenceBar({ entry }: { entry: MealAdherenceEntry }) {
  const pct = entry.adherencePercent;
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 65 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = pct >= 80 ? 'text-emerald-700' : pct >= 65 ? 'text-amber-700' : 'text-red-700';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-10 flex-shrink-0">{entry.label}</span>
      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-10 text-right ${textColor}`}>
        {pct}%
      </span>
      <span className="text-xs text-muted-foreground w-20 text-right hidden sm:block">
        {entry.mealsLogged}/{entry.mealsTotal} ref.
      </span>
    </div>
  );
}

// ─── Plan history row ─────────────────────────────────────────────────────────
function PlanHistoryRow({ entry }: { entry: NutritionPlanHistory }) {
  const statusMap: Record<string, { label: string; cls: string }> = {
    ativo: { label: 'Ativo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    arquivado: { label: 'Arquivado', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    duplicado: { label: 'Duplicado', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  };
  const s = statusMap[entry.status] ?? statusMap.arquivado;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <History size={14} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{entry.planName}</p>
        <p className="text-xs text-muted-foreground">
          {entry.nutritionistName} · {entry.targetCalories} kcal · Criado em {entry.createdAt}
          {entry.archivedAt && ` · Arquivado em ${entry.archivedAt}`}
        </p>
        {entry.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 italic">{entry.notes}</p>
        )}
      </div>
      <span
        className={`text-xs border px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${s.cls}`}
      >
        {s.label}
      </span>
    </div>
  );
}

// ─── Meal photo card ──────────────────────────────────────────────────────────
function MealPhotoCard({ photo, patientId }: { photo: MealPhoto; patientId: string }) {
  const [signedUrl, setSignedUrl] = useState(photo.photoUrl ?? '');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const canLoadPhoto =
    photo.hasPhoto !== false &&
    photo.photoUploadStatus !== 'failed' &&
    photo.photoUploadStatus !== 'pending_upload';

  const handleLoadPhoto = async () => {
    if (signedUrl || isLoadingUrl || !canLoadPhoto) return;
    setIsLoadingUrl(true);
    setUrlError(null);

    try {
      const result = await getMealPhotoSignedUrl(patientId, photo.id);
      if (result.error || !result.data) {
        setUrlError(result.error?.message ?? 'Nao foi possivel abrir a foto.');
        return;
      }
      setSignedUrl(result.data.url);
    } finally {
      setIsLoadingUrl(false);
    }
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="relative flex h-32 items-center justify-center bg-muted">
        {signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signedUrl}
            alt={`Foto de ${photo.mealName} enviada pelo paciente`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-muted-foreground">
              {canLoadPhoto ? <Lock size={15} /> : <XCircle size={15} />}
            </div>
            <button
              type="button"
              disabled={!canLoadPhoto || isLoadingUrl}
              onClick={() => void handleLoadPhoto()}
              className="min-h-9 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              {canLoadPhoto
                ? isLoadingUrl
                  ? 'Abrindo...'
                  : 'Ver foto'
                : photo.photoUploadStatus === 'pending_upload'
                  ? 'Upload pendente'
                  : 'Foto indisponivel'}
            </button>
          </div>
        )}
        <span className="absolute top-2 left-2 text-xs bg-black/60 text-white px-2 py-0.5 rounded-full">
          {photo.mealName}
        </span>
      </div>
      <div className="p-3">
        <p className="text-xs text-muted-foreground mb-1">
          {new Date(photo.submittedAt).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
        {photo.note && <p className="text-xs text-foreground mb-1">{photo.note}</p>}
        {urlError && (
          <p className="mb-1 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-600">{urlError}</p>
        )}
        {photo.reviewedBy && (
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium">{photo.reviewedBy}</p>
            <p className="text-xs text-foreground">{photo.reviewNote}</p>
          </div>
        )}
        {!photo.reviewedBy && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-1">
            <XCircle size={10} />
            Aguardando revisão
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Team note ────────────────────────────────────────────────────────────────
function TeamNoteCard({ note }: { note: NutritionTeamNote }) {
  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <MessageSquare size={13} className="text-violet-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{note.authorName}</span>
          <span className="text-xs text-muted-foreground">{note.authorRole}</span>
          {note.isInternal && (
            <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
              <Lock size={9} />
              Interno
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{note.createdAt}</span>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{note.content}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TabNutricao({ patientId, initialPlan = null }: TabNutricaoProps) {
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [plan, setPlan] = useState<PatientNutritionPlanSummary | null>(initialPlan);
  const [isLoading, setIsLoading] = useState(!initialPlan);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await getPatientNutritionPlan(patientId);
      setPlan(data);
      setLoadError(error?.message ?? null);
    } catch (error) {
      setPlan(null);
      setLoadError(
        error instanceof Error ? error.message : 'Falha inesperada ao carregar nutricao.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  if (isLoading) {
    return (
      <div className="card-base p-8 text-sm text-muted-foreground">
        Carregando plano alimentar...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card-base p-8 text-center">
        <AlertTriangle size={24} className="mx-auto text-amber-600" />
        <p className="mt-3 text-sm font-semibold text-foreground">Nutricao indisponivel</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <button type="button" onClick={() => void loadPlan()} className="btn-secondary mt-4">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!plan || !plan.isActive || plan.targetCalories <= 0) {
    return (
      <div className="card-base p-5">
        <EmptyState
          icon={Utensils}
          title="Nutrição indisponível"
          description="Nenhum plano alimentar real foi publicado para este paciente."
        />
      </div>
    );
  }

  const visiblePhotos = showAllPhotos
    ? (plan.mealPhotos ?? [])
    : (plan.mealPhotos ?? []).slice(0, 3);

  const handleSavePlanAction = async (action: string, duplicate = false) => {
    setActionLoading(action);
    setActionNotice(null);
    setActionError(null);
    try {
      const result = await savePatientNutritionPlan({
        patientId,
        planId: duplicate ? null : plan.id,
        planName: duplicate ? `${plan.planName} - copia` : plan.planName,
        targetCalories: plan.targetCalories,
        targetProteinG: plan.targetProteinG,
        targetCarbsG: plan.targetCarbsG,
        targetFatG: plan.targetFatG,
        meals: plan.meals ?? [],
        foodGroups: plan.foodGroups ?? [],
        publish: true,
      });
      if (result.error || !result.data) {
        setActionError(result.error?.message ?? 'Falha ao salvar plano alimentar.');
        return;
      }
      setActionNotice(
        duplicate ? 'Plano duplicado e publicado.' : 'Plano alimentar salvo e publicado.'
      );
      await loadPlan();
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchivePlan = async () => {
    setActionLoading('archive');
    setActionNotice(null);
    setActionError(null);
    try {
      const result = await archivePatientNutritionPlan(plan.id);
      if (result.error) {
        setActionError(result.error.message);
        return;
      }
      setActionNotice('Plano alimentar arquivado.');
      await loadPlan();
    } finally {
      setActionLoading(null);
    }
  };

  const proteinPct = Math.round(((plan.targetProteinG * 4) / plan.targetCalories) * 100);
  const carbsPct = Math.round(((plan.targetCarbsG * 4) / plan.targetCalories) * 100);
  const fatPct = Math.round(((plan.targetFatG * 9) / plan.targetCalories) * 100);

  const actions = [
    { key: 'create', label: 'Criar novo plano', icon: Plus, variant: 'primary' },
    { key: 'edit', label: 'Editar plano ativo', icon: Pencil, variant: 'secondary' },
    { key: 'duplicate', label: 'Duplicar plano anterior', icon: Copy, variant: 'secondary' },
    { key: 'send', label: 'Enviar ao paciente', icon: Send, variant: 'secondary' },
    { key: 'archive', label: 'Arquivar plano', icon: Archive, variant: 'ghost' },
    { key: 'app', label: 'Ver registros do app', icon: Smartphone, variant: 'ghost' },
  ];

  const handleAction = async (key: string) => {
    if (key === 'archive') {
      await handleArchivePlan();
      return;
    }
    if (key === 'duplicate' || key === 'create') {
      await handleSavePlanAction(key, true);
      return;
    }
    if (key === 'edit' || key === 'send') {
      await handleSavePlanAction(key);
      return;
    }
    if (key === 'app') {
      setActionNotice('Registros do app ja estao consolidados em fotos, aderencia e notas.');
      setActionError(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {actions.map(({ key, label, icon: ActionIcon, variant }) => {
          const base =
            'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors';
          const cls =
            variant === 'primary'
              ? `${base} bg-violet-600 text-white hover:bg-violet-700`
              : variant === 'secondary'
                ? `${base} bg-card border border-border text-foreground hover:bg-muted`
                : `${base} text-muted-foreground hover:text-foreground hover:bg-muted`;
          const Icon = ActionIcon as React.ElementType;
          return (
            <button
              key={key}
              className={`${cls} disabled:cursor-not-allowed disabled:opacity-60`}
              type="button"
              disabled={actionLoading !== null}
              onClick={() => void handleAction(key)}
            >
              <Icon size={13} />
              {actionLoading === key ? 'Processando...' : label}
            </button>
          );
        })}
      </div>
      {actionNotice && (
        <p className="text-xs text-emerald-700" role="status">
          {actionNotice}
        </p>
      )}
      {actionError && (
        <p className="text-xs text-red-600" role="alert">
          {actionError}
        </p>
      )}

      {/* ── Plano alimentar ativo ────────────────────────────────────────────── */}
      <div className="card-base p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-base font-bold text-foreground">{plan.planName}</p>
            <p className="text-sm text-muted-foreground">Nutricionista: {plan.nutritionistName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Criado em {plan.createdAt} · Atualizado em {plan.updatedAt}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
              Plano ativo
            </span>
            {plan.adherencePercent !== undefined && (
              <span className="text-xs text-muted-foreground">
                Adesão geral: {plan.adherencePercent}%
              </span>
            )}
          </div>
        </div>

        {/* Calorie hero */}
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Flame size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {plan.targetCalories} kcal
            </p>
            <p className="text-xs text-muted-foreground">Meta calórica diária</p>
          </div>
        </div>

        {/* Macros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <MacroBar
            label="Proteína"
            value={plan.targetProteinG}
            max={200}
            color="text-red-600"
            icon={Beef}
          />
          <MacroBar
            label="Carboidratos"
            value={plan.targetCarbsG}
            max={300}
            color="text-amber-600"
            icon={Wheat}
          />
          <MacroBar
            label="Gorduras"
            value={plan.targetFatG}
            max={100}
            color="text-blue-600"
            icon={Droplets}
          />
        </div>

        {/* Macro distribution */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">Distribuição calórica</p>
          <div className="w-full h-3 rounded-full overflow-hidden flex mb-2">
            <div className="bg-red-400 h-full" style={{ width: `${proteinPct}%` }} />
            <div className="bg-amber-400 h-full" style={{ width: `${carbsPct}%` }} />
            <div className="bg-blue-400 h-full" style={{ width: `${fatPct}%` }} />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
              Proteína {proteinPct}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
              Carbos {carbsPct}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
              Gorduras {fatPct}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Refeições configuradas ───────────────────────────────────────────── */}
      {plan.meals && plan.meals.length > 0 && (
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-4">
            <UtensilsCrossed size={16} className="text-violet-600" />
            <p className="text-sm font-semibold text-foreground">Refeições configuradas</p>
            <span className="ml-auto text-xs text-muted-foreground">
              {plan.meals.length} refeições
            </span>
          </div>
          <div className="space-y-2">
            {plan.meals.map((meal) => (
              <MealRow key={meal.id} meal={meal} />
            ))}
          </div>
        </div>
      )}

      {/* ── Grupos alimentares ───────────────────────────────────────────────── */}
      {plan.foodGroups && plan.foodGroups.length > 0 && (
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-4">
            <Leaf size={16} className="text-emerald-600" />
            <p className="text-sm font-semibold text-foreground">Grupos alimentares</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plan.foodGroups.map((group) => (
              <FoodGroupCard key={group.category} group={group} />
            ))}
          </div>
        </div>
      )}

      {/* ── Adesão às refeições ──────────────────────────────────────────────── */}
      {plan.mealAdherence && plan.mealAdherence.length > 0 && (
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-violet-600" />
            <p className="text-sm font-semibold text-foreground">Adesão às refeições</p>
            {plan.adherencePercent !== undefined && (
              <span className="ml-auto text-xs font-semibold text-violet-600">
                Média: {plan.adherencePercent}%
              </span>
            )}
          </div>
          <div className="space-y-3">
            {plan.mealAdherence.map((entry) => (
              <AdherenceBar key={entry.week} entry={entry} />
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />≥ 80% — Boa
              adesão
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              65–79% — Regular
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              &lt; 65% — Baixa
            </span>
          </div>
        </div>
      )}

      {/* ── Histórico de planos ──────────────────────────────────────────────── */}
      {plan.planHistory && plan.planHistory.length > 0 && (
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-3">
            <History size={16} className="text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Histórico de planos</p>
          </div>
          <div>
            {plan.planHistory.map((entry) => (
              <PlanHistoryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* ── Fotos de refeições enviadas ──────────────────────────────────────── */}
      {plan.mealPhotos && plan.mealPhotos.length > 0 && (
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-4">
            <Camera size={16} className="text-violet-600" />
            <p className="text-sm font-semibold text-foreground">Fotos de refeições enviadas</p>
            <span className="ml-auto text-xs text-muted-foreground">
              {plan.mealPhotos.length} foto{plan.mealPhotos.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {visiblePhotos.map((photo) => (
              <MealPhotoCard key={photo.id} photo={photo} patientId={patientId} />
            ))}
          </div>
          {plan.mealPhotos.length > 3 && (
            <button
              onClick={() => setShowAllPhotos(!showAllPhotos)}
              className="mt-3 text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
              type="button"
            >
              {showAllPhotos ? (
                <>
                  <ChevronUp size={13} /> Mostrar menos
                </>
              ) : (
                <>
                  <ChevronDown size={13} /> Ver todas ({plan.mealPhotos.length})
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* ── Observações da equipe ────────────────────────────────────────────── */}
      {plan.teamNotes && plan.teamNotes.length > 0 && (
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={16} className="text-violet-600" />
            <p className="text-sm font-semibold text-foreground">Observações da equipe</p>
          </div>
          <div>
            {plan.teamNotes.map((note) => (
              <TeamNoteCard key={note.id} note={note} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
