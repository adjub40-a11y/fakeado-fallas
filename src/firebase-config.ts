// Configuración de Firebase. Los valores se leen del archivo .env (ver .env.example)
// o de las variables de entorno de Codemagic al compilar.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY as string,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN as string,
  databaseURL: import.meta.env.VITE_FB_DATABASE_URL as string,
  projectId: import.meta.env.VITE_FB_PROJECT_ID as string,
  appId: import.meta.env.VITE_FB_APP_ID as string,
};

export function firebaseConfigured(): boolean {
  return !!(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId);
}

/** Dirección pública de la versión web (para el QR y los enlaces de invitación) */
export const WEB_URL = (import.meta.env.VITE_WEB_URL as string) || '';
