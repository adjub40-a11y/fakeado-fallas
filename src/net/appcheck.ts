// App Check: demuestra a Firebase que las peticiones vienen de la app auténtica
// instalada desde Google Play (Play Integrity). Solo en la app nativa; en la web no hace nada.
// Si algo falla, el juego sigue funcionando: mientras Firebase esté en modo "vigilancia"
// las peticiones sin token se aceptan igualmente.
import type { FirebaseApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';

export async function startAppCheck(app: FirebaseApp): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    const [{ FirebaseAppCheck }, { initializeAppCheck, CustomProvider }] = await Promise.all([
      import('@capacitor-firebase/app-check'),
      import('firebase/app-check'),
    ]);
    await FirebaseAppCheck.initialize({ isTokenAutoRefreshEnabled: true });
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          const r = await FirebaseAppCheck.getToken();
          return { token: r.token, expireTimeMillis: r.expireTimeMillis ?? Date.now() + 30 * 60 * 1000 };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.warn('App Check no disponible', e);
  }
}
