'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface WeightDataPoint {
  week: number;
  weightKg: number;
  date: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-foreground mb-1">Semana {label}</p>
      <p className="text-muted-foreground">
        Peso: <span className="font-bold text-foreground tabular-nums">{payload[0].value} kg</span>
      </p>
    </div>
  );
}

interface WeightEvolutionChartProps {
  data: WeightDataPoint[];
  goalWeightKg: number;
}

export default function WeightEvolutionChart({ data, goalWeightKg }: WeightEvolutionChartProps) {
  const minWeight = Math.min(...data.map((d) => d.weightKg), goalWeightKg) - 2;
  const maxWeight = Math.max(...data.map((d) => d.weightKg)) + 1;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="week"
          tickFormatter={(v) => `Sem ${v}`}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[minWeight, maxWeight]}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}kg`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={goalWeightKg}
          stroke="var(--accent)"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{ value: `Meta: ${goalWeightKg}kg`, position: 'right', fontSize: 10, fill: 'var(--accent)' }}
        />
        <Line
          type="monotone"
          dataKey="weightKg"
          stroke="var(--primary)"
          strokeWidth={2.5}
          dot={{ fill: 'var(--primary)', r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: 'var(--primary)' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}