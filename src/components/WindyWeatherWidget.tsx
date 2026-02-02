import React from 'react';
import { MapPin } from 'lucide-react';

interface WindyWeatherWidgetProps {
  latitude: number;
  longitude: number;
  locationName?: string;
  height?: string;
  showMarker?: boolean;
  showPressure?: boolean;
  zoom?: number;
  overlay?: 'wind' | 'temp' | 'clouds' | 'rain' | 'waves';
}

export const WindyWeatherWidget: React.FC<WindyWeatherWidgetProps> = ({
  latitude,
  longitude,
  locationName,
  height = '600px',
  showMarker = true,
  showPressure = true,
  zoom = 11,
  overlay = 'wind'
}) => {
  const windyUrl = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=kt&zoom=${zoom}&overlay=${overlay}&product=ecmwf&level=surface&lat=${latitude}&lon=${longitude}&detailLat=${latitude}&detailLon=${longitude}&marker=${showMarker}&pressure=${showPressure}&message=true`;

  return (
    <div className="w-full h-full rounded-lg overflow-hidden flex flex-col">
      {locationName && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center gap-2 flex-shrink-0">
          <MapPin size={18} />
          <div>
            <div className="font-semibold">{locationName}</div>
            <div className="text-xs text-blue-100">
              Live weather forecast powered by Windy
            </div>
          </div>
        </div>
      )}
      <iframe
        src={windyUrl}
        className="w-full flex-1"
        title={`Weather forecast for ${locationName || 'location'}`}
        allow="geolocation"
        sandbox="allow-scripts allow-same-origin allow-popups-to-escape-sandbox"
      />
    </div>
  );
};
