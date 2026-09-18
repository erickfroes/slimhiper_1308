/** Spreadsheet cells must not execute formulas, even after leading controls. */
export function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  const safeText = /^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}
