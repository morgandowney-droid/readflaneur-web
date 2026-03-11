'use client';

import { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
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

const MAPBOX_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/streets-v12',
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

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
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [isClient, setIsClient] = useState(false);
  const isUserPanning = useRef(false);
  const boundsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Keep refs in sync for event handlers
  useEffect(() => { hoveredIdRef.current = hoveredId; }, [hoveredId]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Initialize map
  useEffect(() => {
    if (!isClient || !mapRef.current || mapInstanceRef.current || !MAPBOX_TOKEN) return;

    const initMap = async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      mapboxgl.accessToken = MAPBOX_TOKEN;

      const map = new mapboxgl.Map({
        container: mapRef.current!,
        style: theme === 'dark' ? MAPBOX_STYLES.dark : MAPBOX_STYLES.light,
        center: [10, 30],
        zoom: 1.8,
        minZoom: 1.5,
        maxZoom: 16,
        attributionControl: true,
        projection: 'mercator',
      });

      // Compact attribution
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

      // Create popup (reused)
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 8,
        className: 'dest-mapbox-popup',
      });
      popupRef.current = popup;

      map.on('load', () => {
        // Add GeoJSON source for all destinations
        const features = allDestinations
          .filter(d => d.lat && d.lng)
          .map(d => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [d.lng, d.lat],
            },
            properties: {
              id: d.id,
              name: d.name,
              city: d.city,
              country: d.country,
            },
          }));

        map.addSource('destinations', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        });

        // Circle layer - all dots
        map.addLayer({
          id: 'destination-dots',
          type: 'circle',
          source: 'destinations',
          paint: {
            'circle-radius': [
              'case',
              ['any',
                ['==', ['get', 'id'], hoveredId || ''],
                ['==', ['get', 'id'], selectedId || ''],
              ],
              7,
              4.5,
            ],
            'circle-color': '#444444',
            'circle-opacity': 0.95,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.9,
          },
        });

        // Hover interaction
        map.on('mouseenter', 'destination-dots', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          if (!e.features?.[0]) return;
          const feat = e.features[0];
          const id = feat.properties?.id;
          const name = feat.properties?.name;
          const city = feat.properties?.city;
          const country = feat.properties?.country;
          const coords = (feat.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

          onHover(id);

          popup
            .setLngLat(coords)
            .setHTML(
              `<div style="font-family: var(--font-display, Georgia, serif); font-size: 13px; font-weight: 300; letter-spacing: 0.05em; padding: 6px 10px;">${name}<br/><span style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em; text-transform: uppercase;">${city}, ${country}</span></div>`
            )
            .addTo(map);
        });

        map.on('mouseleave', 'destination-dots', () => {
          map.getCanvas().style.cursor = '';
          onHover(null);
          popup.remove();
        });

        // Click interaction
        map.on('click', 'destination-dots', (e) => {
          if (!e.features?.[0]) return;
          const id = e.features[0].properties?.id;
          if (id) onSelect(id);
        });

        // Bounds change on user pan/zoom
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
      });

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]);

  // Update hovered/selected marker styling
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer('destination-dots')) return;

    map.setPaintProperty('destination-dots', 'circle-radius', [
      'case',
      ['any',
        ['==', ['get', 'id'], hoveredId || ''],
        ['==', ['get', 'id'], selectedId || ''],
      ],
      7,
      4.5,
    ]);

    map.setPaintProperty('destination-dots', 'circle-color', [
      'case',
      ['any',
        ['==', ['get', 'id'], hoveredId || ''],
        ['==', ['get', 'id'], selectedId || ''],
      ],
      '#333333',
      '#444444',
    ]);

    map.setPaintProperty('destination-dots', 'circle-stroke-width', [
      'case',
      ['any',
        ['==', ['get', 'id'], hoveredId || ''],
        ['==', ['get', 'id'], selectedId || ''],
      ],
      2,
      1.5,
    ]);
  }, [hoveredId, selectedId]);

  // Fly to selected destination
  useEffect(() => {
    if (!selectedId || !mapInstanceRef.current) return;
    const dest = allDestinations.find(d => d.id === selectedId);
    if (dest?.lat && dest?.lng) {
      isUserPanning.current = false;
      mapInstanceRef.current.flyTo({
        center: [dest.lng, dest.lat],
        zoom: 9,
        speed: 1.2,
        curve: 1.42,
        essential: true,
      });
    }
  }, [selectedId, allDestinations]);

  // Switch style on theme change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const newStyle = theme === 'dark' ? MAPBOX_STYLES.dark : MAPBOX_STYLES.light;
    map.setStyle(newStyle);

    // Re-add source and layer after style load
    map.once('style.load', () => {
      const features = allDestinations
        .filter(d => d.lat && d.lng)
        .map(d => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [d.lng, d.lat],
          },
          properties: {
            id: d.id,
            name: d.name,
            city: d.city,
            country: d.country,
          },
        }));

      if (!map.getSource('destinations')) {
        map.addSource('destinations', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        });
      }

      if (!map.getLayer('destination-dots')) {
        map.addLayer({
          id: 'destination-dots',
          type: 'circle',
          source: 'destinations',
          paint: {
            'circle-radius': 4.5,
            'circle-color': '#444444',
            'circle-opacity': 0.95,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.9,
          },
        });
      }
    });
  }, [theme, allDestinations]);

  // Fit bounds when filtered destinations change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || destinations.length === 0) return;

    const valid = destinations.filter(d => d.lat && d.lng);
    if (valid.length === 0) return;

    isUserPanning.current = false;

    const lngs = valid.map(d => d.lng);
    const lats = valid.map(d => d.lat);

    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 40, maxZoom: 12, duration: 600 }
    );
  }, [destinations]);

  // Inject popup styles
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('mapbox-popup-css')) return;
    const style = document.createElement('style');
    style.id = 'mapbox-popup-css';
    style.textContent = `
      .dest-mapbox-popup .mapboxgl-popup-content {
        background: var(--theme-surface, #121212);
        color: var(--theme-fg, #e5e5e5);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        padding: 0;
      }
      .dest-mapbox-popup .mapboxgl-popup-tip {
        border-top-color: var(--theme-surface, #121212);
      }
      .mapboxgl-ctrl-attrib {
        font-size: 9px !important;
        background: transparent !important;
      }
      .mapboxgl-ctrl-attrib a { color: #888 !important; }
    `;
    document.head.appendChild(style);
  }, []);

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
