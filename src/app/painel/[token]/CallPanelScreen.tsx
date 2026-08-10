'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, Clock3, Volume2 } from 'lucide-react';
import { getCallPanelSnapshot, type CallPanelSnapshot } from '@/services/callPanelApi';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value)
  );
}

function playCallTone() {
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.55);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.55);
  } catch {
    // Browsers may block audio until a visitor interacts with the page.
  }
}

export default function CallPanelScreen({ publicToken }: { publicToken: string }) {
  const [snapshot, setSnapshot] = useState<CallPanelSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const lastCallKey = useRef<string | null>(null);
  const hasLoaded = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await getCallPanelSnapshot(publicToken);
        if (!active) return;
        const nextKey = next.currentCall
          ? `${next.currentCall.displayName}:${next.currentCall.roomName}:${next.currentCall.calledAt}`
          : null;
        if (hasLoaded.current && nextKey && nextKey !== lastCallKey.current && next.soundEnabled) {
          playCallTone();
        }
        lastCallKey.current = nextKey;
        hasLoaded.current = true;
        setSnapshot(next);
        setError(null);
      } catch {
        if (active)
          setError('Este painel não está disponível. Confirme se o link ainda está ativo.');
      }
    };

    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), 5000);
    const clockTimer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [publicToken]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <section className="max-w-xl rounded-3xl border border-white/15 bg-white/10 p-8 text-center">
          <BellRing className="mx-auto mb-4 text-cyan-300" size={40} />
          <h1 className="text-2xl font-bold">Painel indisponível</h1>
          <p className="mt-3 text-slate-300">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white sm:px-10">
      <header className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/15 pb-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Chamadas</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            {snapshot?.panelName ?? 'Carregando painel'}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-2xl font-semibold tabular-nums sm:text-4xl">
          <Clock3 size={28} className="text-cyan-300" />
          {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now)}
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 pt-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-h-[50vh] flex-col justify-center rounded-[2rem] border border-cyan-300/35 bg-gradient-to-br from-cyan-500/20 to-blue-700/25 p-8 shadow-2xl sm:p-14">
          {snapshot?.currentCall ? (
            <>
              <div className="mb-7 flex items-center gap-3 text-lg font-semibold uppercase tracking-[0.16em] text-cyan-200">
                <BellRing size={28} />
                Dirija-se à sala
              </div>
              <p className="text-5xl font-black tracking-tight sm:text-7xl lg:text-8xl">
                {snapshot.currentCall.displayName}
              </p>
              <p className="mt-6 text-3xl font-bold text-cyan-100 sm:text-5xl">
                {snapshot.currentCall.roomName}
              </p>
              <p className="mt-6 flex items-center gap-2 text-lg text-slate-200">
                <Volume2 size={20} /> Chamada às {formatTime(snapshot.currentCall.calledAt)}
              </p>
            </>
          ) : (
            <div className="text-center">
              <BellRing className="mx-auto text-cyan-300" size={64} />
              <h2 className="mt-6 text-3xl font-bold">Aguardando próxima chamada</h2>
              <p className="mt-3 text-lg text-slate-300">Acompanhe este painel para ser chamado.</p>
            </div>
          )}
        </div>

        <aside className="rounded-3xl border border-white/15 bg-white/5 p-6">
          <h2 className="text-lg font-bold">Chamadas recentes</h2>
          <div className="mt-5 space-y-3">
            {snapshot?.recentCalls.slice(1, 5).map((call) => (
              <div
                key={`${call.displayName}-${call.calledAt}`}
                className="rounded-2xl bg-white/10 p-4"
              >
                <p className="text-lg font-bold">{call.displayName}</p>
                <p className="mt-1 text-sm text-cyan-200">{call.roomName}</p>
                <p className="mt-2 text-xs text-slate-400">{formatTime(call.calledAt)}</p>
              </div>
            ))}
            {snapshot && snapshot.recentCalls.length <= 1 ? (
              <p className="text-sm text-slate-400">Nenhuma outra chamada recente.</p>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
