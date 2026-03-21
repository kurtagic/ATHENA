import maplibregl from 'maplibre-gl';
import type { HexItemsPayload, StaticLabelsPayload, MapItem, WarStatus } from '../../shared/types';
import { ICON_TYPE_MAP, MAJOR_STRUCTURES, RESOURCE_NODES, TEAM_COLOR, TEAM_NONE_COLOR } from './iconTypes';
import { resolveHex, apiToMapPoint } from './hexMapping';
import { mapPointToLngLat } from './coords';
import { iconUrl } from './assetUrl';
import { hexStaticData, hexDynamicData } from './store';
import { minimapNotify } from '../multiplayer/minimapNotify';
import { setStaticLabelMarkers } from '../map/layerControl';

// Re-export for convenience
export { hexStaticData, hexDynamicData };

export function buildMarkerHtml(it: MapItem): { html: string; size: number } {
  const teamId = it.teamId || 'NONE';
  const color = TEAM_COLOR[teamId] || TEAM_NONE_COLOR;
  const flags = it.flags || 0;
  const isVictory = !!(flags & 0x01);
  const isScorched = !!(flags & 0x10);

  let size = 36;
  if (MAJOR_STRUCTURES.has(it.iconType)) size = 46;
  else if (RESOURCE_NODES.has(it.iconType)) size = 30;

  const iconFile = ICON_TYPE_MAP[it.iconType];
  let classes = 'map-icon';
  if (isVictory) classes += ' victory';
  if (isScorched) classes += ' scorched';

  const tint = isScorched ? '#555' : color;

  let html = `<div class="${classes}" style="width:${size}px;height:${size}px;">`;
  if (iconFile) {
    const url = iconUrl(iconFile);
    html += `<img src="${url}">`;
    html += `<span class="icon-tint" style="background:${tint};-webkit-mask-image:url(${url});mask-image:url(${url});"></span>`;
  }
  html += '</div>';
  return { html, size };
}

export function updateWarStatus(_data: WarStatus): void {
  // Currently unused — war status displayed via other channels
}

// Callback for refreshing detail markers when hex items update
let _onDetailRefresh: ((mapName: string) => void) | null = null;

export function setDetailRefreshCallback(cb: (mapName: string) => void): void {
  _onDetailRefresh = cb;
}

export function updateHexItems(data: HexItemsPayload): void {
  const { mapName, items } = data;
  // Cache for detail view
  hexDynamicData[mapName] = items;

  // If in detail mode for this hex, refresh detail markers
  if (_onDetailRefresh) {
    _onDetailRefresh(mapName);
  }

  minimapNotify('structures', mapName);
}

// Static label markers stored for visibility toggling
const staticMarkers: maplibregl.Marker[] = [];

export function updateStaticLabels(data: StaticLabelsPayload, map: maplibregl.Map): void {
  const { mapName, labels } = data;
  const hex = resolveHex(mapName);
  if (!hex) {
    console.warn(`[dataHandlers] updateStaticLabels: resolveHex("${mapName}") returned undefined — skipping ${labels.length} labels`);
    return;
  }
  // Cache for detail view
  hexStaticData[mapName] = labels;

  for (const lbl of labels) {
    const point = apiToMapPoint(hex, lbl.x, lbl.y);
    const lngLat = mapPointToLngLat(point);
    const isMajor = lbl.mapMarkerType === 'Major';
    const cls = isMajor ? 'map-text-major' : 'map-text-minor';

    const el = document.createElement('div');
    el.className = cls;
    el.textContent = lbl.text;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(lngLat)
      .addTo(map);

    // Start hidden — layerControl shows at zoom >= 5
    el.style.display = 'none';

    staticMarkers.push(marker);
  }

  // Update layerControl's reference
  setStaticLabelMarkers(staticMarkers);
}

export function removeStaticLabelMarkers(): void {
  for (const m of staticMarkers) m.remove();
}

export function addStaticLabelMarkers(map: maplibregl.Map): void {
  for (const m of staticMarkers) m.addTo(map);
}
