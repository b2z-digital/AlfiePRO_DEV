let isLoading = false;
let isLoaded = false;
const callbacks: (() => void)[] = [];

export const loadGoogleMaps = (callback: () => void) => {
  if (window.google && window.google.maps) {
    isLoaded = true;
    callback();
    return;
  }

  callbacks.push(callback);

  if (isLoading) return;

  isLoading = true;
  // Builds without the key (the phone apps) get it from the app-services function (Supabase secrets)
  const buildKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  (buildKey ? Promise.resolve(buildKey) : fetchMapsKey()).then(apiKey => {
    if (!apiKey) {
      console.warn('Google Maps API key is not configured');
      isLoading = false;
      callbacks.length = 0;
      return;
    }
    injectScript(apiKey);
  });
};

async function fetchMapsKey(): Promise<string | null> {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.functions.invoke('app-services', { body: { action: 'maps-key' } });
    return error ? null : (data?.key || null);
  } catch {
    return null;
  }
}

function injectScript(apiKey: string) {
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
  script.async = true;
  script.defer = true;

  script.onload = () => {
    isLoaded = true;
    isLoading = false;
    callbacks.forEach(cb => cb());
    callbacks.length = 0;
  };

  script.onerror = () => {
    console.error('Failed to load Google Maps');
    isLoading = false;
    callbacks.length = 0;
  };

  document.head.appendChild(script);
}