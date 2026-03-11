import React, { useState, useRef } from 'react';
import { Grid3x3, MapPin, Building2, Pencil, Crosshair, Hexagon, Send, type LucideIcon } from 'lucide-react';
import { useLayerStore } from '../../stores/layerStore';
import { useSessionStore } from '../../stores/sessionStore';
import { session } from '../../multiplayer/sessionManager';

const LAYER_ICONS: Record<string, LucideIcon> = {
  hexGrid: Grid3x3,
  staticLabels: MapPin,
  structures: Building2,
  drawings: Pencil,
  artillery: Crosshair,
  voronoi: Hexagon,
};

const LAYER_GROUPS = [
  { label: 'Map Elements', keys: ['hexGrid', 'staticLabels', 'structures', 'voronoi'] },
  { label: 'Artillery', keys: ['artillery'] },
  { label: 'Markings', keys: ['drawings'] },
];

export function LayersPanel() {
  const layers = useLayerStore((s) => s.layers);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);
  const lobbyId = useSessionStore((s) => s.lobbyId);
  const [notifText, setNotifText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = !!lobbyId && notifText.trim().length > 0;

  const handleSendNotification = () => {
    if (!canSend) return;
    session.sendCustomNotification(notifText.trim());
    setNotifText('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendNotification();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header relative px-5 pt-3.5 pb-3">
        <span className="font-bold text-[13px] uppercase tracking-[0.14em] text-[var(--color-gold)]">Layers</span>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3">
        {LAYER_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.12em] text-white/30 font-semibold px-2 mb-0.5">
              {group.label}
            </span>
            {group.keys.map((key) => {
              const config = layers[key];
              if (!config) return null;
              const Icon = LAYER_ICONS[key];
              return (
                <label
                  key={key}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer transition-colors duration-150 hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={config.visible}
                    onChange={() => toggleLayer(key)}
                    className="layer-checkbox"
                  />
                  {Icon && <Icon size={13} className="text-white/40 shrink-0" />}
                  <span className="text-[12px] text-white/80 font-medium select-none">
                    {config.label}
                  </span>
                </label>
              );
            })}
          </div>
        ))}

        {/* Notifications */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.12em] text-white/30 font-semibold px-2 mb-0.5">
            Notifications
          </span>
          <div className="px-2 flex flex-col gap-1.5">
            <div className="relative">
              <textarea
                ref={textareaRef}
                rows={4}
                maxLength={256}
                value={notifText}
                onChange={(e) => setNotifText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={lobbyId ? 'Broadcast message...' : 'Join a lobby to send'}
                disabled={!lobbyId}
                className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border-tactical)] bg-[var(--color-surface-inset)] text-[12px] text-white/80 placeholder:text-white/25 px-2.5 py-2 outline-none transition-colors duration-150 focus:border-[var(--color-border-focus)] disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <span className="absolute bottom-1.5 right-2 text-[9px] text-white/20">
                {notifText.length}/256
              </span>
            </div>
            <button
              onClick={handleSendNotification}
              disabled={!canSend}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-gold)]/30 text-[var(--color-gold)] text-[11px] font-bold uppercase tracking-[0.1em] cursor-pointer transition-all duration-150 hover:bg-[var(--color-gold-dim)] hover:border-[var(--color-gold)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-[var(--color-gold)]/30"
              style={{ background: 'rgba(255, 213, 79, 0.06)' }}
            >
              <Send size={11} />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
