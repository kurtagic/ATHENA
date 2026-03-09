const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

const KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  '`': '`',
  '-': '-',
  '=': '=',
  '[': '[',
  ']': ']',
  '\\': '\\',
  ';': ';',
  "'": "'",
  ',': ',',
  '.': '.',
  '/': '/',
};

export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = KEY_MAP[e.key] || e.key;

  // Single letter keys should be uppercase
  if (key.length === 1 && key >= 'a' && key <= 'z') {
    key = key.toUpperCase();
  }

  parts.push(key);
  return parts.join('+');
}

const DISPLAY_MAP: Record<string, string> = {
  'CommandOrControl': 'Ctrl',
  'Command': 'Cmd',
  'Control': 'Ctrl',
  'Shift': 'Shift',
  'Alt': 'Alt',
  'Space': 'Space',
  'Up': '\u2191',
  'Down': '\u2193',
  'Left': '\u2190',
  'Right': '\u2192',
  'Escape': 'Esc',
  'Backspace': 'Bksp',
  'Delete': 'Del',
  '`': '`',
};

/**
 * Check if an Electron accelerator matches a DOM KeyboardEvent.
 * For keyup events, only the base key is compared (modifiers ignored)
 * to ensure reliable release detection.
 */
export function acceleratorMatchesKeyEvent(
  accel: string,
  e: KeyboardEvent,
  eventType: 'keydown' | 'keyup' = 'keydown'
): boolean {
  const parts = accel.split('+');
  const baseKey = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1).map((m) => m.toLowerCase()));

  // Normalize the event key for comparison
  let eventKey = e.key;
  // Map special keys back
  const reverseMap: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  };
  eventKey = reverseMap[eventKey] || eventKey;

  // Case-insensitive letter comparison
  const keysMatch =
    baseKey.length === 1 && baseKey >= 'A' && baseKey <= 'Z'
      ? eventKey.toUpperCase() === baseKey.toUpperCase()
      : eventKey === baseKey;

  if (!keysMatch) return false;

  // For keyup, only match base key (ignore modifiers)
  if (eventType === 'keyup') return true;

  // For keydown, also check modifiers
  const wantCtrl = modifiers.has('commandorcontrol') || modifiers.has('control') || modifiers.has('command');
  const wantAlt = modifiers.has('alt');
  const wantShift = modifiers.has('shift');

  if ((e.ctrlKey || e.metaKey) !== wantCtrl) return false;
  if (e.altKey !== wantAlt) return false;
  if (e.shiftKey !== wantShift) return false;

  return true;
}

export function acceleratorToDisplay(accel: string): string {
  return accel
    .split('+')
    .map((part) => DISPLAY_MAP[part] || part)
    .join(' + ');
}
