const isElectron = typeof window !== 'undefined' && !!(window as any).athena;

export const mapFormat = import.meta.env.VITE_MAP_FORMAT === 'png' ? 'png' : 'webp';
export const tileExt = mapFormat === 'webp' ? 'webp' : 'png';

export function tileUrlTemplate(): string {
  return `tile:///${mapFormat}/{z}/{z}_{x}_{y}.${tileExt}`;
}

export function iconUrl(iconFile: string): string {
  return isElectron ? `tile:///icons/${iconFile}` : `/assets/icons/${iconFile}`;
}

export function hexMapUrl(hexId: string, file: string): string {
  const pngName = file || `Map${hexId}.png`;
  const filename = mapFormat === 'webp' ? pngName.replace(/\.png$/, '.webp') : pngName;
  const subpath = `hexmaps/${mapFormat}/${filename}`;
  return isElectron ? `tile:///${subpath}` : `/assets/${subpath}`;
}
