import React from 'react';
import { Grid3x3, MapPin, Building2, Pencil, Crosshair, Hexagon, type LucideIcon } from 'lucide-react';
import { useLayerStore } from '../../stores/layerStore';

const LAYER_ICONS: Record<string, LucideIcon> = {
  hexGrid: Grid3x3,
  staticLabels: MapPin,
  structures: Building2,
  drawings: Pencil,
  artillery: Crosshair,
  voronoi: Hexagon,
};

const LAYER_GROUPS = [
  { label: 'Map Elements', keys: ['hexGrid', 'staticLabels', 'structures', 'voronoi'] },
  { label: 'Artillery', keys: ['artillery'] },
  { label: 'Markings', keys: ['drawings'] },
];

export function LayersPanel() {
  const layers = useLayerStore((s) => s.layers);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);

  return (
    <div className="flex flex-col h-full">
      <div className="relative px-5 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[13px] uppercase tracking-[0.14em] text-[var(--color-gold)]">Layers</span>
          <div className="flex-1 h-px bg-gradient-to-r from-[var(--color-gold-dim)] to-transparent" />
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3">
        {LAYER_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.12em] text-white/30 font-semibold px-2 mb-0.5">
              {group.label}
            </span>
            {group.keys.map((key) => {
              const config = layers[key];
              if (!config) return null;
              const Icon = LAYER_ICONS[key];
              return (
                <label
                  key={key}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer transition-colors duration-150 hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={config.visible}
                    onChange={() => toggleLayer(key)}
                    className="layer-checkbox"
                  />
                  {Icon && <Icon size={13} className="text-white/40 shrink-0" />}
                  <span className="text-[12px] text-white/80 font-medium select-none">
                    {config.label}
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
