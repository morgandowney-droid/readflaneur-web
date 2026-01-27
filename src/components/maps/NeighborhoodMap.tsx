'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';

interface NeighborhoodMapProps {
  neighborhoodId: string;
  className?: string;
}

// Neighborhood boundaries and hinterlands
// Core: the main neighborhood area
// Hinterland: surrounding areas of interest to residents
const NEIGHBORHOOD_BOUNDARIES: Record<string, {
  name: string;
  center: [number, number]; // [lat, lng]
  zoom: number;
  core: [number, number][]; // polygon coordinates
  hinterland: [number, number][]; // surrounding area polygon
  hinterlandLabel: string;
}> = {
  'nyc-west-village': {
    name: 'West Village',
    center: [40.7336, -74.0027],
    zoom: 15,
    core: [
      [40.7380, -74.0085], // NW
      [40.7380, -73.9970], // NE
      [40.7295, -73.9970], // SE
      [40.7295, -74.0085], // SW
    ],
    hinterland: [
      [40.7420, -74.0120], // NW expanded
      [40.7420, -73.9920], // NE expanded
      [40.7250, -73.9920], // SE expanded
      [40.7250, -74.0120], // SW expanded
    ],
    hinterlandLabel: 'SoHo, NoHo, Chelsea, Meatpacking',
  },
  'london-notting-hill': {
    name: 'Notting Hill',
    center: [51.5117, -0.2054],
    zoom: 15,
    core: [
      [51.5170, -0.2150], // NW
      [51.5170, -0.1960], // NE
      [51.5060, -0.1960], // SE
      [51.5060, -0.2150], // SW
    ],
    hinterland: [
      [51.5220, -0.2250], // NW expanded
      [51.5220, -0.1850], // NE expanded
      [51.5010, -0.1850], // SE expanded
      [51.5010, -0.2250], // SW expanded
    ],
    hinterlandLabel: 'Kensington, Holland Park, Bayswater',
  },
  'sf-pacific-heights': {
    name: 'Pacific Heights',
    center: [37.7925, -122.4350],
    zoom: 15,
    core: [
      [37.7970, -122.4450], // NW
      [37.7970, -122.4250], // NE
      [37.7880, -122.4250], // SE
      [37.7880, -122.4450], // SW
    ],
    hinterland: [
      [37.8020, -122.4520], // NW expanded
      [37.8020, -122.4180], // NE expanded
      [37.7830, -122.4180], // SE expanded
      [37.7830, -122.4520], // SW expanded
    ],
    hinterlandLabel: 'Marina, Cow Hollow, Presidio Heights',
  },
  'stockholm-ostermalm': {
    name: 'Östermalm',
    center: [59.3380, 18.0850],
    zoom: 14,
    core: [
      [59.3450, 18.0650], // NW
      [59.3450, 18.1050], // NE
      [59.3300, 18.1050], // SE
      [59.3300, 18.0650], // SW
    ],
    hinterland: [
      [59.3520, 18.0500], // NW expanded
      [59.3520, 18.1200], // NE expanded
      [59.3230, 18.1200], // SE expanded
      [59.3230, 18.0500], // SW expanded
    ],
    hinterlandLabel: 'Djurgården, Norrmalm, Gärdet',
  },
  'sydney-paddington': {
    name: 'Paddington',
    center: [-33.8847, 151.2265],
    zoom: 15,
    core: [
      [-33.8780, 151.2180], // NW
      [-33.8780, 151.2350], // NE
      [-33.8910, 151.2350], // SE
      [-33.8910, 151.2180], // SW
    ],
    hinterland: [
      [-33.8720, 151.2100], // NW expanded
      [-33.8720, 151.2430], // NE expanded
      [-33.8970, 151.2430], // SE expanded
      [-33.8970, 151.2100], // SW expanded
    ],
    hinterlandLabel: 'Woollahra, Surry Hills, Darlinghurst',
  },
};

export function NeighborhoodMap({ neighborhoodId, className = '' }: NeighborhoodMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const [isClient, setIsClient] = useState(false);

  const boundary = NEIGHBORHOOD_BOUNDARIES[neighborhoodId];

  // Only run on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !boundary || !mapRef.current || mapInstanceRef.current) return;

    // Dynamically load Leaflet
    const loadMap = async () => {
      // Add Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Load Leaflet JS dynamically to avoid SSR issues
      const L = (await import('leaflet')).default;

      // Create map
      const map = L.map(mapRef.current!, {
        center: boundary.center,
        zoom: boundary.zoom,
        scrollWheelZoom: false,
        attributionControl: true,
      });

      // Add tile layer (using CartoDB Positron for a clean look)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);

      // Add hinterland polygon (outer, lighter)
      L.polygon(boundary.hinterland, {
        color: '#94a3b8',
        weight: 1,
        fillColor: '#e2e8f0',
        fillOpacity: 0.3,
        dashArray: '5, 5',
      }).addTo(map).bindPopup(`<strong>Hinterland</strong><br/>${boundary.hinterlandLabel}`);

      // Add core polygon (inner, darker)
      L.polygon(boundary.core, {
        color: '#1e293b',
        weight: 2,
        fillColor: '#475569',
        fillOpacity: 0.2,
      }).addTo(map).bindPopup(`<strong>${boundary.name}</strong><br/>Core neighborhood`);

      // Add center marker
      L.circleMarker(boundary.center, {
        radius: 6,
        fillColor: '#1e293b',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1,
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
  }, [boundary, isClient]);

  if (!boundary) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className="w-full h-64 rounded-lg border border-neutral-200" />
      <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-slate-600/20 border-2 border-slate-800 rounded-sm" />
            Core
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-slate-200/30 border border-slate-400 border-dashed rounded-sm" />
            Hinterland
          </span>
        </div>
        <span className="text-neutral-400">{boundary.hinterlandLabel}</span>
      </div>
    </div>
  );
}
