/** Browser facade: files cannot be written to private buckets directly anymore. */
export async function secureUpload(bucket: string, path: string, file: File) {
  try {
    const response = await fetch('/api/security/uploads', {
      method: 'POST',
      credentials: 'same-origin',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'x-upload-bucket': bucket,
        'x-upload-path': path,
      },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.error)
      return { error: { message: result?.error?.message || 'Upload seguro indisponivel.' } };
    return { error: null };
  } catch {
    return { error: { message: 'Falha de conexao durante o upload seguro.' } };
  }
}
