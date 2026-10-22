// Lecture d'étiquette : extrait lot, date limite et fournisseur du texte reconnu (OCR).
// Rien n'est inventé : un champ non trouvé reste vide, et tout champ trouvé est à vérifier (bleu).

export interface LabelFields { supplier?: string; lot?: string; dlc?: string }

const DATE = /(\d{1,2})\s*[.\/\-]\s*(\d{1,2})\s*[.\/\-]\s*(\d{4}|\d{2})\b/g;
const DLC_HINT = /(consommer|jusqu|DLC|DDM|use by|best before|verbrauchen|mindestens|haltbar|exp|cons\.)/i;
const LOT = /(?:\bLOT\b|\bLote\b|\bCharge\b|\bL\s*[:.]|\bN°\s*de\s*lot)\s*[:.#°n]*\s*([A-Z0-9][A-Z0-9\-\/.]{2,19})/i;

function toIso(d: number, m: number, y: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseLabel(text: string, suppliers: string[], today = new Date()): LabelFields {
  const out: LabelFields = {};
  const lot = text.match(LOT);
  if (lot) out.lot = lot[1].replace(/[.\-\/]+$/, '').toUpperCase();

  // Dates : priorité à celle placée sur la même ligne qu'une mention « à consommer jusqu'au », « DLC »…
  const lines = text.split(/\n/);
  const found: { iso: string; hint: boolean }[] = [];
  for (const line of lines) for (const m of line.matchAll(DATE)) {
    const iso = toIso(+m[1], +m[2], +m[3]);
    if (iso) found.push({ iso, hint: DLC_HINT.test(line) });
  }
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const hinted = found.find((f) => f.hint);
  const future = found.filter((f) => new Date(f.iso).getTime() >= t0 - 86_400_000).sort((a, b) => b.iso.localeCompare(a.iso));
  out.dlc = hinted?.iso ?? future[0]?.iso ?? undefined;
  if (!out.dlc) delete out.dlc;

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const flat = norm(text);
  const sup = suppliers.find((s) => { const k = norm(s.replace(/\b(sarl|sàrl|sa|ag|gmbh)\b/gi, '')); return k.length >= 4 && flat.includes(k); });
  if (sup) out.supplier = sup;
  return out;
}
