// Notifications iPhone (Web Push) côté app : abonnement de cet appareil.
// iPhone : possible seulement si NORMA est ouverte depuis son icône sur l'écran d'accueil (iOS 16.4 ou plus récent).
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const b64u = (s: string) => {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const toB64u = (buf: ArrayBuffer | null) => btoa(String.fromCharCode(...new Uint8Array(buf ?? new ArrayBuffer(0)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Demande l'autorisation puis abonne l'appareil ; renvoie les clés à transmettre au serveur. */
export async function subscribePush(publicKey: string) {
  if (!pushSupported()) throw new Error('Pour recevoir les notifications, ouvrez NORMA depuis son icône sur l’écran d’accueil de l’iPhone.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées. Autorisez-les dans Réglages › Notifications › NORMA.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(publicKey) });
  return { endpoint: sub.endpoint, p256dh: toB64u(sub.getKey('p256dh')), auth: toB64u(sub.getKey('auth')) };
}
