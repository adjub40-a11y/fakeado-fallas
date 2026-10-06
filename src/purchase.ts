// Compra única "Desbloquear todo" (0,99 €) en Google Play y App Store.
// Usa cordova-plugin-purchase, que solo existe dentro de la app nativa.
import { Capacitor } from '@capacitor/core';

export const PRODUCT_ID = 'fallas_todo';
const KEY = 'fallas.unlocked';

type Listener = (unlocked: boolean, price?: string) => void;
const listeners = new Set<Listener>();
let unlocked = readLocal();
let price: string | undefined;
let ready = false;

function readLocal(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function setUnlocked(v: boolean) {
  unlocked = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* sin almacenamiento */
  }
  listeners.forEach((l) => l(unlocked, price));
}

export function isUnlocked() {
  return unlocked;
}
export function getPrice() {
  return price;
}
export function onPurchaseChange(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function purchasesAvailable(): boolean {
  return Capacitor.isNativePlatform() && !!(window as any).CdvPurchase;
}

export async function initPurchases(): Promise<void> {
  if (ready || !purchasesAvailable()) return;
  const C = (window as any).CdvPurchase;
  const { store, ProductType, Platform } = C;
  const platform = Capacitor.getPlatform() === 'ios' ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY;
  store.register([{ id: PRODUCT_ID, type: ProductType.NON_CONSUMABLE, platform }]);
  store
    .when()
    .productUpdated((p: any) => {
      if (p.id !== PRODUCT_ID) return;
      price = p.pricing?.price;
      if (p.owned) setUnlocked(true);
      else listeners.forEach((l) => l(unlocked, price));
    })
    .approved((t: any) => t.verify())
    .verified((r: any) => r.finish())
    .finished((t: any) => {
      if (t.products?.some((p: any) => p.id === PRODUCT_ID)) setUnlocked(true);
    });
  await store.initialize([platform]);
  ready = true;
  const p = store.get(PRODUCT_ID, platform);
  if (p?.owned) setUnlocked(true);
}

export async function buy(): Promise<'ok' | 'cancel' | 'error' | 'unavailable'> {
  if (!purchasesAvailable()) return 'unavailable';
  await initPurchases();
  const C = (window as any).CdvPurchase;
  const offer = C.store.get(PRODUCT_ID)?.getOffer();
  if (!offer) return 'unavailable';
  const err = await C.store.order(offer);
  if (!err) return 'ok';
  return err.code === C.ErrorCode.PAYMENT_CANCELLED ? 'cancel' : 'error';
}

export async function restore(): Promise<boolean> {
  if (!purchasesAvailable()) return unlocked;
  await initPurchases();
  const C = (window as any).CdvPurchase;
  await C.store.restorePurchases();
  const p = C.store.get(PRODUCT_ID);
  if (p?.owned) setUnlocked(true);
  return unlocked;
}
