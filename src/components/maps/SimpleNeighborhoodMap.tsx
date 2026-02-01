'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';

interface SimpleNeighborhoodMapProps {
  center: [number, number]; // [lat, lng]
  name: string;
  city: string;
  radius?: number; // in meters
  className?: string;
}

export function SimpleNeighborhoodMap({
  center,
  name,
  city,
  radius = 1000,
  className = '',
}: SimpleNeighborhoodMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Only run on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !mapRef.current || mapInstanceRef.current) return;

    const loadMap = async () => {
      // Add Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Add custom styles
      if (!document.getElementById('leaflet-custom-css')) {
        const style = document.createElement('style');
        style.id = 'leaflet-custom-css';
        style.textContent = `
          .leaflet-control-attribution {
            font-size: 9px !important;
            color: #ccc !important;
            background: rgba(255,255,255,0.6) !important;
          }
          .leaflet-control-attribution a {
            color: #bbb !important;
          }
        `;
        document.head.appendChild(style);
      }

      const L = (await import('leaflet')).default;

      // Calculate zoom based on radius
      const zoom = radius < 500 ? 16 : radius < 1000 ? 15 : radius < 2000 ? 14 : 13;

      const map = L.map(mapRef.current!, {
        center: center,
        zoom: zoom,
        scrollWheelZoom: false,
        attributionControl: false,
      });

      L.control.attribution({
        prefix: false,
      }).addTo(map);

      // Add tile layer (CartoDB Positron)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '<a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);

      // Add circle to show approximate neighborhood area
      L.circle(center, {
        color: '#dc2626',
        weight: 2,
        fillColor: '#fecaca',
        fillOpacity: 0.15,
        radius: radius,
      }).addTo(map).bindPopup(`<strong>${name}</strong><br/>${city}`);

      // Add center marker
      L.circleMarker(center, {
        color: '#dc2626',
        fillColor: '#dc2626',
        fillOpacity: 1,
        radius: 6,
      }).addTo(map);

      mapInstanceRef.current = map;
    };

    loadMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [center, name, city, radius, isClient]);

  const handleOpenInMaps = () => {
    const [lat, lng] = center;
    const query = encodeURIComponent(`${name}, ${city}`);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      window.location.href = `maps://maps.apple.com/?q=${query}&ll=${lat},${lng}&z=15`;
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}&center=${lat},${lng}&zoom=15`, '_blank');
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className="w-full h-64 rounded-lg border border-neutral-200" />

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-red-100 border-2 border-red-600 rounded-full" />
            {name}
          </span>
        </div>

        <button
          onClick={handleOpenInMaps}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-black transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open in Maps
        </button>
      </div>
    </div>
  );
}
