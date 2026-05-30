'use client';

import React from 'react';
import { CreditCard, DollarSign } from 'lucide-react';
import type { ProgramBuilderDraft, ProgramPaymentModel } from '@/domain/types';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

const paymentModels: { value: ProgramPaymentModel; label: string; description: string }[] = [
  { value: 'avista', label: 'À Vista', description: 'Pagamento único no início do programa.' },
  { value: 'parcelado', label: 'Parcelado', description: 'Dividido em parcelas mensais fixas.' },
  { value: 'assinatura', label: 'Assinatura', description: 'Cobrança recorrente mensal ou anual.' },
  { value: 'hibrido', label: 'Híbrido', description: 'Entrada + parcelamento ou combinações.' },
];

export default function StepFinanceiro({ draft, onChange }: Props) {
  const { financial } = draft;

  const updateFinancial = (patch: Partial<typeof financial>) => {
    onChange({ financial: { ...financial, ...patch } });
  };

  const discountedPrice =
    financial.discountPercent && financial.discountPercent > 0
      ? financial.basePrice * (1 - financial.discountPercent / 100)
      : null;

  return (
    <div className="space-y-5">
      {/* Payment model selector */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Modelo de pagamento</h3>
        <div className="grid grid-cols-2 gap-3">
          {paymentModels.map((m) => (
            <button
              key={m.value}
              onClick={() => updateFinancial({ paymentModel: m.value })}
              className={[
                'p-3 rounded-xl border text-left transition-all',
                financial.paymentModel === m.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border/80 hover:bg-muted/40',
              ].join(' ')}
            >
              <p
                className={[
                  'text-sm font-semibold',
                  financial.paymentModel === m.value ? 'text-primary' : 'text-foreground',
                ].join(' ')}
              >
                {m.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Precificação</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Valor base (R$)</label>
            <div className="relative">
              <DollarSign
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="number"
                min={0}
                value={financial.basePrice}
                onChange={(e) => updateFinancial({ basePrice: Number(e.target.value) })}
                className="input-base w-full pl-8"
              />
            </div>
          </div>

          {financial.paymentModel === 'parcelado' || financial.paymentModel === 'hibrido' ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Parcelas máximas</label>
              <input
                type="number"
                min={1}
                max={24}
                value={financial.installments ?? 12}
                onChange={(e) => updateFinancial({ installments: Number(e.target.value) })}
                className="input-base w-full"
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Desconto à vista (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={financial.discountPercent ?? 0}
              onChange={(e) => updateFinancial({ discountPercent: Number(e.target.value) })}
              className="input-base w-full"
            />
          </div>
        </div>

        {/* Price preview */}
        <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
          <CreditCard size={16} className="text-muted-foreground flex-shrink-0" />
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Valor cheio: </span>
              <span className="font-semibold text-foreground">
                R$ {financial.basePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {discountedPrice !== null && (
              <div>
                <span className="text-muted-foreground">Com desconto: </span>
                <span className="font-semibold text-emerald-600">
                  R$ {discountedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {(financial.paymentModel === 'parcelado' || financial.paymentModel === 'hibrido') &&
              financial.installments && (
                <div>
                  <span className="text-muted-foreground">Parcela: </span>
                  <span className="font-semibold text-foreground">
                    R${' '}
                    {(financial.basePrice / financial.installments).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="card p-5 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Descrição do modelo financeiro</h3>
        <textarea
          value={financial.description}
          onChange={(e) => updateFinancial({ description: e.target.value })}
          rows={3}
          className="input-base w-full resize-none"
          placeholder="Descreva as condições de pagamento para o paciente..."
        />
      </div>
    </div>
  );
}
