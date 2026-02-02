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
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places`;
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
};