/** Quote a PostgREST value separately from escaping SQL LIKE metacharacters. */
export function literalContainsFilter(value: string): string {
  const literal = value.slice(0, 120).replace(/[\\%_*]/g, '\\$&');
  return `"%${literal.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`;
}
