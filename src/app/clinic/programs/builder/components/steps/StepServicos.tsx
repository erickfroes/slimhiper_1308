'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CommercialService, ProgramBuilderDraft, ProgramService } from '@/domain/types';
import { getClinicCommercialCatalog } from '@/services/commercialApi';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

const servicePresets: ProgramService[] = [
  { label: 'Consultas médicas', quantity: 4, unit: 'sessões' },
  { label: 'Sessões de nutrição', quantity: 4, unit: 'sessões' },
  { label: 'Bioimpedância', quantity: 2, unit: 'avaliações' },
  { label: 'Painéis laboratoriais', quantity: 2, unit: 'painéis' },
  { label: 'Avaliação de sono', quantity: 1, unit: 'avaliação' },
  { label: 'Consulta de psicologia', quantity: 2, unit: 'sessões' },
];

export default function StepServicos({ draft, onChange }: Props) {
  const services = draft.includedServices;
  const [catalogServices, setCatalogServices] = useState<CommercialService[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getClinicCommercialCatalog().then((result) => {
      if (!active) return;
      if (result.data) {
        const activeServices = result.data.services.filter((service) => service.status === 'ativo');
        setCatalogServices(activeServices);
      } else {
        setCatalogError(result.error?.message ?? 'Não foi possível carregar o catálogo.');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (catalogServices.length === 0) return;
    const linkedServices = services.map((service) => {
      if (service.serviceId) return service;
      const match = catalogServices.find((item) => item.name === service.label);
      return match ? { ...service, serviceId: match.id, label: match.name } : service;
    });
    if (linkedServices.some((service, index) => service.serviceId !== services[index]?.serviceId)) {
      onChange({ includedServices: linkedServices });
    }
  }, [catalogServices, onChange, services]);

  const addService = () => {
    onChange({
      includedServices: [...services, { serviceId: '', label: '', quantity: 1, unit: 'sessões' }],
    });
  };

  const addPreset = (preset: ProgramService) => {
    const catalogService = catalogServices.find((service) => service.name === preset.label);
    const exists = services.some((s) => s.label === preset.label);
    if (!exists && catalogService) {
      onChange({ includedServices: [...services, { ...preset, serviceId: catalogService.id }] });
    }
  };

  const updateService = (idx: number, patch: Partial<ProgramService>) => {
    onChange({ includedServices: services.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  };

  const removeService = (idx: number) => {
    onChange({ includedServices: services.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div className="card-base p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Adicionar serviço rápido</h3>
        <div className="flex flex-wrap gap-2">
          {servicePresets.map((p) => {
            const added = services.some((s) => s.label === p.label);
            const isRegistered = catalogServices.some((service) => service.name === p.label);
            return (
              <button
                key={p.label}
                onClick={() => addPreset(p)}
                disabled={added || !isRegistered}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  added
                    ? 'bg-primary/10 text-primary border-primary/30 cursor-default'
                    : 'bg-muted text-muted-foreground border-border hover:bg-primary/5 hover:text-primary hover:border-primary/30',
                ].join(' ')}
              >
                {added ? '✓ ' : '+ '}
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Service list */}
      <div className="space-y-3">
        {services.map((svc, idx) => (
          <div key={idx} className="card-base p-4">
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-6 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Serviço</label>
                <select
                  value={svc.serviceId ?? ''}
                  onChange={(e) => {
                    const service = catalogServices.find((item) => item.id === e.target.value);
                    updateService(idx, {
                      serviceId: service?.id ?? '',
                      label: service?.name ?? '',
                      unit: service?.unit ?? svc.unit,
                    });
                  }}
                  className="input-base w-full"
                  required
                >
                  <option value="">Selecione um serviço cadastrado</option>
                  {catalogServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · R${' '}
                      {(service.basePriceCents / 100).toFixed(2).replace('.', ',')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Qtd.</label>
                <input
                  type="number"
                  min={1}
                  value={svc.quantity}
                  onChange={(e) => updateService(idx, { quantity: Number(e.target.value) })}
                  className="input-base w-full"
                />
              </div>
              <div className="col-span-3 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Unidade</label>
                <select
                  value={svc.unit}
                  onChange={(e) => updateService(idx, { unit: e.target.value })}
                  className="input-base w-full"
                >
                  <option>sessões</option>
                  <option>avaliações</option>
                  <option>painéis</option>
                  <option>avaliação</option>
                  <option>consultas</option>
                </select>
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  onClick={() => removeService(idx)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-negative hover:bg-negative/10 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {catalogError ? <p className="text-xs text-negative">{catalogError}</p> : null}
      <p className="text-xs text-muted-foreground">
        Os serviços do programa vêm do Catálogo Comercial. Cadastre preço e duração antes de
        incluí-los.
      </p>

      <button
        onClick={addService}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
      >
        <Plus size={16} />
        Adicionar serviço personalizado
      </button>
    </div>
  );
}
