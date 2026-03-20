import { BrowserWindow, screen } from 'electron';
import type { BrowserWindowConstructorOptions, WebPreferences } from 'electron';

// ── Shared CSS reset + theme tokens ──

export const BASE_CSS = `* { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
html, body { background: transparent; overflow: hidden; }
body { font-family: 'Segoe UI', system-ui, sans-serif; color: #e0e0e0; }
:root {
  --overlay-bg: rgba(14, 14, 18, 0.92);
  --gold: #ffd54f;
  --gold-border: rgba(255, 213, 79, 0.2);
  --gold-glow: rgba(255, 213, 79, 0.06);
  --shadow: 0 0 24px rgba(0,0,0,0.6);
}`;

// ── Overlay window factory ──

export interface OverlayOptions {
  width: number;
  height: number;
  position: { x: number; y: number } | 'center' | 'top-center';
  focusable?: boolean;
  webPreferences?: WebPreferences;
  extra?: Partial<BrowserWindowConstructorOptions>;
}

export function createOverlayWindow(html: string, opts: OverlayOptions): BrowserWindow {
  const { width, height } = opts;

  let x: number;
  let y: number;
  if (opts.position === 'center') {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().bounds;
    x = Math.round((sw - width) / 2);
    y = Math.round((sh - height) / 2);
  } else if (opts.position === 'top-center') {
    const { width: sw } = screen.getPrimaryDisplay().bounds;
    x = Math.round((sw - width) / 2);
    y = 0;
  } else {
    x = opts.position.x;
    y = opts.position.y;
  }

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: opts.focusable ?? false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      ...opts.webPreferences,
    },
    ...opts.extra,
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  return win;
}

// ── Type-narrowing guard ──

export function isAlive(win: BrowserWindow | null): win is BrowserWindow {
  return win !== null && !win.isDestroyed();
}

// ── Safe executeJavaScript with null/destroyed guard ──

export async function safeExec<T>(win: BrowserWindow | null, script: string): Promise<T | undefined> {
  if (!isAlive(win)) return undefined;
  try {
    return await win.webContents.executeJavaScript(script);
  } catch {
    return undefined;
  }
}

// ── Execute script expecting { w, h } and resize window ──

export async function safeExecAndResize(win: BrowserWindow | null, script: string): Promise<void> {
  const result = await safeExec<{ w: number; h: number }>(win, script);
  if (!result || !isAlive(win)) return;
  const bounds = win.getBounds();
  win.setBounds({ x: bounds.x, y: bounds.y, width: result.w, height: result.h });
}
