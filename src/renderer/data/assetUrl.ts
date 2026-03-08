const isElectron = typeof window !== 'undefined' && !!(window as any).athena;

export function tileUrlTemplate(): string {
  return isElectron
    ? 'tile:///{z}/{z}_{x}_{y}.png'
    : '/assets/tiles/{z}/{z}_{x}_{y}.png';
}

export function iconUrl(iconFile: string): string {
  return isElectron ? `tile:///icons/${iconFile}` : `/assets/icons/${iconFile}`;
}

export function hexMapUrl(hexId: string, file: string): string {
  const filename = file || `Map${hexId}.png`;
  return isElectron ? `tile:///hexmaps/${filename}` : `/assets/hexmaps/${filename}`;
}
