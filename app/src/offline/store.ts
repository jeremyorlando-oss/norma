// Stockage local de la tablette (IndexedDB) : dernières données lues, codes connus, file des saisies hors ligne.
// Les données restent sur la tablette ; rien n'est envoyé ailleurs qu'à NORMA.
const DB = 'norma-hors-ligne';
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  dbp ??= new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('queue', { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  return dbp;
}
function tx<T>(store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((ok, ko) => {
    const t = d.transaction(store, mode); const r = f(t.objectStore(store));
    t.oncomplete = () => ok(r.result); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error);
  }));
}
export const kvGet = <T>(k: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(k) as IDBRequest<T | undefined>).catch(() => undefined);
export const kvSet = (k: string, v: unknown) => tx('kv', 'readwrite', (s) => s.put(v, k)).catch(() => undefined);
export const kvDel = (k: string) => tx('kv', 'readwrite', (s) => s.delete(k)).catch(() => undefined);

export interface QueueItem {
  id: string;                      // numéro unique de la saisie (le serveur ne l'enregistre qu'une fois)
  seq: number;                     // ordre des saisies
  memberId: string;
  who: string;
  fn: string;                      // fonction serveur (ou « session » = ouverture de session / arrivée)
  args: Record<string, unknown>;
  clientAt: string;                // heure réelle de la saisie
  photo?: Blob;                    // photo du bon de livraison à envoyer avant la saisie
  photoArg?: string;
}
export const qAdd = (i: QueueItem) => tx('queue', 'readwrite', (s) => s.put(i));
export const qDel = (id: string) => tx('queue', 'readwrite', (s) => s.delete(id));
export const qAll = () => tx<QueueItem[]>('queue', 'readonly', (s) => s.getAll() as IDBRequest<QueueItem[]>).then((l) => l.sort((a, b) => a.seq - b.seq));
