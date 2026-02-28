import L from 'leaflet';
import type { HexItemsPayload, StaticLabelsPayload, MapItem, WarStatus } from '../../shared/types';
import { ICON_TYPE_MAP, MAJOR_STRUCTURES, RESOURCE_NODES, TEAM_COLOR, TEAM_NONE_COLOR } from './iconTypes';
import { resolveHex, apiToLatLng } from './hexMapping';
import { hexStaticData, hexDynamicData } from './store';

// Re-export for convenience
export { hexStaticData, hexDynamicData };

export function buildMarkerHtml(it: MapItem): { html: string; size: number } {
  const teamId = it.teamId || 'NONE';
  const color = TEAM_COLOR[teamId] || TEAM_NONE_COLOR;
  const flags = it.flags || 0;
  const isVictory = !!(flags & 0x01);
  const isScorched = !!(flags & 0x10);

  let size = 28;
  if (MAJOR_STRUCTURES.has(it.iconType)) size = 36;
  else if (RESOURCE_NODES.has(it.iconType)) size = 22;

  const iconFile = ICON_TYPE_MAP[it.iconType];
  let classes = 'map-icon';
  if (isVictory) classes += ' victory';
  if (isScorched) classes += ' scorched';
  const bg = isScorched ? '#222' : color;

  let html = `<div class="${classes}" style="width:${size}px;height:${size}px;background:${bg};">`;
  if (iconFile) {
    html += `<img src="tile:///icons/${iconFile}">`;
  }
  html += '</div>';
  return { html, size };
}

export function updateWarStatus(data: WarStatus): void {
  console.log('[Athena] War status data:', data);
}

// Callback for refreshing detail markers when hex items update
let _onDetailRefresh: ((mapName: string) => void) | null = null;

export function setDetailRefreshCallback(cb: (mapName: string) => void): void {
  _onDetailRefresh = cb;
}

export function updateHexItems(data: HexItemsPayload): void {
  const { mapName, items } = data;
  console.log('[Athena] updateHexItems:', mapName, 'items =', items.length);

  // Cache for detail view
  hexDynamicData[mapName] = items;

  // If in detail mode for this hex, refresh detail markers
  if (_onDetailRefresh) {
    _onDetailRefresh(mapName);
  }
}

export function updateStaticLabels(data: StaticLabelsPayload, staticLabelLayer: L.LayerGroup): void {
  const { mapName, labels } = data;
  const hex = resolveHex(mapName);
  if (!hex) {
    console.warn(`[dataHandlers] updateStaticLabels: resolveHex("${mapName}") returned undefined — skipping ${labels.length} labels`);
    return;
  }
  console.log('[Athena] updateStaticLabels:', mapName, 'labels =', labels.length);

  // Cache for detail view
  hexStaticData[mapName] = labels;

  for (const lbl of labels) {
    const latlng = apiToLatLng(hex, lbl.x, lbl.y);
    const isMajor = lbl.mapMarkerType === 'Major';
    const cls = isMajor ? 'map-text-major' : 'map-text-minor';
    const size: [number, number] = isMajor ? [160, 20] : [140, 16];

    L.marker(latlng, {
      interactive: false,
      pane: 'labelPane',
      icon: L.divIcon({
        className: cls,
        html: lbl.text,
        iconSize: size,
        iconAnchor: [size[0] / 2, size[1] / 2],
      }),
    }).addTo(staticLabelLayer);
  }
}
