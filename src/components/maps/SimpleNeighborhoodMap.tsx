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

/**
 * Generate an irregular polygon that looks like a natural neighborhood boundary
 * Uses seeded randomness based on name for consistent results
 */
function generateNeighborhoodPolygon(
  center: [number, number],
  radius: number,
  seed: string
): [number, number][] {
  // Simple hash function for consistent randomness
  const hash = (str: string, i: number) => {
    let h = 0;
    for (let j = 0; j < str.length; j++) {
      h = ((h << 5) - h + str.charCodeAt(j) + i) | 0;
    }
    return (Math.abs(h) % 1000) / 1000;
  };

  const points: [number, number][] = [];
  const numPoints = 8; // Octagon-like shape with variation

  // Convert radius from meters to approximate degrees
  // 1 degree lat ≈ 111km, 1 degree lng varies by latitude
  const latRadius = radius / 111000;
  const lngRadius = radius / (111000 * Math.cos((center[0] * Math.PI) / 180));

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    // Add variation to radius (0.7 to 1.3x) based on seed
    const variation = 0.7 + hash(seed, i) * 0.6;
    const lat = center[0] + Math.sin(angle) * latRadius * variation;
    const lng = center[1] + Math.cos(angle) * lngRadius * variation;
    points.push([lat, lng]);
  }

  return points;
}

/**
 * Generate hinterland polygons (4 adjacent areas around the main neighborhood)
 */
function generateHinterlandPolygons(
  center: [number, number],
  radius: number,
  seed: string
): { name: string; polygon: [number, number][] }[] {
  const hinterlands: { name: string; polygon: [number, number][] }[] = [];
  const directions = ['North', 'East', 'South', 'West'];

  const latRadius = radius / 111000;
  const lngRadius = radius / (111000 * Math.cos((center[0] * Math.PI) / 180));

  directions.forEach((dir, idx) => {
    const angle = (idx / 4) * 2 * Math.PI;
    const offsetLat = Math.sin(angle) * latRadius * 1.8;
    const offsetLng = Math.cos(angle) * lngRadius * 1.8;
    const hinterlandCenter: [number, number] = [
      center[0] + offsetLat,
      center[1] + offsetLng,
    ];

    const polygon = generateNeighborhoodPolygon(
      hinterlandCenter,
      radius * 0.8,
      seed + dir
    );

    hinterlands.push({ name: dir, polygon });
  });

  return hinterlands;
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

      // Use zoom level 13 to match the detailed neighborhood maps (zoomed out 2 clicks)
      const zoom = 13;

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

      // Generate and add hinterland polygons
      const hinterlands = generateHinterlandPolygons(center, radius, name);
      hinterlands.forEach((hinterland) => {
        L.polygon(hinterland.polygon, {
          color: '#94a3b8',
          weight: 1,
          fillColor: '#e2e8f0',
          fillOpacity: 0.2,
          dashArray: '4, 4',
        }).addTo(map);
      });

      // Generate and add main neighborhood polygon - on top
      const mainPolygon = generateNeighborhoodPolygon(center, radius, name);
      L.polygon(mainPolygon, {
        color: '#dc2626',
        weight: 3,
        fillColor: '#fecaca',
        fillOpacity: 0.15,
      }).addTo(map).bindPopup(`<strong>${name}</strong><br/>${city}`);

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
        <div className="flex items-center gap-4 text-xs text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-red-100 border-2 border-red-600 rounded-sm" />
            {name}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-slate-100 border border-slate-400 border-dashed rounded-sm" />
            Hinterlands
          </span>
        </div>

        <button
          onClick={handleOpenInMaps}
          className="flex items-center gap-1.5 text-xs text-fg-subtle hover:text-black transition-colors"
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
