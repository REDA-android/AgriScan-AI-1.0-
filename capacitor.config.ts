import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agroscan.ia',
  appName: 'AgroScan IA',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: true
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '969613404131-mub77m6o74k3p8j88o1u7v9p9p9p9p9p9p.apps.googleusercontent.com', // À REMPLACER PAR VOTRE ID CLIENT WEB DANS LA CONSOLE GOOGLE
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
