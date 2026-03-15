// ── Stamp icon definitions + canvas cache ──

export type StampType = 'target' | 'shield' | 'skull' | 'flag' | 'eye' | 'star' | 'warning' | 'x-mark';

type DrawFn = (ctx: OffscreenCanvasRenderingContext2D, size: number, color: string) => void;

// Helper: draw a path twice — first as a thick black outline, then as the colored stroke
function outlinedStroke(ctx: OffscreenCanvasRenderingContext2D, color: string, innerWidth: number, drawPath: () => void): void {
  // Black outline pass
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = innerWidth + 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawPath();
  ctx.stroke();
  // Colored pass
  ctx.strokeStyle = color;
  ctx.lineWidth = innerWidth;
  drawPath();
  ctx.stroke();
}

function outlinedFill(ctx: OffscreenCanvasRenderingContext2D, color: string, borderWidth: number, drawPath: () => void): void {
  // Black outline pass
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = borderWidth;
  ctx.lineJoin = 'round';
  drawPath();
  ctx.stroke();
  // Colored fill
  ctx.fillStyle = color;
  drawPath();
  ctx.fill();
}

const STAMP_DRAW_FNS: Record<StampType, DrawFn> = {
  target: (ctx, size, color) => {
    const cx = size / 2, cy = size / 2;
    const path1 = () => { ctx.beginPath(); ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2); };
    const path2 = () => { ctx.beginPath(); ctx.arc(cx, cy, size * 0.2, 0, Math.PI * 2); };
    const path3 = () => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.45); ctx.lineTo(cx, cy + size * 0.45);
      ctx.moveTo(cx - size * 0.45, cy); ctx.lineTo(cx + size * 0.45, cy);
    };
    outlinedStroke(ctx, color, 2.5, path1);
    outlinedStroke(ctx, color, 2.5, path2);
    outlinedStroke(ctx, color, 2.5, path3);
  },

  shield: (ctx, size, color) => {
    const cx = size / 2;
    const shieldPath = () => {
      ctx.beginPath();
      ctx.moveTo(cx, size * 0.08);
      ctx.lineTo(size * 0.85, size * 0.25);
      ctx.lineTo(size * 0.85, size * 0.55);
      ctx.quadraticCurveTo(cx, size * 0.95, cx, size * 0.95);
      ctx.quadraticCurveTo(cx, size * 0.95, size * 0.15, size * 0.55);
      ctx.lineTo(size * 0.15, size * 0.25);
      ctx.closePath();
    };
    outlinedStroke(ctx, color, 3, shieldPath);
  },

  skull: (ctx, size, color) => {
    const cx = size / 2, cy = size * 0.4;
    const headPath = () => {
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.3, Math.PI, 0);
      ctx.lineTo(cx + size * 0.3, cy + size * 0.15);
      ctx.quadraticCurveTo(cx + size * 0.25, cy + size * 0.3, cx + size * 0.1, cy + size * 0.3);
      ctx.lineTo(cx - size * 0.1, cy + size * 0.3);
      ctx.quadraticCurveTo(cx - size * 0.25, cy + size * 0.3, cx - size * 0.3, cy + size * 0.15);
      ctx.closePath();
    };
    outlinedStroke(ctx, color, 2.5, headPath);
    // Eyes
    const eye1 = () => { ctx.beginPath(); ctx.arc(cx - size * 0.12, cy, size * 0.07, 0, Math.PI * 2); };
    const eye2 = () => { ctx.beginPath(); ctx.arc(cx + size * 0.12, cy, size * 0.07, 0, Math.PI * 2); };
    outlinedFill(ctx, color, 2, eye1);
    outlinedFill(ctx, color, 2, eye2);
    // Jaw lines
    const jawPath = () => {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.08, cy + size * 0.3);
      ctx.lineTo(cx - size * 0.08, cy + size * 0.42);
      ctx.moveTo(cx, cy + size * 0.3);
      ctx.lineTo(cx, cy + size * 0.42);
      ctx.moveTo(cx + size * 0.08, cy + size * 0.3);
      ctx.lineTo(cx + size * 0.08, cy + size * 0.42);
    };
    outlinedStroke(ctx, color, 2.5, jawPath);
  },

  flag: (ctx, size, color) => {
    const px = size * 0.3;
    // Pole
    const polePath = () => {
      ctx.beginPath();
      ctx.moveTo(px, size * 0.1);
      ctx.lineTo(px, size * 0.9);
    };
    outlinedStroke(ctx, color, 3, polePath);
    // Flag shape
    const flagPath = () => {
      ctx.beginPath();
      ctx.moveTo(px, size * 0.1);
      ctx.lineTo(size * 0.8, size * 0.25);
      ctx.lineTo(px, size * 0.45);
      ctx.closePath();
    };
    outlinedStroke(ctx, color, 3, flagPath);
  },

  eye: (ctx, size, color) => {
    const cx = size / 2, cy = size / 2;
    const eyePath = () => {
      ctx.beginPath();
      ctx.moveTo(size * 0.08, cy);
      ctx.quadraticCurveTo(cx, cy - size * 0.35, size * 0.92, cy);
      ctx.quadraticCurveTo(cx, cy + size * 0.35, size * 0.08, cy);
    };
    outlinedStroke(ctx, color, 2.5, eyePath);
    // Iris
    const irisPath = () => { ctx.beginPath(); ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2); };
    outlinedFill(ctx, color, 2, irisPath);
  },

  star: (ctx, size, color) => {
    const cx = size / 2, cy = size / 2;
    const outerR = size * 0.42, innerR = size * 0.18;
    const starPath = () => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const outerAngle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const innerAngle = outerAngle + Math.PI / 5;
        if (i === 0) ctx.moveTo(cx + outerR * Math.cos(outerAngle), cy + outerR * Math.sin(outerAngle));
        else ctx.lineTo(cx + outerR * Math.cos(outerAngle), cy + outerR * Math.sin(outerAngle));
        ctx.lineTo(cx + innerR * Math.cos(innerAngle), cy + innerR * Math.sin(innerAngle));
      }
      ctx.closePath();
    };
    outlinedStroke(ctx, color, 3, starPath);
  },

  warning: (ctx, size, color) => {
    const cx = size / 2;
    // Triangle
    const triPath = () => {
      ctx.beginPath();
      ctx.moveTo(cx, size * 0.08);
      ctx.lineTo(size * 0.9, size * 0.88);
      ctx.lineTo(size * 0.1, size * 0.88);
      ctx.closePath();
    };
    outlinedStroke(ctx, color, 3, triPath);
    // Exclamation mark
    const barPath = () => {
      ctx.beginPath();
      ctx.moveTo(cx, size * 0.35);
      ctx.lineTo(cx, size * 0.63);
    };
    outlinedStroke(ctx, color, 3, barPath);
    const dotPath = () => { ctx.beginPath(); ctx.arc(cx, size * 0.73, 3, 0, Math.PI * 2); };
    outlinedFill(ctx, color, 2, dotPath);
  },

  'x-mark': (ctx, size, color) => {
    const m = size * 0.2;
    ctx.lineCap = 'round';
    const xPath = () => {
      ctx.beginPath();
      ctx.moveTo(m, m);
      ctx.lineTo(size - m, size - m);
      ctx.moveTo(size - m, m);
      ctx.lineTo(m, size - m);
    };
    outlinedStroke(ctx, color, 4, xPath);
  },
};

// Cache keyed by type-color-size
const stampCache = new Map<string, CanvasImageSource>();

export function getStampImage(type: StampType, color: string, size: number): CanvasImageSource {
  const key = `${type}-${color}-${size}`;
  const cached = stampCache.get(key);
  if (cached) return cached;

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const drawFn = STAMP_DRAW_FNS[type];
  if (drawFn) drawFn(ctx, size, color);

  stampCache.set(key, canvas);
  return canvas;
}

export const ALL_STAMP_TYPES: StampType[] = ['target', 'shield', 'skull', 'flag', 'eye', 'star', 'warning', 'x-mark'];

export const STAMP_LABELS: Record<StampType, string> = {
  target: 'Target',
  shield: 'Shield',
  skull: 'Skull',
  flag: 'Flag',
  eye: 'Observe',
  star: 'Star',
  warning: 'Warning',
  'x-mark': 'X Mark',
};
