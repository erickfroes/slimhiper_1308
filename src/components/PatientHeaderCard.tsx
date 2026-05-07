import React from 'react';
import { Phone, Mail, User, Tag } from 'lucide-react';
import type { PatientProfile, PatientPackageSummary, ClinicalStatusSummary } from '@/domain/types';
import StatusBadge from './StatusBadge';

interface PatientHeaderCardProps {
  profile: PatientProfile;
  activePackage: PatientPackageSummary;
  clinicalStatus: ClinicalStatusSummary;
}

const programTypeLabel: Record<string, string> = {
  emagrecimento: 'Emagrecimento',
  hipertrofia: 'Hipertrofia',
  recomposicao: 'Recomposição',
  saude_metabolica: 'Saúde Metabólica',
  longevidade: 'Longevidade',
};

const programTypeColor: Record<string, string> = {
  emagrecimento: 'bg-teal-50 text-teal-700 border-teal-200',
  hipertrofia: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  recomposicao: 'bg-purple-50 text-purple-700 border-purple-200',
  saude_metabolica: 'bg-blue-50 text-blue-700 border-blue-200',
  longevidade: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function PatientHeaderCard({ profile, activePackage, clinicalStatus }: PatientHeaderCardProps) {
  const progressPercent = Math.round((activePackage.currentWeek / activePackage.totalWeeks) * 100);

  return (
    <div className="card-base p-5 mb-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-5">
        {/* Avatar + Identity */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User size={28} className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-foreground">{profile.name}</h2>
              <StatusBadge status={profile.status} />
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-sm text-muted-foreground">{profile.age} anos</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground font-mono">{profile.cpfMasked}</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone size={11} />
                {profile.phone}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail size={11} />
                {profile.email}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px h-16 bg-border flex-shrink-0" />

        {/* Program info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={['text-xs font-semibold px-2 py-0.5 rounded-full border', programTypeColor[activePackage.programType]].join(' ')}>
              {programTypeLabel[activePackage.programType]}
            </span>
            <span className="text-sm font-semibold text-foreground">{activePackage.programName}</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">
              Semana {activePackage.currentWeek}/{activePackage.totalWeeks}
            </span>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-xs text-muted-foreground">
              {activePackage.startDate} → {activePackage.endDate}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-muted rounded-full h-1.5 max-w-48">
              <div
                className="bg-primary rounded-full h-1.5 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-primary">{progressPercent}%</span>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px h-16 bg-border flex-shrink-0" />

        {/* Key metrics */}
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground tabular-nums">{clinicalStatus.currentWeightKg}</p>
            <p className="text-xs text-muted-foreground">kg atual</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground tabular-nums">{clinicalStatus.currentBmi}</p>
            <p className="text-xs text-muted-foreground">IMC</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-positive tabular-nums">-{clinicalStatus.weightLostKg}</p>
            <p className="text-xs text-muted-foreground">kg perdidos</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground tabular-nums">{clinicalStatus.weeklyAdherencePercent}%</p>
            <p className="text-xs text-muted-foreground">adesão</p>
          </div>
        </div>

        {/* Tags */}
        {profile.tags && profile.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {profile.tags.map((tag) => (
              <span key={`tag-${tag}`} className="flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Care team */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
        <span className="text-xs text-muted-foreground font-medium">Equipe:</span>
        {profile.careTeam.map((member) => (
          <span key={`team-${member}`} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-medium">
            {member}
          </span>
        ))}
      </div>
    </div>
  );
}