import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { withSecureRoute } from '@/lib/security/route';
import { validateUploadBytes } from '@/lib/security/file-validation';
import { scanWithClamAv } from '@/lib/security/clamav';

async function upload(request: Request) {
  const client = await createClient();
  const admin = createSupabaseAdminClient();
  if (!client || !admin)
    return Response.json({ error: { message: 'upload_unavailable' } }, { status: 503 });
  const bucket = request.headers.get('x-upload-bucket') || '';
  const path = request.headers.get('x-upload-path') || '';
  const mime = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const bytes = new Uint8Array(await request.arrayBuffer()); // Already bounded by withSecureRoute.
  try {
    validateUploadBytes(bytes, mime, bucket);
  } catch {
    return Response.json(
      {
        error: {
          message: 'Arquivo invalido ou formato nao permitido. Use PDF, JPEG, PNG ou WebP.',
        },
      },
      { status: 415 }
    );
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  const { data: reservation, error: reserveError } = await client.rpc('reserve_secure_upload', {
    p_bucket: bucket,
    p_path: path,
    p_size: bytes.length,
    p_mime: mime,
    p_sha256: hash,
  });
  if (reserveError || typeof reservation !== 'string') {
    return Response.json(
      { error: { message: 'Upload nao autorizado, duplicado ou cota excedida.' } },
      {
        status: reserveError?.code === '54000' ? 429 : 403,
        headers: reserveError?.code === '54000' ? { 'Retry-After': '3600' } : {},
      }
    );
  }
  const quarantinePath = `${reservation}/pending`;
  let quarantined = false;
  let promoted = false;
  try {
    const { error } = await admin.storage
      .from('upload-quarantine')
      .upload(quarantinePath, bytes, { contentType: 'application/octet-stream', upsert: false });
    if (error) throw new Error('quarantine_unavailable');
    quarantined = true;
    await scanWithClamAv(bytes);
    const { data: stillAllowed, error: permissionError } = await client.rpc(
      'can_submit_secure_upload',
      { p_bucket: bucket, p_path: path }
    );
    if (permissionError || !stillAllowed) throw new Error('upload_rejected');
    const { error: targetError } = await admin.storage.from(bucket).upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: 'private, max-age=0',
    });
    if (targetError) throw new Error('upload_unavailable');
    promoted = true;
    const { error: finishError } = await admin.rpc('finish_secure_upload', {
      p_id: reservation,
      p_status: 'uploaded',
    });
    if (finishError) throw new Error('upload_audit_unavailable');
    return Response.json({ data: { uploaded: true }, error: null });
  } catch (error) {
    const rejected = error instanceof Error && error.message === 'upload_rejected';
    if (!promoted)
      await admin.rpc('finish_secure_upload', {
        p_id: reservation,
        p_status: rejected ? 'rejected' : 'failed',
      });
    // Fail closed: scanner outage is never interpreted as a clean verdict.
    return Response.json(
      {
        data: null,
        error: {
          message: rejected
            ? 'Arquivo rejeitado.'
            : 'Verificacao segura indisponivel. Tente novamente com um novo envio.',
        },
      },
      { status: rejected ? 422 : 503 }
    );
  } finally {
    if (quarantined) await admin.storage.from('upload-quarantine').remove([quarantinePath]);
  }
}

export const POST = withSecureRoute(upload, {
  scope: 'security:upload',
  binary: true,
  maxBytes: 10_485_760,
  limit: 10,
});
