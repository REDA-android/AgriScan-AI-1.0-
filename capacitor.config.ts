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
      serverClientId: "969613404131-ah3fjr02qib6tgfuvpgjak6k39kdjvjp.apps.googleusercontent.com",
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
