import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { parseLabel, type LabelFields } from '../scan/parseLabel';

export type ScanResult = { kind: 'barcode'; code: string } | { kind: 'label'; fields: LabelFields };
type Paths = { __NORMA_OCR?: Record<string, string> };

/** Caméra en direct : capture automatique dès que le code-barres, ou le lot et la date, sont lisibles.
 *  onUnavailable : caméra en direct impossible (fichier local, refus) → l'écran repasse à la photo classique. */
export function LiveScanner({ mode, suppliers, onResult, onCancel, onUnavailable }: {
  mode: 'barcode' | 'label'; suppliers: string[]; onResult: (r: ScanResult) => void; onCancel: () => void; onUnavailable: () => void;
}) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [seen, setSeen] = useState<LabelFields>({});
  const [ready, setReady] = useState(false);
  const shoot = useRef(false);                 // « Prendre la photo » : rendre ce qui a été lu
  const best = useRef<LabelFields>({});

  useEffect(() => {
    let stop = false;
    let cleanup = () => {};
    const done = (r: ScanResult) => { if (stop) return; stop = true; navigator.vibrate?.(80); cleanup(); onResult(r); };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) { onUnavailable(); return; }
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
      catch { onUnavailable(); return; }
      const v = video.current!;
      v.srcObject = stream; await v.play().catch(() => {}); setReady(true);
      cleanup = () => stream.getTracks().forEach((x) => x.stop());
      if (stop) { cleanup(); return; }

      if (mode === 'barcode') {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const ctl = await new BrowserMultiFormatReader().decodeFromStream(stream, v, (res) => { if (res) done({ kind: 'barcode', code: res.getText() }); });
        const prev = cleanup; cleanup = () => { ctl.stop(); prev(); };
        return;
      }
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(['fra', 'deu'], 1, (window as unknown as Paths).__NORMA_OCR ?? {});
      const prev = cleanup; cleanup = () => { worker.terminate(); prev(); };
      const canvas = document.createElement('canvas');
      while (!stop) {
        if (!v.videoWidth) { await new Promise((r) => setTimeout(r, 200)); continue; }
        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        canvas.getContext('2d')!.drawImage(v, 0, 0);
        const { data } = await worker.recognize(canvas);
        if (stop) break;
        const f = parseLabel(data.text, suppliers);
        best.current = { ...best.current, ...f }; setSeen({ ...best.current });
        const b = best.current;
        if ((b.lot && b.dlc) || shoot.current) { done({ kind: 'label', fields: b }); break; }
        await new Promise((r) => setTimeout(r, 300));
      }
    })();
    return () => { stop = true; cleanup(); };
  }, [mode]);   // eslint-disable-line react-hooks/exhaustive-deps

  const item = (ok: unknown, l: string) => <span className={`pill ${ok ? 'vert' : ''}`} style={{ background: ok ? undefined : 'rgba(255,255,255,.2)', color: ok ? undefined : '#fff' }}>{ok ? '✓ ' : ''}{t(l)}</span>;
  return (
    <div role="dialog" aria-label={t(mode === 'barcode' ? 'Scanner code-barres' : 'Photo étiquette')}
      style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <video ref={video} playsInline muted style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: '18% 8%', border: '3px solid rgba(255,255,255,.85)', borderRadius: 16, pointerEvents: 'none' }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, color: '#fff' }}>
        <div style={{ textAlign: 'center', fontSize: 16 }} role="status">
          {!ready ? t('Ouverture de la caméra…') : mode === 'barcode' ? t('Montrez le code-barres dans le cadre') : t('Montrez l’étiquette : lot et date doivent être visibles')}</div>
        {mode === 'label' && <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>{item(seen.supplier, 'Fournisseur')}{item(seen.lot, 'Lot')}{item(seen.dlc, 'DLC')}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: mode === 'label' ? '1fr 1fr' : '1fr', gap: 10 }}>
          <button className="btn" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} onClick={onCancel}>{t('Annuler')}</button>
          {mode === 'label' && <button className="btn btn-primary" onClick={() => { shoot.current = true; }}>{t('Prendre la photo')}</button>}
        </div>
      </div>
    </div>
  );
}
