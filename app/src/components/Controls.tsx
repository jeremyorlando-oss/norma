import { useT } from '../i18n';
import type { ReactNode } from 'react';

export function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT();
  return <div className="topbar"><button className="link" onClick={onBack}>‹ {t('Retour')}</button><span className="title">{title}</span><span style={{ width: 70 }} /></div>;
}

export function Segmented<T extends string>({ value, options, onChange, label }:
  { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, background: '#E3E3E8', borderRadius: 9, padding: 2 }}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          style={{ height: 34, border: 'none', borderRadius: 7, fontSize: 15, background: value === o.value ? '#fff' : 'transparent', fontWeight: value === o.value ? 600 : 400, color: '#000' }}>
          {o.label}</button>))}
    </div>
  );
}

/** Interrupteur OUI (vert) / NON (rouge), NON par défaut (D25). */
export function YesNo({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onToggle}
      style={{ width: 80, height: 32, border: 'none', borderRadius: 16, padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexDirection: on ? 'row' : 'row-reverse', background: on ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', padding: '0 7px' }}>{on ? 'OUI' : 'NON'}</span>
      <span style={{ width: 28, height: 28, borderRadius: 14, background: '#fff' }} />
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="row" style={{ minHeight: 48 }}><span style={{ width: 96, fontSize: 16 }}>{label}</span>{children}</label>;
}

export const inputStyle = { flex: 1, minWidth: 0, border: 'none', fontFamily: 'inherit', fontSize: 16, background: 'transparent', color: '#000', textAlign: 'right' } as const;
