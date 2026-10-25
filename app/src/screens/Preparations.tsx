import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import type { Api, Lot, Recipe, Session } from '../api/types';
import { TopBar } from '../components/Controls';

const ALLERGENES: Record<string, string> = { oeufs: 'œufs', moutarde: 'moutarde', poisson: 'poisson', lait: 'lait', gluten: 'gluten' };
const day = (d: Date) => d.toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit' });

export function Preparations({ api, session, onBack }: { api: Api; session: Session; onBack: () => void }) {
  const t = useT();
  const [lots, setLots] = useState<Lot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [opening, setOpening] = useState(false);
  const [opName, setOpName] = useState('');
  const [opDays, setOpDays] = useState(3);
  const [label, setLabel] = useState<{ lot: Lot; recipe: Recipe } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.lots(new Date()).then(setLots), [api]);
  useEffect(() => { load(); api.recipes().then(setRecipes); }, [api, load]);
  const canThrow = session.droits.includes('jeter_lot');

  const produce = async (r: Recipe) => {
    try { const lot = await api.preparation(session.token, r.id); setLabel({ lot, recipe: r }); setPicking(false); load(); }
    catch (e) { setError(t((e as Error).message)); setPicking(false); }
  };
  const jeter = async (l: Lot) => {
    try { await api.jeterLot(session.token, l.id); setConfirm(null); load(); } catch (e) { setError(t((e as Error).message)); }
  };

  const labelEl = (cls: string) => label && (
      <div className={cls} style={{ alignSelf: 'center', width: 320, background: '#fff', border: '1.5px dashed #8E8E93', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'Helvetica, Arial, sans-serif', color: '#000' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ fontSize: 18 }}>{label.recipe.name.toUpperCase()}</b><span style={{ fontSize: 12 }}>{t('≤ 4 °C')}</span></div>
        <b style={{ fontSize: 15 }}>{t('LOT')} {label.lot.lotCode}</b>
        <span style={{ fontSize: 13 }}>{t('Produit le :')} {label.lot.producedOn.toLocaleDateString('fr-CH')} · {label.lot.by}</span>
        <b style={{ fontSize: 15 }}>{t('À utiliser jusqu’au :')} {label.lot.useBy.toLocaleDateString('fr-CH')}</b>
        <span style={{ fontSize: 12 }}>{t('Allergènes :')} {label.recipe.allergens.length ? label.recipe.allergens.map((a) => ALLERGENES[a] ?? a).join(', ') : 'aucun déclaré'}</span>
      </div>
  );
  if (label) return (
    <div className="screen">
      <TopBar title={t('Étiquette')} onBack={() => setLabel(null)} />
      {labelEl('print-label')}
      {createPortal(labelEl('print-label print-only'), document.body)}
      <p className="note" style={{ textAlign: 'center' }}>{t('Allergènes de la démo à valider avec les étiquettes des produits.')}</p>
      <div style={{ marginTop: 'auto' }}><button className="btn btn-primary" onClick={() => window.print()}>{t('Imprimer l’étiquette')}</button></div>
    </div>
  );

  const groups: [Lot['status'], string, string][] = [['a_jeter', 'À jeter · limite dépassée', 'var(--red)'], ['aujourd_hui', 'À utiliser aujourd’hui', '#000'], ['a_garder', 'À garder', 'var(--green)'], ['jete', 'Jetés', 'var(--text-3)']];
  return (
    <div className="screen">
      <TopBar title={t('Préparations')} onBack={onBack} />
      {picking ? (
        <>
          <div className="section-label">{t('Nouvelle préparation')}</div>
          <div className="group">
            {recipes.map((r) => <button key={r.id} className="row" style={{ width: '100%', border: 'none', background: '#fff', fontSize: 17, textAlign: 'left' }} onClick={() => produce(r)}>
              <span className="grow"><span className="main">{r.name}</span><span className="sub">{r.code} {t('· J+')}{r.shelfDays}</span></span>›</button>)}
          </div>
          <button className="link" onClick={() => setPicking(false)}>{t('Annuler')}</button>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setPicking(true)}>{t('+ Nouvelle préparation')}</button>
            <button className="btn" style={{ background: '#fff', color: 'var(--blue)' }} onClick={() => setOpening(!opening)}>{t('+ Produit entamé')}</button>
          </div>
          {opening && (
            <div className="group">
              <label className="row"><span style={{ width: 110 }}>{t('Produit')}</span><input value={opName} onChange={(e) => setOpName(e.target.value)} placeholder={t('ex. Mayonnaise 5 kg')} style={{ flex: 1, border: 'none', fontSize: 16, fontFamily: 'inherit' }} /></label>
              <label className="row"><span style={{ width: 110 }}>{t('Après ouverture')}</span><input type="number" min={0} max={60} value={opDays} onChange={(e) => setOpDays(Number(e.target.value))} style={{ width: 60, border: 'none', fontSize: 16 }} /> {t('jours (selon l’étiquette)')}</label>
              <button className="row link" style={{ width: '100%' }} disabled={opName.trim().length < 2} onClick={async () => {
                try { const lot = await api.openProduct(session.token, opName.trim(), opDays); setOpening(false); setOpName(''); load();
                  setLabel({ lot, recipe: { id: '', name: lot.recipeName, code: '', shelfDays: opDays, allergens: [] } }); } catch (e) { setError(t((e as Error).message)); }
              }}>{t('Créer l’étiquette « ouvert le »')}</button>
            </div>)}
          {groups.map(([st, title, color]) => {
            const list = lots.filter((l) => l.status === st);
            if (!list.length) return null;
            return (
              <div key={st} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="section-label" style={{ color, fontWeight: 600 }}>{title}</span>
                <div className="group">
                  {list.map((l) => (
                    <div className="row" key={l.id}>
                      <span className="grow"><span className="main">{l.recipeName}</span>
                        <span className="sub" style={{ fontVariantNumeric: 'tabular-nums' }}>{t('Lot')} {l.lotCode} {t('· limite')} {day(l.useBy)}{l.disposed ? ` · jeté par ${l.disposed.by}` : ''}</span></span>
                      {canThrow && !l.disposed && (st === 'a_jeter' || st === 'aujourd_hui') && (confirm === l.id
                        ? <button onClick={() => jeter(l)} style={{ height: 36, padding: '0 12px', borderRadius: 18, border: '2px solid var(--red)', background: '#fff', color: 'var(--red)', fontSize: 15, fontWeight: 600 }}>{t('Confirmer ?')}</button>
                        : <button onClick={() => setConfirm(l.id)} style={{ height: 36, padding: '0 14px', borderRadius: 18, border: 'none', background: 'var(--red)', color: '#fff', fontSize: 15, fontWeight: 600 }}>{t('Jeter')}</button>)}
                    </div>))}
                </div>
              </div>);
          })}
        </>
      )}
      <div className="error" role="alert">{error}</div>
    </div>
  );
}
