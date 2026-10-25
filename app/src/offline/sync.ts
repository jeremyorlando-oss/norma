// File des saisies faites sans réseau : ajout, état visible sur la tablette, envoi dans l'ordre dès le retour du réseau.
import { kvGet, kvSet, qAdd, qAll, qDel, type QueueItem } from './store';

/** Erreur réseau (pas de connexion, délai dépassé) : la saisie part dans la file au lieu d'échouer. */
export class OfflineError extends Error {}
export const isNetworkError = (m: string) => /fetch|network|load failed|abort|timeout|timed out|connexion/i.test(m);

export interface Failed { who: string; fn: string; clientAt: string; error: string }
export interface SyncState { online: boolean; pending: number; syncing: boolean; failed: Failed[] }
let state: SyncState = { online: typeof navigator === 'undefined' ? true : navigator.onLine, pending: 0, syncing: false, failed: [] };
const listeners = new Set<(s: SyncState) => void>();
const emit = (p: Partial<SyncState>) => { state = { ...state, ...p }; listeners.forEach((l) => l(state)); };
export const syncState = () => state;
export const onSync = (l: (s: SyncState) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

let offlineUntil = 0;
/** Après une erreur réseau, on considère la tablette hors ligne quelques secondes (pas d'attente à chaque saisie). */
export const markOffline = () => { offlineUntil = Date.now() + 20_000; emit({ online: false }); };
export const markOnline = () => { offlineUntil = 0; if (!state.online) emit({ online: true }); };
export const looksOffline = () => (typeof navigator !== 'undefined' && !navigator.onLine) || Date.now() < offlineUntil;

let seq = Date.now();
export async function enqueue(i: Omit<QueueItem, 'id' | 'seq' | 'clientAt'> & { clientAt?: string }) {
  const item: QueueItem = { ...i, id: crypto.randomUUID(), seq: seq++, clientAt: i.clientAt ?? new Date().toISOString() };
  await qAdd(item);
  emit({ pending: (await qAll()).length });
  return item;
}

let running: Promise<void> | null = null;
/** Envoie la file dans l'ordre. S'arrête à la première erreur réseau ; une saisie refusée par le serveur est mise de côté. */
export function flush(send: (i: QueueItem) => Promise<void>): Promise<void> {
  running ??= (async () => {
    const items = await qAll();
    if (items.length) emit({ syncing: true });
    for (const it of items) {
      try { await send(it); await qDel(it.id); markOnline(); }
      catch (e) {
        const msg = (e as Error).message;
        if (e instanceof OfflineError || isNetworkError(msg)) { markOffline(); break; }
        await qDel(it.id);
        const failed = [...state.failed, { who: it.who, fn: it.fn, clientAt: it.clientAt, error: msg }];
        await kvSet('failed', failed); emit({ failed });
      }
      emit({ pending: (await qAll()).length });
    }
    emit({ syncing: false, pending: (await qAll()).length });
  })().finally(() => { running = null; });
  return running;
}

export async function initSync(send: (i: QueueItem) => Promise<void>) {
  emit({ pending: (await qAll()).length, failed: (await kvGet<Failed[]>('failed')) ?? [] });
  const go = () => { flush(send).catch(() => undefined); };
  window.addEventListener('online', () => { markOnline(); go(); });
  window.addEventListener('offline', () => emit({ online: false }));
  setInterval(go, 15_000);
  go();
}
export async function clearFailed() { await kvSet('failed', []); emit({ failed: [] }); }
