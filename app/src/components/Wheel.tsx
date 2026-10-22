import { useRef } from 'react';

interface Props {
  count: number;                       // nombre de valeurs possibles (index 0..count-1)
  index: number;
  onChange: (i: number) => void;
  label: (i: number) => string;
  rowHeight?: number;
  visible?: number;                    // lignes visibles (impair)
  color?: string;                      // couleur de la valeur centrale
  bandColor?: string;
  bandBorder?: string;
  ariaLabel: string;
  centerSize?: number;
  /** sens : true = les grandes valeurs sont en haut (températures) */
  reverse?: boolean;
}

/** Molette tactile façon iPhone : glisser, molette souris ou flèches clavier. */
export function Wheel({ count, index, onChange, label, rowHeight = 44, visible = 5, color = '#000', bandColor = '#F2F2F7',
  bandBorder, ariaLabel, centerSize = 40, reverse = false }: Props) {
  const drag = useRef<{ y: number; acc: number } | null>(null);
  const half = Math.floor(visible / 2);
  const set = (i: number) => onChange(Math.max(0, Math.min(count - 1, i)));
  const up = reverse ? 1 : -1;             // pas d'index pour aller vers la valeur affichée au-dessus

  const rows = [];
  for (let d = -half; d <= half; d++) {
    const i = reverse ? index - d : index + d;   // d < 0 = au-dessus
    const a = Math.abs(d);
    rows.push(
      <div key={d} style={{ height: rowHeight, display: 'flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums',
        fontSize: a === 0 ? centerSize : a === 1 ? Math.max(15, Math.round(centerSize * 0.55)) : Math.max(13, Math.round(centerSize * 0.45)),
        fontWeight: a === 0 ? 600 : 400, color: a === 0 ? color : '#8E8E93', opacity: a === 0 ? 1 : a === 1 ? 0.75 : 0.4 }}>
        {i >= 0 && i < count ? label(i) : ''}
      </div>,
    );
  }

  return (
    <div className="wheel" role="slider" aria-label={ariaLabel} aria-valuetext={label(index)} tabIndex={0}
      style={{ height: rowHeight * visible }}
      onWheel={(e) => set(index + (e.deltaY > 0 ? -up : up))}
      onKeyDown={(e) => { if (e.key === 'ArrowUp') set(index + up); if (e.key === 'ArrowDown') set(index - up); }}
      onPointerDown={(e) => { drag.current = { y: e.clientY, acc: 0 }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        const g = drag.current; if (!g) return;
        g.acc += e.clientY - g.y; g.y = e.clientY;
        const steps = Math.trunc(g.acc / (rowHeight * 0.33));
        if (steps) { g.acc -= steps * rowHeight * 0.33; set(index + steps * up); }
      }}
      onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      <div className="band" style={{ top: rowHeight * half, height: rowHeight, background: bandColor, border: bandBorder ? `2px solid ${bandBorder}` : undefined }} />
      <div className="rows">{rows}</div>
      <div className="fade-top" style={{ height: rowHeight * half * 0.5 }} />
      <div className="fade-bottom" style={{ height: rowHeight * half * 0.5 }} />
    </div>
  );
}
