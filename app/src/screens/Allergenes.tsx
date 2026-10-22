import { useEffect, useState } from 'react';
import type { Api, Dish } from '../api/types';
import { TopBar } from '../components/Controls';

// 14 catégories de l'OIDAl (RS 817.022.16)
export const ALLERGENS: [string, string][] = [
  ['gluten', 'Gluten'], ['crustaces', 'Crustacés'], ['oeufs', 'Œufs'], ['poisson', 'Poisson'], ['arachides', 'Arachides'],
  ['soja', 'Soja'], ['lait', 'Lait'], ['fruits_coque', 'Fruits à coque'], ['celeri', 'Céleri'], ['moutarde', 'Moutarde'],
  ['sesame', 'Sésame'], ['sulfites', 'Sulfites'], ['lupin', 'Lupin'], ['mollusques', 'Mollusques'],
];
const name = (k: string) => ALLERGENS.find(([a]) => a === k)?.[1] ?? k;

export function Allergenes({ api, onBack }: { api: Api; onBack: () => void }) {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [client, setClient] = useState(false);
  useEffect(() => { api.dishes().then(setDishes); }, [api]);

  if (client) return (
    <div className="screen" style={{ background: '#fff', maxWidth: 'none', minHeight: '100vh' }}>
      <div className="topbar"><button className="link" onClick={() => setClient(false)}>‹ Fermer</button><span className="title">Allergènes et origine</span><span style={{ width: 70 }} /></div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 15 }}>
          <thead><tr><th style={{ textAlign: 'left', padding: 8 }}>Plat</th>
            {ALLERGENS.map(([k, l]) => <th key={k} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '8px 4px', fontWeight: 600, fontSize: 13 }}>{l}</th>)}</tr></thead>
          <tbody>{dishes.map((d) => (
            <tr key={d.name} style={{ borderTop: '1px solid var(--sep)' }}>
              <td style={{ padding: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>{d.name}</td>
              {ALLERGENS.map(([k]) => <td key={k} style={{ textAlign: 'center', fontWeight: 700, color: 'var(--red)' }} aria-label={d.allergens.includes(k) ? name(k) : undefined}>{d.allergens.includes(k) ? '●' : ''}</td>)}
            </tr>))}</tbody>
        </table>
      </div>
      <div style={{ padding: '4px 8px', fontSize: 15 }}><b>Origine des viandes · Origin of meat · Origen de la carne :</b> {[...new Set(dishes.map((d) => d.meatOrigin).filter(Boolean))].join(' · ') || '—'}</div>
      <p className="note">Contamination croisée possible. Demandez à notre équipe en cas d’allergie. · Cross-contamination possible, please ask our staff. · Posible contaminación cruzada, consulte a nuestro equipo.</p>
    </div>
  );

  return (
    <div className="screen">
      <TopBar title="Allergènes" onBack={onBack} />
      <p className="note">Lecture seule. Seul le Gérant peut modifier les ingrédients et allergènes. <b>Données d’exemple, à valider avec les étiquettes des produits.</b></p>
      <div className="group">
        {dishes.map((d) => (
          <div key={d.name}>
            <button className="row" style={{ width: '100%', border: 'none', background: '#fff', textAlign: 'left' }} aria-expanded={open === d.name} onClick={() => setOpen(open === d.name ? null : d.name)}>
              <span className="grow"><span className="main">{d.name}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {d.allergens.length ? d.allergens.map((a) => <span key={a} className="pill" style={{ background: '#FFF1E6', color: '#8A3A00' }}>{name(a)}</span>) : <span className="sub">Aucun des 14 allergènes</span>}
                </span></span>
              <span aria-hidden="true" style={{ color: '#C7C7CC' }}>{open === d.name ? '˄' : '˅'}</span>
            </button>
            {open === d.name && <div className="note" style={{ paddingBottom: 12 }}>Ingrédients : {d.ingredients.join(', ')}.<br />{d.meatOrigin && <>Origine : {d.meatOrigin}<br /></>}Non présents : {ALLERGENS.filter(([k]) => !d.allergens.includes(k)).map(([, l]) => l.toLowerCase()).join(', ')}.</div>}
          </div>))}
      </div>
      <div style={{ marginTop: 'auto' }}><button className="btn btn-primary" onClick={() => setClient(true)}>Afficher pour le client</button></div>
    </div>
  );
}
