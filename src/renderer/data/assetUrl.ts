const isElectron = typeof window !== 'undefined' && !!(window as any).athena;

const hexFormat = import.meta.env.VITE_HEXMAP_FORMAT === 'png' ? 'png' : 'webp';

export function tileUrlTemplate(): string {
  return 'tile:///{z}/{z}_{x}_{y}.png';
}

export function iconUrl(iconFile: string): string {
  return isElectron ? `tile:///icons/${iconFile}` : `/assets/icons/${iconFile}`;
}

export function hexMapUrl(hexId: string, file: string): string {
  const pngName = file || `Map${hexId}.png`;
  const filename = hexFormat === 'webp' ? pngName.replace(/\.png$/, '.webp') : pngName;
  const subpath = `hexmaps/${hexFormat}/${filename}`;
  return isElectron ? `tile:///${subpath}` : `/assets/${subpath}`;
}
