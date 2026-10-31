// Numéros de téléphone lisibles, au fur et à mesure de la saisie :
//   suisse      0791234567     → 079 123 45 67
//   avec +41    +41791234567   → +41 79 123 45 67  (0041… et +41 0… acceptés)
//   autre pays  +51 987 654 321 → laissé tel que tapé (formats trop variés)

const group = (d: string, sizes: number[]) => {
  const out: string[] = []; let i = 0;
  for (const n of sizes) { if (i >= d.length) break; out.push(d.slice(i, i + n)); i += n; }
  if (i < d.length) out.push(d.slice(i));
  return out.join(' ');
};

export function formatPhone(x: string): string {
  const raw = (x ?? '').trim();
  if (!raw) return '';
  let d = raw.replace(/\D/g, '');
  const plus = raw.startsWith('+') || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);
  if (plus) {
    if (!d.startsWith('41')) return raw.replace(/[^\d+ ]/g, '').replace(/\s+/g, ' ');
    let rest = d.slice(2);
    if (rest.startsWith('0')) rest = rest.slice(1);
    return ('+41 ' + group(rest.slice(0, 9), [2, 3, 2, 2])).trim();
  }
  return group(d.slice(0, 15), [3, 3, 2, 2]);
}
