import React, { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { createMap } from '../../map/mapInit';
import { createHexGrid, showHexLabels, hideHexLabels, showHexGrid, hideHexGrid } from '../../map/hexGrid';
import { initLayerControl, onZoomChange } from '../../map/layerControl';
import { initDetailView, enterDetailMode, getDetailMode, getSelectedHexes, renderDetailMarkers, renderDetailLabels, refreshVoronoiFills, showDetailMarkers, hideDetailMarkers } from '../../map/detailView';
import { setupDrawingEvents, showDrawCanvas, hideDrawCanvas } from '../../map/drawing';
import { setupArtilleryEvents, showArtillery, hideArtillery, showArtilleryRings, hideArtilleryRings } from '../../map/artillery';
import { useGlobalKeyboard } from '../../hooks/useGlobalKeyboard';
import { updateWarStatus, updateHexItems, updateStaticLabels, setDetailRefreshCallback } from '../../data/dataHandlers';
import { SELECTION_POLL_MS } from '../../../shared/constants';
import { webAdapter } from '../../data/webAdapter';
import { useMapStore } from '../../stores/mapStore';
import { useLayerStore } from '../../stores/layerStore';

export function MapLibreMap() {
  const initializedRef = useRef(false);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useGlobalKeyboard(mapRef);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const container = document.getElementById('maplibre-container');
    if (!container) return;

    const map = createMap(container);
    mapRef.current = map;
    useMapStore.getState().setMapInstance(map);

    map.on('load', () => {
      // Init hex grid
      createHexGrid(map, (hexId) => {
        if (!getDetailMode()) {
          enterDetailMode(hexId);
        }
      });

      // Init layer control
      initLayerControl(map);

      // Init detail view
      initDetailView(map);

      // Wire detail refresh
      setDetailRefreshCallback((mapName) => {
        const dm = getDetailMode();
        if (dm && dm.apiName === mapName) {
          renderDetailMarkers(mapName);
          renderDetailLabels(mapName);
          refreshVoronoiFills(mapName);
        }
      });

      // Init drawing events
      setupDrawingEvents(map);

      // Init artillery events
      setupArtilleryEvents(map);

      // Data source setup
      const athena = (window as any).athena;
      if (athena) {
        // Electron IPC mode
        athena.onWarStatus((data: any) => updateWarStatus(data));
        athena.onHexItems((data: any) => updateHexItems(data));

        athena.loadStaticData().then((staticData: Record<string, any[]> | null) => {
          if (!staticData) {
            console.log('[Athena] static_data.json not found — run fetch-static first');
            return;
          }
          for (const [mapName, labels] of Object.entries(staticData)) {
            updateStaticLabels({ mapName, labels }, map);
          }
          console.log(`[Athena] Loaded static labels for ${Object.keys(staticData).length} hexes from disk`);
          onZoomChange();
        });

        setInterval(() => {
          athena.setSelectedHexes(getSelectedHexes());
        }, SELECTION_POLL_MS);
      } else {
        // Web mode — use browser-side polling
        webAdapter.onWarStatus((data) => updateWarStatus(data));
        webAdapter.onHexItems((data) => updateHexItems(data));

        webAdapter.loadStaticData().then((staticData) => {
          if (!staticData) {
            console.log('[Athena] static_data.json not found — run fetch-static first');
            return;
          }
          for (const [mapName, labels] of Object.entries(staticData)) {
            updateStaticLabels({ mapName, labels }, map);
          }
          console.log(`[Athena] Loaded static labels for ${Object.keys(staticData).length} hexes from disk`);
          onZoomChange();
        });

        setInterval(() => {
          webAdapter.setSelectedHexes(getSelectedHexes());
        }, SELECTION_POLL_MS);

        webAdapter.startPolling();
      }
    });
  }, []);

  // Subscribe to mapCursor changes
  useEffect(() => {
    let prev = useMapStore.getState().mapCursor;
    const unsub = useMapStore.subscribe((state) => {
      if (state.mapCursor !== prev) {
        prev = state.mapCursor;
        const map = mapRef.current;
        if (map) map.getContainer().style.cursor = state.mapCursor;
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to layerStore changes
  useEffect(() => {
    const unsub = useLayerStore.subscribe((state) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      const dm = getDetailMode();

      if (!dm) {
        // World view toggles
        if (state.layers.hexGrid.visible) {
          showHexGrid(map);
          showHexLabels();
        } else {
          hideHexGrid(map);
          hideHexLabels();
        }
      } else {
        // Detail view toggles
        if (state.layers.structures.visible) showDetailMarkers();
        else hideDetailMarkers();

        if (state.layers.drawings.visible) showDrawCanvas();
        else hideDrawCanvas();

        if (state.layers.artillery.visible) {
          showArtillery(map);
          showArtilleryRings(map);
        } else {
          hideArtillery(map);
          hideArtilleryRings(map);
        }

        if (map.getLayer('voronoi-fill')) {
          map.setLayoutProperty('voronoi-fill', 'visibility',
            state.layers.voronoi.visible ? 'visible' : 'none');
        }
        if (map.getLayer('voronoi-lines')) {
          map.setLayoutProperty('voronoi-lines', 'visibility',
            state.layers.voronoi.visible ? 'visible' : 'none');
        }
      }

      // Handles staticLabels + hexGrid zoom gating (respects layer store)
      onZoomChange();
    });
    return () => unsub();
  }, []);

  return <div id="maplibre-container" className="w-full h-full" />;
}
