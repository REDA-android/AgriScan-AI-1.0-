import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.agroscan.ia",
  appName: "AgroScan IA",
  webDir: "dist",
  server: {
    androidScheme: "https",
    hostname: "localhost",
    cleartext: true,
  },
  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email"],
      serverClientId: "VOTRE_ID_WEB_FIREBASE.apps.googleusercontent.com",
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
