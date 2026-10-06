import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'es.fakeado.fallas',
  appName: '¡Fakeado! Fallas',
  webDir: 'dist',
  backgroundColor: '#0c0a2a',
  android: { backgroundColor: '#0c0a2a' },
  ios: { backgroundColor: '#0c0a2a', contentInset: 'never' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0c0a2a', showSpinner: false },
  },
};

export default config;
