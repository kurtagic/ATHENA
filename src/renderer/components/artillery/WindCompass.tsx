import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useArtilleryStore } from '../../stores/artilleryStore';
import { useMapStore } from '../../stores/mapStore';
import { recalcWind } from '../../map/artillery';
import flagWindImage from '../../../assets/Flag_Wind_Strengths.webp';

const SIZE = 340;
const CENTER = SIZE / 2;
const RINGS = 5;
const OUTER_R = CENTER - 24; // leave room for degree labels
const INNER_DEAD = OUTER_R / (RINGS + 1); // dead zone in center to clear wind
const RING_WIDTH = (OUTER_R - INNER_DEAD) / RINGS;

const CARDINALS: { label: string; angle: number }[] = [
  { label: 'N', angle: 0 },
  { label: 'E', angle: 90 },
  { label: 'S', angle: 180 },
  { label: 'W', angle: 270 },
];

export function WindCompass() {
  const windDirection = useArtilleryStore((s) => s.windDirection);
  const windStrength = useArtilleryStore((s) => s.windStrength);
  const setWind = useArtilleryStore((s) => s.setWind);
  const map = useMapStore((s) => s.mapInstance);
  const svgRef = useRef<SVGSVGElement>(null);
  const refBtnRef = useRef<HTMLSpanElement>(null);
  const [showRef, setShowRef] = useState(false);
  const refPos = (() => {
    if (!showRef || !refBtnRef.current) return { top: 0, left: 0 };
    const rect = refBtnRef.current.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.left };
  })();

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left - CENTER;
      const my = e.clientY - rect.top - CENTER;
      const dist = Math.sqrt(mx * mx + my * my);

      // Click in dead zone or on existing marker → clear wind
      if (dist < INNER_DEAD) {
        setWind(null, 0);
        if (map) recalcWind(map);
        return;
      }

      // Determine ring (1-5)
      const ringFloat = (dist - INNER_DEAD) / RING_WIDTH;
      const ring = Math.min(RINGS, Math.max(1, Math.ceil(ringFloat)));

      // Direction: atan2(dx, -dy) for compass bearing (N=0, E=90)
      const dirRad = Math.atan2(mx, -my);
      const dirDeg = ((dirRad * 180) / Math.PI + 360) % 360;

      setWind(dirDeg, ring);
      if (map) recalcWind(map);
    },
    [setWind, map],
  );

  // Compute marker position from current wind state
  let markerX: number | null = null;
  let markerY: number | null = null;
  if (windDirection !== null && windStrength > 0) {
    const r = INNER_DEAD + (windStrength - 0.5) * RING_WIDTH;
    const rad = (windDirection * Math.PI) / 180;
    markerX = CENTER + r * Math.sin(rad);
    markerY = CENTER - r * Math.cos(rad);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Flag reference — shown on hover of ? icon, portaled to body to escape overflow:hidden */}
      <div className="inline-flex items-center gap-1 self-start">
        <span className="text-[9px] text-white/30 uppercase tracking-[0.08em]">Wind Ref</span>
        <span
          ref={refBtnRef}
          className="w-4 h-4 flex items-center justify-center rounded-full border border-white/20 text-[9px] text-white/40 cursor-help hover:border-white/40 hover:text-white/60"
          onMouseEnter={() => setShowRef(true)}
          onMouseLeave={() => setShowRef(false)}
        >?</span>
        {showRef && createPortal(
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{ top: refPos.top, left: refPos.left }}
          >
            <img
              src={flagWindImage}
              alt="Wind Strength Reference"
              className="w-[700px] rounded shadow-lg"
              draggable={false}
            />
          </div>,
          document.body,
        )}</div>
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        className="cursor-crosshair"
        onClick={handleClick}
      >
        {/* Background */}
        <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="rgba(10,10,14,0.8)" />

        {/* Concentric rings */}
        {Array.from({ length: RINGS }, (_, i) => {
          const ring = i + 1;
          const r = INNER_DEAD + ring * RING_WIDTH;
          return (
            <circle
              key={ring}
              cx={CENTER}
              cy={CENTER}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
            />
          );
        })}

        {/* Inner dead zone circle */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={INNER_DEAD}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* 30-degree tick marks */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = i * 30;
          const rad = (angle * Math.PI) / 180;
          const x1 = CENTER + (OUTER_R - 4) * Math.sin(rad);
          const y1 = CENTER - (OUTER_R - 4) * Math.cos(rad);
          const x2 = CENTER + OUTER_R * Math.sin(rad);
          const y2 = CENTER - OUTER_R * Math.cos(rad);
          return (
            <line
              key={angle}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={1}
            />
          );
        })}

        {/* Degree labels at every 30° */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = i * 30;
          const isCardinal = angle % 90 === 0;
          const cardinal = CARDINALS.find((c) => c.angle === angle);
          const rad = (angle * Math.PI) / 180;
          const labelR = OUTER_R + 14;
          const x = CENTER + labelR * Math.sin(rad);
          const y = CENTER - labelR * Math.cos(rad);
          return (
            <text
              key={angle}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isCardinal ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)'}
              fontSize={isCardinal ? 14 : 12}
              fontWeight={isCardinal ? 'bold' : 'normal'}
              fontFamily="sans-serif"
            >
              {cardinal ? cardinal.label : angle}
            </text>
          );
        })}

        {/* Wind vector line + marker */}
        {markerX !== null && markerY !== null && (
          <>
            <line
              x1={CENTER}
              y1={CENTER}
              x2={markerX}
              y2={markerY}
              stroke="var(--color-gold)"
              strokeWidth={2}
              opacity={0.7}
            />
            <circle
              cx={markerX}
              cy={markerY}
              r={5}
              fill="var(--color-gold)"
              stroke="rgba(0,0,0,0.5)"
              strokeWidth={1.5}
            />
            {/* Center dot */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={3}
              fill="var(--color-gold)"
              opacity={0.5}
            />
          </>
        )}

        {/* Center X if no wind */}
        {windDirection === null && (
          <text
            x={CENTER}
            y={CENTER}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.2)"
            fontSize={12}
            fontFamily="sans-serif"
          >
            No wind
          </text>
        )}
      </svg>

      {/* Wind strength indicator text */}
      {windDirection !== null && windStrength > 0 && (
        <span className="text-[14px] text-white/50 tabular-nums">
          {windDirection.toFixed(0)}&deg; / Strength {windStrength}
        </span>
      )}

    </div>
  );
}
