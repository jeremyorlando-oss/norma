import { useT } from '../i18n';
import { useState } from 'react';
import type { Api, NcKind, Session } from '../api/types';
import { TopBar } from '../components/Controls';

const KINDS: { kind: NcKind; label: string; steps?: string[] }[] = [
  { kind: 'corps_etranger', label: 'Corps étranger', steps: [
    'Arrêter la préparation, ne pas servir le produit', 'Retirer le produit, éviter toute contamination croisée',
    'Isoler les produits du même lot', 'Jeter le produit concerné (en cas de doute, aussi les autres)',
    'Nettoyer et désinfecter la zone et les ustensiles', 'Informer le responsable du stand',
    'Si déjà servi : suivre les instructions du responsable', 'Chercher l’origine pour éviter que ça se reproduise'] },
  { kind: 'allergie', label: 'Réaction allergique d’un client', steps: [
    'Urgence (gonflement, difficulté à respirer) : appeler le 144', 'Informer immédiatement le responsable',
    'Noter le plat servi et l’heure', 'Garder le reste du plat à part, sans le jeter'] },
  { kind: 'intoxication', label: 'Plainte client / suspicion d’intoxication', steps: [
    'Garder le reste du plat et les produits du même lot au froid, étiquetés « NE PAS JETER »',
    'Isoler le lot concerné (préparation ou produit reçu) et arrêter de le servir',
    'Noter l’heure, le plat servi et, si le client accepte, ses coordonnées',
    'Informer immédiatement le Gérant',
    'Le Gérant informe l’OFCO (021 316 43 43) si un danger est possible (art. 84 ODAlOUs)',
    'Conserver tous les enregistrements du jour (rapport, lots, réceptions)'] },
  { kind: 'nuisibles', label: 'Nuisibles (insectes, rongeurs)', steps: [
    'Protéger ou retirer les denrées exposées', 'Nettoyer et désinfecter la zone', 'Informer le responsable', 'Boucher les accès ; spécialiste si le problème persiste'] },
  { kind: 'materiel', label: 'Panne ou matériel défectueux', steps: [
    'Isoler l’équipement (ne plus l’utiliser)', 'Contrôler les températures des produits concernés', 'Informer le responsable', 'Noter la réparation dans Administratif › Entretien'] },
  { kind: 'coupure_courant', label: 'Coupure de courant', steps: [
    'Informer le responsable', 'Ne pas ouvrir frigos, saladette et congélateur', 'Relever les températures dès que possible',
    'Contacter l’organisateur ou le technicien', 'Si la chaîne du froid n’est plus garantie : suspendre la vente'] },
  { kind: 'hygiene', label: 'Problème d’hygiène' },
  { kind: 'autre', label: 'Autre problème' },
];

export function Signaler({ api, session, onBack }: { api: Api; session: Session; onBack: () => void }) {
  const t = useT();
  const [kind, setKind] = useState<NcKind | null>(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const k = KINDS.find((x) => x.kind === kind);

  const send = async () => {
    try { await api.signaler(session.token, kind!, text.trim()); setSent(true); } catch (e) { setError(t((e as Error).message)); }
  };

  if (sent) return (
    <div className="screen">
      <TopBar title={t('Signalé')} onBack={onBack} />
      <span className="badge vert" style={{ alignSelf: 'center' }}>{t('✓ Envoyé au chef de cuisine et au manager')}</span>
      {k?.steps && <>
        <div className="section-label">{t('À faire maintenant')}</div>
        <ol className="group" style={{ margin: 0, padding: '8px 16px 8px 36px', fontSize: 16, lineHeight: '24px' }}>{k.steps.map((s) => <li key={s}>{t(s)}</li>)}</ol>
      </>}
      <div style={{ marginTop: 'auto' }}><button className="btn btn-primary" onClick={onBack}>{t('Terminé')}</button></div>
    </div>
  );

  return (
    <div className="screen">
      <TopBar title={t('Signaler un problème')} onBack={onBack} />
      <div className="group" role="radiogroup" aria-label={t('Type de problème')}>
        {KINDS.map((x) => (
          <button key={x.kind} role="radio" aria-checked={kind === x.kind} className="row" onClick={() => setKind(x.kind)}
            style={{ width: '100%', border: 'none', background: '#fff', fontSize: 17, textAlign: 'left', justifyContent: 'space-between' }}>
            {t(x.label)}<span style={{ color: 'var(--blue)', fontWeight: 600 }}>{kind === x.kind ? '✓' : ''}</span></button>))}
      </div>
      <label className="section-label" htmlFor="desc">{t('Que s’est-il passé ?')}</label>
      <textarea id="desc" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Ex. : client a trouvé un morceau de plastique dans un completo Royal')}
        style={{ minHeight: 96, border: 'none', borderRadius: 12, padding: '12px 16px', fontFamily: 'inherit', fontSize: 16, resize: 'vertical' }} />
      <div className="error" role="alert">{error}</div>
      <div style={{ marginTop: 'auto' }}><button className="btn btn-danger" disabled={!kind || text.trim().length < 5} onClick={send}>{t('Envoyer le signalement')}</button></div>
    </div>
  );
}
