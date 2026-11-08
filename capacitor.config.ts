import type { CapacitorConfig } from '@capacitor/cli';

// AlfiePRO native apps (iOS + Android) built from this web app.
// The bundle ID matches the live Expo app, so a release here ships as an update
// to the existing App Store listing (id6759854905) rather than a new app.
const config: CapacitorConfig = {
  appId: 'com.b2zdigital.alfiepro',
  appName: 'AlfiePRO',
  webDir: 'dist',
  // App files are bundled into the build (not loaded from a remote URL).
  server: {
    androidScheme: 'https',
    // Live reload while developing: CAP_SERVER_URL=http://<your-lan-ip>:5173 npx cap run ios
    ...(process.env.CAP_SERVER_URL ? { url: process.env.CAP_SERVER_URL, cleartext: true } : {}),
  },
  backgroundColor: '#0b1328',
  ios: {
    // Local content is served from capacitor://localhost (default). Don't set ios.scheme to
    // 'alfiepro' — that is the deep-link scheme and schemes are case-insensitive.
    contentInset: 'never',
    backgroundColor: '#0b1328',
    // Lets WebRTC, camera and audio work inline for livestream cameras, calls and StartBox.
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: '#0b1328',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#0b1328',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
