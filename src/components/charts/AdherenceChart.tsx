'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';

interface AdherenceDataPoint {
  week: number;
  adherencePercent: number;
  label: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">
        Adesão: <span className="font-bold text-foreground tabular-nums">{payload[0].value}%</span>
      </p>
    </div>
  );
}

interface AdherenceChartProps {
  data: AdherenceDataPoint[];
}

function getBarColor(value: number): string {
  if (value >= 85) return 'var(--positive)';
  if (value >= 70) return 'var(--primary)';
  if (value >= 55) return 'var(--warning)';
  return 'var(--negative)';
}

export default function AdherenceChart({ data }: AdherenceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={80} stroke="var(--border)" strokeDasharray="3 3" />
        <Bar dataKey="adherencePercent" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getBarColor(entry.adherencePercent)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
