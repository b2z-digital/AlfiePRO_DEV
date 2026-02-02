import { useEffect } from 'react';

interface GoogleAnalyticsProps {
  measurementId: string | null | undefined;
}

export const GoogleAnalytics: React.FC<GoogleAnalyticsProps> = ({ measurementId }) => {
  useEffect(() => {
    if (!measurementId || !measurementId.startsWith('G-')) {
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`);
    if (existingScript) {
      return;
    }

    // Create and inject the Google Analytics script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    // Initialize Google Analytics
    const inlineScript = document.createElement('script');
    inlineScript.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${measurementId}');
    `;
    document.head.appendChild(inlineScript);

    console.log('✅ Google Analytics loaded:', measurementId);

    // Cleanup function
    return () => {
      // Note: We don't remove scripts on unmount as GA should persist
    };
  }, [measurementId]);

  return null;
};
