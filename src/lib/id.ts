export function newId(prefix: string): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
