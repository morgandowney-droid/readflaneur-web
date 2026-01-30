'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { NEIGHBORHOOD_BOUNDARIES } from '@/lib/neighborhood-boundaries';

interface NeighborhoodMapProps {
  neighborhoodId: string;
  className?: string;
}

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

      // Add custom styles to grey out attribution
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

      // Load Leaflet JS dynamically to avoid SSR issues
      const L = (await import('leaflet')).default;

      // Create map
      const map = L.map(mapRef.current!, {
        center: boundary.center,
        zoom: boundary.zoom,
        scrollWheelZoom: false,
        attributionControl: false, // Disable default attribution
      });

      // Add custom attribution (without Leaflet branding)
      L.control.attribution({
        prefix: false, // Remove "Leaflet" text and flag
      }).addTo(map);

      // Add tile layer (using CartoDB Positron for a clean look)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '<a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);

      // Add adjacent neighborhood polygons (hinterland)
      boundary.adjacentNeighborhoods.forEach((adjacent) => {
        L.polygon(adjacent.polygon, {
          color: '#94a3b8',
          weight: 1,
          fillColor: '#e2e8f0',
          fillOpacity: 0.2,
          dashArray: '4, 4',
        }).addTo(map).bindPopup(`<strong>${adjacent.name}</strong>`);
      });

      // Add main neighborhood polygon (core) - on top
      L.polygon(boundary.polygon, {
        color: '#dc2626', // Red like Google Maps
        weight: 3,
        fillColor: '#fecaca',
        fillOpacity: 0.15,
      }).addTo(map).bindPopup(`<strong>${boundary.name}</strong><br/>${boundary.city}`);

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

  // Open in external maps app
  const handleOpenInMaps = () => {
    if (!boundary) return;

    const [lat, lng] = boundary.center;
    const query = encodeURIComponent(`${boundary.name}, ${boundary.city}`);

    // Check if iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      // Apple Maps
      window.location.href = `maps://maps.apple.com/?q=${query}&ll=${lat},${lng}&z=${boundary.zoom}`;
    } else {
      // Google Maps (opens in app if installed, otherwise web)
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}&center=${lat},${lng}&zoom=${boundary.zoom}`, '_blank');
    }
  };

  if (!boundary) {
    return null;
  }

  // Get adjacent neighborhood names for legend
  const adjacentNames = boundary.adjacentNeighborhoods.map(n => n.name).join(', ');

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className="w-full h-64 rounded-lg border border-neutral-200" />

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-red-100 border-2 border-red-600 rounded-sm" />
            {boundary.name}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-slate-100 border border-slate-400 border-dashed rounded-sm" />
            Hinterlands
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

      <p className="mt-1 text-xs text-neutral-400">
        {adjacentNames}
      </p>
    </div>
  );
}
