import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vamoos.livescores',
  appName: 'VAMOOS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
