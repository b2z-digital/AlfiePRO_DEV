/// <reference types="vite/client" />

// Add Google Maps global declaration
declare global {
  interface Window {
    google: any;
  }
}