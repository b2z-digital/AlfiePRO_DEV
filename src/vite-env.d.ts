/// <reference types="vite/client" />

declare const __APP_BUILD_DATE__: string;
declare const __APP_BUILD_TIME__: string;

// Add Google Maps global declaration
declare global {
  interface Window {
    google: any;
  }
}