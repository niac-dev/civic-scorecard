import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.niacaction.app',
  appName: 'NIAC Action',
  webDir: 'out',
  // Use remote URL with offline caching via IndexedDB
  server: {
    url: 'https://scorecard.niacaction.org',
    cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: true,
    scrollEnabled: true,
    // Enable background modes for push notifications
    backgroundColor: '#30558C',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false, // Disable in production
    backgroundColor: '#30558C',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#30558C',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
