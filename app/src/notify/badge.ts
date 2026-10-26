// Pastille sur l'icône de l'app (iPhone : iOS 16.4+, NORMA ouverte depuis l'écran d'accueil ; Android / ordinateur : Chrome, Edge).
export function setAppBadge(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (n > 0) nav.setAppBadge?.(n)?.catch(() => undefined);
    else nav.clearAppBadge?.()?.catch(() => undefined);
  } catch { /* non pris en charge */ }
}

/** Onglet demandé par une notification touchée : `/?onglet=documents` (app fermée) ou message du service worker (app ouverte). */
export function requestedTab(): string | null {
  const v = new URLSearchParams(location.search).get('onglet');
  if (v) history.replaceState(null, '', location.pathname + location.hash);
  return v;
}
export function onOpenFromNotification(cb: (tab: string | null) => void) {
  if (!('serviceWorker' in navigator)) return () => undefined;
  const h = (e: MessageEvent) => {
    if (e.data?.type !== 'norma-open') return;
    cb(new URL(String(e.data.url ?? '/'), location.origin).searchParams.get('onglet'));
  };
  navigator.serviceWorker.addEventListener('message', h);
  return () => navigator.serviceWorker.removeEventListener('message', h);
}
