'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import DataState from '@/components/ui/DataState';
import Dialog from '@/components/ui/Dialog';
import {
  getPatientCommunityComments,
  getPatientCommunityFeed,
  reportCommunityContent,
  submitPatientCommunityComment,
  submitPatientCommunityPost,
  type CommunityItemType,
  type PatientCommunityComment,
  type PatientCommunityFeed,
  type PatientCommunityPost,
} from '@/services/communityApi';
import type { PatientPortalSnapshot } from '@/services/patientPortalApi';

interface PatientCommunitySectionProps {
  snapshot: PatientPortalSnapshot;
  onActionMessage: (message: string | null) => void;
}

type ReportTarget = {
  itemType: CommunityItemType;
  id: string;
  label: string;
} | null;

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Aguardando moderacao',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  approved: {
    label: 'Publicado',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  rejected: {
    label: 'Rejeitado',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  hidden: {
    label: 'Oculto',
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  removed: {
    label: 'Removido',
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  },
};

function formatDateTime(value?: string | null) {
  if (!value) return 'Agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function moderationLabel(status: string) {
  return statusConfig[status] ?? statusConfig.pending;
}

function moderationMessage(status: string) {
  if (status === 'approved') return 'Publicado na comunidade.';
  if (status === 'rejected') return 'A equipe revisou e rejeitou este conteudo.';
  return 'Enviado para a fila de moderacao da equipe.';
}

export default function PatientCommunitySection({
  snapshot,
  onActionMessage,
}: PatientCommunitySectionProps) {
  const [feed, setFeed] = useState<PatientCommunityFeed | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postBody, setPostBody] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [commentsPost, setCommentsPost] = useState<PatientCommunityPost | null>(null);
  const [comments, setComments] = useState<PatientCommunityComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget>(null);
  const [reportReason, setReportReason] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const selectedProgram = useMemo(
    () => feed?.programs.find((program) => program.id === selectedProgramId) ?? null,
    [feed?.programs, selectedProgramId]
  );

  const loadFeed = useCallback(
    async (programId?: string | null) => {
      setLoading(true);
      setError(null);
      const response = await getPatientCommunityFeed(snapshot.selectedPatientId, programId ?? null);
      if (response.error || !response.data) {
        setFeed(null);
        setError(response.error?.message ?? 'Nao foi possivel carregar a comunidade.');
      } else {
        setFeed(response.data);
        setSelectedProgramId(response.data.selectedProgramId ?? null);
      }
      setLoading(false);
    },
    [snapshot.selectedPatientId]
  );

  useEffect(() => {
    void loadFeed(null);
  }, [loadFeed]);

  async function handleProgramChange(programId: string) {
    setSelectedProgramId(programId);
    await loadFeed(programId);
  }

  async function handleSubmitPost() {
    if (!selectedProgramId || busyKey === 'post' || !postBody.trim()) return;

    setBusyKey('post');
    onActionMessage(null);
    const response = await submitPatientCommunityPost(
      snapshot.selectedPatientId,
      selectedProgramId,
      postBody
    );
    if (response.error || !response.data) {
      onActionMessage(response.error?.message ?? 'Nao foi possivel publicar.');
    } else {
      setPostBody('');
      onActionMessage(moderationMessage(response.data.status));
      await loadFeed(selectedProgramId);
    }
    setBusyKey(null);
  }

  async function openComments(post: PatientCommunityPost) {
    setCommentsPost(post);
    setComments([]);
    setCommentBody('');
    setCommentsError(null);
    setCommentsLoading(true);
    const response = await getPatientCommunityComments(post.id);
    if (response.error || !response.data) {
      setCommentsError(response.error?.message ?? 'Nao foi possivel carregar comentarios.');
    } else {
      setComments(response.data);
    }
    setCommentsLoading(false);
  }

  async function handleSubmitComment() {
    if (!commentsPost || !commentBody.trim() || busyKey === `comment-${commentsPost.id}`) return;

    setBusyKey(`comment-${commentsPost.id}`);
    const response = await submitPatientCommunityComment(commentsPost.id, commentBody);
    if (response.error || !response.data) {
      setCommentsError(response.error?.message ?? 'Nao foi possivel enviar comentario.');
    } else {
      setCommentBody('');
      setComments((current) => [...current, response.data as PatientCommunityComment]);
      onActionMessage(moderationMessage(response.data.status));
      await loadFeed(selectedProgramId);
    }
    setBusyKey(null);
  }

  async function handleReport() {
    if (!reportTarget || !reportReason.trim() || busyKey === 'report') return;

    setBusyKey('report');
    const response = await reportCommunityContent(
      reportTarget.itemType,
      reportTarget.id,
      reportReason
    );
    if (response.error) {
      onActionMessage(response.error.message);
    } else {
      onActionMessage('Denuncia enviada para revisao da equipe.');
      setReportTarget(null);
      setReportReason('');
      await loadFeed(selectedProgramId);
    }
    setBusyKey(null);
  }

  if (loading) {
    return (
      <DataState
        kind="loading"
        title="Carregando comunidade"
        description="Buscando publicacoes liberadas para o seu programa."
        className="bg-background"
      />
    );
  }

  if (error) {
    return (
      <DataState
        kind="error"
        title="Comunidade indisponivel"
        description={error}
        actionLabel="Tentar novamente"
        onAction={() => void loadFeed(selectedProgramId)}
        className="bg-background"
      />
    );
  }

  if (!feed || feed.accessStatus !== 'enabled' || feed.programs.length === 0) {
    return (
      <DataState
        kind="empty"
        title="Comunidade nao liberada"
        description="Este vinculo ainda nao possui comunidade ativa no programa."
        actionLabel="Atualizar"
        onAction={() => void loadFeed(null)}
        className="bg-background"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Comunidade do programa</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Espaco moderado para trocas entre participantes do mesmo programa.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {feed.programs.length > 1 ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              Programa
              <select
                value={selectedProgramId ?? ''}
                onChange={(event) => void handleProgramChange(event.target.value)}
                className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {feed.programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => void loadFeed(selectedProgramId)}
            className="btn-secondary justify-center"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {feed.prompt?.title ?? 'Diretriz da comunidade'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {feed.prompt?.body ??
                'Compartilhe experiencias gerais e procure a equipe pelo chat em situacoes individuais ou sensiveis.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {feed.guidelines.map((guideline) => (
                <span
                  key={guideline}
                  className="rounded-full border border-primary/20 bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {guideline}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Nova publicacao</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedProgram?.moderationEnabled
                ? 'A equipe revisa conteudos antes da publicacao.'
                : 'Este programa publica automaticamente, com triagem quando houver risco.'}
            </p>
          </div>
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {postBody.length}/1200
          </span>
        </div>
        <textarea
          ref={composerRef}
          value={postBody}
          onChange={(event) => setPostBody(event.target.value.slice(0, 1200))}
          rows={4}
          className="input-base min-h-28 resize-y bg-card"
          placeholder="Compartilhe uma conquista, duvida geral ou aprendizado do programa."
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Use o chat para situacoes individuais, sintomas ou duvidas clinicas especificas.
          </p>
          <button
            type="button"
            onClick={() => void handleSubmitPost()}
            disabled={!postBody.trim() || busyKey === 'post'}
            className="btn-primary justify-center"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {busyKey === 'post' ? 'Enviando...' : 'Publicar'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {feed.posts.length === 0 ? (
          <DataState
            kind="empty"
            title="Nenhuma publicacao ainda"
            description="Quando houver conteudo aprovado para este programa, ele aparece aqui."
            className="bg-background"
          />
        ) : (
          feed.posts.map((post) => {
            const status = moderationLabel(post.status);
            return (
              <article key={post.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{post.authorLabel}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(post.createdAt)}
                      </span>
                      {post.isOwn ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      ) : null}
                      {post.riskFlag ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          Triagem
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-foreground">
                      {post.body}
                    </p>
                    {post.moderationReason && post.isOwn ? (
                      <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {post.moderationReason}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void openComments(post)}
                    disabled={post.status !== 'approved'}
                    className="btn-secondary min-h-10 justify-center px-3 py-2"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Comentarios {post.commentCount > 0 ? post.commentCount : ''}
                  </button>
                  {post.status === 'approved' ? (
                    <button
                      type="button"
                      onClick={() =>
                        setReportTarget({
                          itemType: 'post',
                          id: post.id,
                          label: 'publicacao',
                        })
                      }
                      className="btn-ghost min-h-10 justify-center px-3 py-2"
                    >
                      <Flag className="h-4 w-4" aria-hidden="true" />
                      Denunciar
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </section>

      <Dialog
        open={Boolean(commentsPost)}
        title="Comentarios"
        description={commentsPost?.body.slice(0, 120)}
        placement="bottom"
        onOpenChange={(open) => {
          if (!open) setCommentsPost(null);
        }}
      >
        <div className="space-y-4">
          {commentsLoading ? (
            <DataState
              kind="loading"
              title="Carregando comentarios"
              className="min-h-32 bg-background"
            />
          ) : commentsError ? (
            <DataState
              kind="error"
              title="Comentarios indisponiveis"
              description={commentsError}
              className="min-h-32 bg-background"
            />
          ) : comments.length === 0 ? (
            <DataState
              kind="empty"
              title="Sem comentarios"
              description="Seja a primeira pessoa a contribuir nesta conversa."
              className="min-h-32 bg-background"
            />
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => {
                const status = moderationLabel(comment.status);
                return (
                  <article key={comment.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{comment.authorLabel}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(comment.createdAt)}
                      </span>
                      {comment.isOwn ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-foreground">
                      {comment.body}
                    </p>
                    {comment.moderationReason && comment.isOwn ? (
                      <p className="mt-2 text-xs text-red-700">{comment.moderationReason}</p>
                    ) : null}
                    {comment.status === 'approved' ? (
                      <button
                        type="button"
                        onClick={() =>
                          setReportTarget({
                            itemType: 'comment',
                            id: comment.id,
                            label: 'comentario',
                          })
                        }
                        className="btn-ghost mt-2 min-h-9 px-2 py-1 text-xs"
                      >
                        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                        Denunciar
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-border bg-background p-3">
            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value.slice(0, 800))}
              rows={3}
              className="input-base bg-card"
              placeholder="Escreva um comentario objetivo."
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">{commentBody.length}/800</span>
              <button
                type="button"
                onClick={() => void handleSubmitComment()}
                disabled={!commentBody.trim() || busyKey === `comment-${commentsPost?.id}`}
                className="btn-primary justify-center"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Comentar
              </button>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(reportTarget)}
        title="Denunciar conteudo"
        description={`A equipe vai revisar este ${reportTarget?.label ?? 'conteudo'} antes de qualquer acao.`}
        onOpenChange={(open) => {
          if (!open) {
            setReportTarget(null);
            setReportReason('');
          }
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setReportTarget(null);
                setReportReason('');
              }}
              className="btn-secondary justify-center"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleReport()}
              disabled={!reportReason.trim() || busyKey === 'report'}
              className="btn-primary justify-center"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Enviar denuncia
            </button>
          </div>
        }
      >
        <label className="block text-sm font-medium text-foreground">
          Motivo
          <textarea
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value.slice(0, 500))}
            rows={4}
            className="input-base mt-2"
            placeholder="Explique de forma objetiva o que deve ser revisado."
          />
        </label>
      </Dialog>
    </div>
  );
}
