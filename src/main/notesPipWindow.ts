import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

let notesPipWin: BrowserWindow | null = null;

const NOTES_PIP_WIDTH = 320;
const NOTES_PIP_HEIGHT = 160;
const NOTES_PIP_MARGIN = 16;

const NOTES_PIP_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    background: transparent;
    overflow: visible;
  }
  body {
    padding: 4px;
  }
  .panel {
    display: inline-block;
    background: rgba(12, 12, 16, 0.85);
    color: #fff;
    font-family: 'Cascadia Code', 'Consolas', 'SF Mono', monospace;
    font-size: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255, 213, 79, 0.2);
    -webkit-font-smoothing: antialiased;
    max-width: 380px;
    min-width: 220px;
  }
  .title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #ffd54f;
    margin-bottom: 8px;
    opacity: 0.8;
    cursor: grab;
    -webkit-app-region: drag;
  }
  .title:active { cursor: grabbing; }
  #notes-content {
    -webkit-app-region: no-drag;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    color: rgba(255, 255, 255, 0.8);
    font-family: inherit;
    font-size: inherit;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
    max-height: 400px;
    overflow-y: auto;
    width: 100%;
    padding: 0;
  }
  #notes-content:empty::before,
  #notes-content::placeholder {
    color: rgba(255, 255, 255, 0.25);
    font-style: italic;
  }
  #notes-content::-webkit-scrollbar {
    width: 4px;
  }
  #notes-content::-webkit-scrollbar-track {
    background: transparent;
  }
  #notes-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
  }
  #notes-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.22);
  }
</style>
</head>
<body>
  <div class="panel">
    <div class="title">Lobby Notes</div>
    <textarea id="notes-content" rows="5" maxlength="2000" placeholder="No notes"></textarea>
  </div>
  <script>
    document.getElementById('notes-content').addEventListener('input', (e) => {
      window.notesPipBridge.onTextChange(e.target.value);
    });
  </script>
</body>
</html>`;

function createNotesPipWindow(): BrowserWindow {
  const { width: screenW } = screen.getPrimaryDisplay().bounds;

  notesPipWin = new BrowserWindow({
    width: NOTES_PIP_WIDTH,
    height: NOTES_PIP_HEIGHT,
    x: screenW - NOTES_PIP_WIDTH - 200,
    y: NOTES_PIP_MARGIN + 160, // offset below artillery PIP default position
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'notesPipPreload.js'),
    },
  });

  notesPipWin.setAlwaysOnTop(true, 'screen-saver');
  notesPipWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(NOTES_PIP_HTML)}`);

  notesPipWin.on('closed', () => {
    notesPipWin = null;
  });

  return notesPipWin;
}

function resizeFromResult(result: { w: number; h: number } | undefined): void {
  if (!result || !notesPipWin || notesPipWin.isDestroyed()) return;
  const bounds = notesPipWin.getBounds();
  notesPipWin.setBounds({ x: bounds.x, y: bounds.y, width: result.w, height: result.h });
}

export function updateNotesPipData(text: string): void {
  if (!notesPipWin || notesPipWin.isDestroyed()) return;
  const escaped = JSON.stringify(text);
  const script = `(() => {
    const el = document.getElementById('notes-content');
    if (el.value !== ${escaped}) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = ${escaped};
      if (document.activeElement === el) {
        el.selectionStart = Math.min(start, el.value.length);
        el.selectionEnd = Math.min(end, el.value.length);
      }
    }
    const d = document.documentElement;
    return { w: d.scrollWidth, h: d.scrollHeight };
  })()`;
  notesPipWin.webContents.executeJavaScript(script)
    .then(resizeFromResult)
    .catch(() => {});
}

export function showNotesPip(text?: string): void {
  const freshlyCreated = !notesPipWin || notesPipWin.isDestroyed();
  if (freshlyCreated) {
    createNotesPipWindow();
  }

  const win = notesPipWin!;
  const escaped = JSON.stringify(text ?? '');
  const script = `(() => {
    const el = document.getElementById('notes-content');
    el.value = ${escaped};
    const d = document.documentElement;
    return { w: d.scrollWidth, h: d.scrollHeight };
  })()`;

  if (freshlyCreated || win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.executeJavaScript(script)
        .then(resizeFromResult)
        .catch(() => {});
    });
  } else {
    win.webContents.executeJavaScript(script)
      .then(resizeFromResult)
      .catch(() => {});
  }

  win.showInactive();
}

export function destroyNotesPip(): void {
  if (notesPipWin && !notesPipWin.isDestroyed()) {
    notesPipWin.destroy();
    notesPipWin = null;
  }
}
