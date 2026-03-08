import React from 'react';
import { MapLibreMap } from '../map/MapLibreMap';
import { useDrawStore } from '../../stores/drawStore';

export function MapPanel() {
  const eraserPosition = useDrawStore((s) => s.eraserPosition);
  const eraserRadius = useDrawStore((s) => s.eraserRadius);
  const eraserActive = useDrawStore((s) => s.eraserActive);

  const d = eraserRadius * 2;

  return (
    <div
      id="ide-map-panel"
      className="relative overflow-hidden"
      style={{ gridArea: 'map' }}
    >
      <MapLibreMap />
      {eraserActive && eraserPosition && (
        <div
          style={{
            position: 'absolute',
            left: eraserPosition.x,
            top: eraserPosition.y,
            width: d,
            height: d,
            borderRadius: '50%',
            border: '2px solid rgba(239, 83, 80, 0.8)',
            background: 'rgba(239, 83, 80, 0.1)',
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        />
      )}
    </div>
  );
}
