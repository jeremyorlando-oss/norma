import { useT } from '../i18n';
import { useRef, useState, type RefObject } from 'react';
import { compressPhoto, readBarcode, readLabel } from '../scan/camera';
import type { Api, Session } from '../api/types';
import { Field, inputStyle, TopBar, YesNo } from '../components/Controls';
import { Wheel } from '../components/Wheel';
import { readingStatus } from '../domain/rules';

const CHECKS = ['Emballage intact', 'Aspect et odeur normaux', 'Conforme à la commande', 'Chaîne du froid respectée'];
const REFUS = ['Température trop élevée', 'Emballage endommagé', 'DLC dépassée ou trop proche', 'Aspect / odeur anormal', 'Non conforme à la commande'];
const MIN_T = -300;   // −30,0 °C

export function Reception({ api, session, onBack }: { api: Api; session: Session; onBack: () => void }) {
  const tr = useT();
  const [f, setF] = useState({ supplier: '', product: '', lot: '', dlc: '' });
  const [blue, setBlue] = useState<string[]>([]);            // champs remplis automatiquement (à vérifier)
  const [barcode, setBarcode] = useState<string | null>(null);
  const [t, setT] = useState(30);                             // dixièmes de °C
  const [checks, setChecks] = useState([false, false, false, false]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const labelIn = useRef<HTMLInputElement>(null), codeIn = useRef<HTMLInputElement>(null), slipIn = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const st = readingStatus(t / 10, null, 4);       // réception produits frais : ≤ 4 °C (règle interne)
  const filled = f.supplier && f.product && f.lot && f.dlc;
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setBlue(blue.filter((x) => x !== k)); setError(''); };

  const photoLabel = async (file: File) => {
    setError(''); setBusy(tr('Lecture de l’étiquette…'));
    try {
      const r = await readLabel(file, await api.suppliers());
      const got = (['supplier', 'lot', 'dlc'] as const).filter((k) => r[k]);
      if (!got.length) { setError(tr('Étiquette illisible : saisissez à la main ou reprenez la photo de plus près.')); return; }
      setF({ ...f, ...Object.fromEntries(got.map((k) => [k, r[k]!])) }); setBlue([...new Set([...blue, ...got])]);
    } catch { setError(tr('Lecture impossible (connexion internet nécessaire la première fois).')); }
    finally { setBusy(''); }
  };
  const scan = async (file: File) => {
    setError(''); setBusy(tr('Lecture du code-barres…'));
    const code = await readBarcode(file); setBusy('');
    if (!code) { setError(tr('Code-barres illisible : reprenez la photo bien à plat, de plus près.')); return; }
    setBarcode(code);
    const r = await api.scanBarcode(session.token, code);
    if (r) { setF({ ...f, supplier: r.supplier, product: r.product }); setBlue([...new Set([...blue, 'supplier', 'product'])]); }
    else setError(tr('Nouveau produit : saisissez son nom et son fournisseur une seule fois.'));
  };
  const pick = (ref: RefObject<HTMLInputElement>, fn: (f: File) => void) => (
    <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) fn(x); }} />);
  const submit = async (accepted: boolean, reason: string | null) => {
    try {
      await api.reception(session.token, { ...f, temperature: t / 10, checks: checks as [boolean, boolean, boolean, boolean], accepted,
        refusalReason: reason, photo: !!photo, photoData: photo ?? undefined, autofilled: blue.length > 0, barcode, ownTransport: own });
      setDone(tr(accepted ? 'Réception acceptée' : 'Réception refusée · non-conformité ouverte')); setTimeout(onBack, 1400);
    } catch (e) { setError(tr((e as Error).message)); }
  };

  if (done) return <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><span className="badge vert">✓ {done}</span></div>;
  const blueStyle = (k: string) => (blue.includes(k) ? { ...inputStyle, color: '#004A99', background: '#E5F0FF', borderRadius: 6, padding: '2px 6px' } : inputStyle);

  return (
    <div className="screen">
      <TopBar title={tr('Réception')} onBack={onBack} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button className="btn btn-primary" style={{ height: 44, fontSize: 15 }} disabled={!!busy} onClick={() => labelIn.current?.click()}>{tr('Photo étiquette')}</button>
        <button className="btn" style={{ height: 44, fontSize: 15, background: '#fff', color: 'var(--blue)' }} disabled={!!busy} onClick={() => codeIn.current?.click()}>{tr('Scanner code-barres')}</button>
      </div>
      {pick(labelIn, photoLabel)}{pick(codeIn, scan)}{pick(slipIn, async (x) => setPhoto(await compressPhoto(x)))}
      {busy && <p className="note" role="status">{busy}</p>}
      {barcode && <p className="note">{tr('Code-barres')} : {barcode}</p>}
      <label className="group row" style={{ fontSize: 16 }}>
        <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--blue)' }} />
        <span className="grow"><span>{tr('Achat transporté par nous (Prodega, Aligro…)')}</span><span className="sub">{tr('Glacière / plaques eutectiques · température mesurée à l’arrivée au stand (BPHR 2.5)')}</span></span></label>
      <div className="group">
        <Field label={tr(own ? 'Magasin' : 'Fournisseur')}><input style={blueStyle('supplier')} value={f.supplier} onChange={(e) => set('supplier', e.target.value)} /></Field>
        <Field label={tr('Produit')}><input style={blueStyle('product')} value={f.product} onChange={(e) => set('product', e.target.value)} /></Field>
        <Field label={tr('N° de lot')}><input style={blueStyle('lot')} value={f.lot} onChange={(e) => set('lot', e.target.value)} /></Field>
        <Field label={tr('DLC')}><input type="date" style={blueStyle('dlc')} value={f.dlc} onChange={(e) => set('dlc', e.target.value)} /></Field>
      </div>
      {blue.length > 0 && <p className="note">{tr('En bleu : lu automatiquement. Vérifiez et touchez un champ pour corriger.')}</p>}

      <div className="group" style={{ display: 'flex', alignItems: 'center', paddingLeft: 16 }}>
        <span style={{ width: 96, fontSize: 16 }}>{tr('Température')}</span>
        <div style={{ flex: 1 }}>
          <Wheel ariaLabel="Température de réception" reverse visible={3} rowHeight={34} centerSize={22} count={500} index={t - MIN_T}
            onChange={(i) => setT(i + MIN_T)} label={(i) => ((i + MIN_T) / 10).toFixed(1).replace('.', ',').replace('-', '−') + ' °C'}
            color={st === 'rouge' ? 'var(--red)' : st === 'jaune' ? '#000' : 'var(--green)'} bandColor={st === 'rouge' ? 'var(--red-bg)' : st === 'jaune' ? 'var(--yellow)' : 'var(--green-bg)'} />
        </div>
      </div>

      <div className="group">
        {CHECKS.map((c, i) => (
          <div className="row" key={c} style={{ minHeight: 48 }}><span className="grow" style={{ fontSize: 16 }}>{tr(c)}</span>
            <YesNo label={tr(c)} on={checks[i]} onToggle={() => setChecks(checks.map((x, j) => (j === i ? !x : x)))} /></div>))}
      </div>
      <button className="group row" style={{ width: '100%', border: 'none', fontSize: 16, textAlign: 'left' }} onClick={() => slipIn.current?.click()}>
        {photo ? <img src={photo} alt={tr('Bon de livraison')} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} /> : <span style={{ fontSize: 22 }}>📷</span>}
        <span className="grow">{tr('Photo du bon de livraison (archivée)')}<span className="sub">{photo ? tr('✓ Photo prise · toucher pour reprendre') : tr('Toucher pour photographier')}</span></span></button>

      <div className="error" role="alert">{error}</div>
      {refusing ? (
        <div className="group">
          <div className="row"><b>{tr('Motif du refus')}</b></div>
          {REFUS.map((r) => <button key={r} className="row" style={{ width: '100%', border: 'none', background: '#fff', fontSize: 16, textAlign: 'left' }} onClick={() => submit(false, r)}>{tr(r)}</button>)}
          <button className="row link" style={{ width: '100%' }} onClick={() => setRefusing(false)}>{tr('Annuler')}</button>
        </div>
      ) : (
        <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="btn" style={{ background: '#fff', color: 'var(--red)' }} disabled={!filled} onClick={() => setRefusing(true)}>{tr('Refuser')}</button>
          <button className="btn btn-primary" disabled={!filled || !checks.every(Boolean) || st === 'rouge'} onClick={() => submit(true, null)}>{tr('Accepter')}</button>
        </div>
      )}
    </div>
  );
}
