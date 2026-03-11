'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type L from 'leaflet';
import type { Map as LeafletMap, CircleMarker, TileLayer } from 'leaflet';
import type { Destination } from './DestinationsClient';

interface Props {
  destinations: Destination[];
  allDestinations: Destination[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: { north: number; south: number; east: number; west: number }) => void;
  theme: 'dark' | 'light';
}

const TILE_URLS = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
  light: 'https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}@2x.png',
};

export function DestinationsMap({
  destinations,
  allDestinations,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  onBoundsChange,
  theme,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, CircleMarker>>(new Map());
  const tileRef = useRef<TileLayer | null>(null);
  const [isClient, setIsClient] = useState(false);
  const isUserPanning = useRef(false);
  const boundsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!isClient || !mapRef.current || mapInstanceRef.current) return;

    const loadMap = async () => {
      // Inject Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!document.getElementById('destinations-map-css')) {
        const style = document.createElement('style');
        style.id = 'destinations-map-css';
        style.textContent = `
          .leaflet-control-attribution {
            font-size: 9px !important;
            color: #999 !important;
            background: transparent !important;
          }
          .leaflet-control-attribution a { color: #888 !important; }
          .destinations-map .leaflet-control-zoom { border: none !important; }
          .destinations-map .leaflet-control-zoom a {
            background: var(--theme-surface, #121212) !important;
            color: var(--theme-fg, #e5e5e5) !important;
            border: 1px solid var(--theme-border, rgba(255,255,255,0.08)) !important;
            width: 32px !important; height: 32px !important;
            line-height: 32px !important; font-size: 16px !important;
          }
          .destinations-map .leaflet-control-zoom a:hover {
            background: var(--theme-elevated, #1a1a1a) !important;
          }
          .dest-popup .leaflet-popup-content-wrapper {
            background: var(--theme-surface, #121212);
            color: var(--theme-fg, #e5e5e5);
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            padding: 0;
          }
          .dest-popup .leaflet-popup-tip { background: var(--theme-surface, #121212); }
          .dest-popup .leaflet-popup-content { margin: 10px 14px; }
        `;
        document.head.appendChild(style);
      }

      const L = (await import('leaflet')).default;

      const map = L.map(mapRef.current!, {
        center: [30, 10],
        zoom: 2,
        scrollWheelZoom: true,
        zoomControl: true,
        attributionControl: false,
        minZoom: 2,
        maxZoom: 16,
      });

      L.control.attribution({ prefix: false }).addTo(map);

      const isDark = theme === 'dark';
      const tileLayer = L.tileLayer(isDark ? TILE_URLS.dark : TILE_URLS.light, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);
      tileRef.current = tileLayer;

      // Emit bounds on move
      map.on('moveend', () => {
        if (!isUserPanning.current) return;
        if (boundsTimeoutRef.current) clearTimeout(boundsTimeoutRef.current);
        boundsTimeoutRef.current = setTimeout(() => {
          const b = map.getBounds();
          onBoundsChange({
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
          });
        }, 300);
      });

      map.on('dragstart', () => { isUserPanning.current = true; });
      map.on('zoomstart', () => { isUserPanning.current = true; });

      mapInstanceRef.current = map;

      // Add markers for all destinations
      addMarkers(L, map, allDestinations);
    };

    loadMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]);

  // Add/update markers
  const addMarkers = useCallback((L: typeof import('leaflet'), map: LeafletMap, dests: Destination[]) => {
    // Clear existing
    markersRef.current.forEach(m => m.remove());
    markersRef.current.clear();

    for (const d of dests) {
      if (!d.lat || !d.lng) continue;

      const marker = L.circleMarker([d.lat, d.lng], {
        radius: 5,
        fillColor: '#1a1a1a',
        fillOpacity: 0.9,
        color: '#000000',
        weight: 1,
        opacity: 0.7,
      }).addTo(map);

      marker.on('mouseover', () => {
        onHover(d.id);
        marker.setRadius(8);
        marker.setStyle({ fillOpacity: 1, weight: 2 });
        marker.bindPopup(
          `<div style="font-family: var(--font-display); font-size: 13px; font-weight: 300; letter-spacing: 0.05em;">${d.name}<br/><span style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em; text-transform: uppercase;">${d.city}, ${d.country}</span></div>`,
          { className: 'dest-popup', closeButton: false, offset: [0, -4] }
        ).openPopup();
      });

      marker.on('mouseout', () => {
        onHover(null);
        marker.setRadius(5);
        marker.setStyle({ fillOpacity: 0.8, weight: 1 });
        marker.closePopup();
      });

      marker.on('click', () => onSelect(d.id));

      markersRef.current.set(d.id, marker);
    }
  }, [onHover, onSelect]);

  // Highlight hovered marker
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      if (id === hoveredId || id === selectedId) {
        marker.setRadius(9);
        marker.setStyle({ fillColor: '#333333', fillOpacity: 1, weight: 2, color: '#000000' });
      } else {
        marker.setRadius(5);
        marker.setStyle({ fillColor: '#1a1a1a', fillOpacity: 0.9, weight: 1, color: '#000000' });
      }
    });
  }, [hoveredId, selectedId]);

  // Fly to selected
  useEffect(() => {
    if (!selectedId || !mapInstanceRef.current) return;
    const dest = allDestinations.find(d => d.id === selectedId);
    if (dest?.lat && dest?.lng) {
      isUserPanning.current = false;
      mapInstanceRef.current.flyTo([dest.lat, dest.lng], 9, { duration: 0.8 });
    }
  }, [selectedId, allDestinations]);

  // Update tile layer on theme change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const updateTiles = async () => {
      const L = (await import('leaflet')).default;
      if (tileRef.current) {
        tileRef.current.remove();
      }
      const isDark = theme === 'dark';
      tileRef.current = L.tileLayer(isDark ? TILE_URLS.dark : TILE_URLS.light, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current!);
    };

    updateTiles();
  }, [theme]);

  // Fit bounds when region/country changes (reset map view)
  useEffect(() => {
    if (!mapInstanceRef.current || destinations.length === 0) return;

    const lats = destinations.filter(d => d.lat && d.lng).map(d => d.lat);
    const lngs = destinations.filter(d => d.lat && d.lng).map(d => d.lng);
    if (lats.length === 0) return;

    isUserPanning.current = false;

    const padding = 40;
    mapInstanceRef.current.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [padding, padding], maxZoom: 12, animate: true, duration: 0.6 }
    );
  }, [destinations]);

  if (!isClient) {
    return (
      <div className="w-full h-full bg-surface flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-fg-subtle border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className="destinations-map w-full h-full"
      style={{ background: 'var(--theme-surface, #121212)' }}
    />
  );
}
