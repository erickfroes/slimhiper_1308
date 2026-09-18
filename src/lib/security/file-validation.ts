const IMAGE_BUCKETS = new Set([
  'progress-photos',
  'meal-photos',
  'patient-profile-photos',
  'user-profile-avatars',
]);
const DOCUMENT_BUCKETS = new Set([
  'patient-documents',
  'clinical-attachments',
  'payment-receipts',
  'chat-attachments',
]);

export function validateUploadBytes(bytes: Uint8Array, mime: string, bucket: string) {
  if (!IMAGE_BUCKETS.has(bucket) && !DOCUMENT_BUCKETS.has(bucket))
    throw new Error('upload_bucket_forbidden');
  const maxBytes =
    bucket === 'meal-photos' || bucket.includes('profile')
      ? 5_242_880
      : bucket === 'progress-photos'
        ? 8_388_608
        : 10_485_760;
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new Error('upload_size_invalid');
  const starts = (signature: number[]) => signature.every((value, i) => bytes[i] === value);
  const text = (start: number, end: number) =>
    new TextDecoder('ascii').decode(bytes.slice(start, end));
  let detected: string | null = null;
  if (starts([0xff, 0xd8, 0xff]) && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9)
    detected = 'image/jpeg';
  else if (
    starts([137, 80, 78, 71, 13, 10, 26, 10]) &&
    text(bytes.length - 8, bytes.length - 4) === 'IEND'
  )
    detected = 'image/png';
  else if (
    bytes.length >= 16 &&
    text(0, 4) === 'RIFF' &&
    text(8, 12) === 'WEBP' &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8 ===
      bytes.length
  )
    detected = 'image/webp';
  else if (
    text(0, 5) === '%PDF-' &&
    /%%EOF\s*$/.test(text(Math.max(0, bytes.length - 1024), bytes.length))
  ) {
    detected = 'application/pdf';
    // Active PDF features are not supported by this clinical upload contract.
    const pdf = text(0, bytes.length).replace(/#([0-9a-f]{2})/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    );
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction)\b/i.test(pdf))
      throw new Error('active_pdf_forbidden');
  }
  if (
    !detected ||
    detected !== mime ||
    (IMAGE_BUCKETS.has(bucket) && !detected.startsWith('image/')) ||
    (bucket === 'patient-documents' && detected !== 'application/pdf')
  )
    throw new Error('upload_type_mismatch');
  return { mime: detected, size: bytes.byteLength };
}
