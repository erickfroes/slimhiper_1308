'use client';

import React from 'react';
import { CreditCard, DollarSign } from 'lucide-react';
import type { ProgramBuilderDraft } from '@/domain/types';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

export default function StepFinanceiro({ draft, onChange }: Props) {
  const { financial } = draft;

  const updateFinancial = (patch: Partial<typeof financial>) => {
    onChange({
      financial: {
        ...financial,
        paymentModel: 'checkout_pro',
        pricingModel: 'fixed_price_provider_installments',
        ...patch,
      },
    });
  };

  const maxInstallments = Math.min(
    12,
    Math.max(1, Math.trunc(Number(financial.maxInstallments ?? financial.installments ?? 12)))
  );

  return (
    <div className="space-y-5">
      {/* Pricing */}
      <div className="card-base p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Preço fixo Mercado Pago</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Valor do programa (R$)
            </label>
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

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Parcelas máximas no Mercado Pago
            </label>
            <input
              type="number"
              min={1}
              max={12}
              value={maxInstallments}
              onChange={(e) =>
                updateFinancial({
                  maxInstallments: Number(e.target.value),
                  installments: Number(e.target.value),
                })
              }
              className="input-base w-full"
            />
          </div>
        </div>

        {/* Price preview */}
        <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
          <CreditCard size={16} className="text-muted-foreground flex-shrink-0" />
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Preço do link: </span>
              <span className="font-semibold text-foreground">
                R$ {financial.basePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Checkout Pro: </span>
              <span className="font-semibold text-foreground">até {maxInstallments}x</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="card-base p-5 space-y-2">
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
