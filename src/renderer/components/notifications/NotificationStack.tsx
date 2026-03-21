import React from 'react';
import { useNotificationStore } from '../../stores/notificationStore';

const NOTIF_COLORS = {
  everyone: {
    text: '#ffd54f',
    border: 'rgba(255, 213, 79, 0.4)',
    bg: 'linear-gradient(180deg, rgba(40, 32, 8, 0.85) 0%, rgba(24, 20, 6, 0.92) 100%)',
    shadow: '0 0 20px rgba(255, 213, 79, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  officers: {
    text: '#c084fc',
    border: 'rgba(192, 132, 252, 0.4)',
    bg: 'linear-gradient(180deg, rgba(32, 16, 48, 0.85) 0%, rgba(18, 8, 32, 0.92) 100%)',
    shadow: '0 0 20px rgba(192, 132, 252, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  crew: {
    text: '#f87171',
    border: 'rgba(248, 113, 113, 0.4)',
    bg: 'linear-gradient(180deg, rgba(48, 16, 16, 0.85) 0%, rgba(32, 8, 8, 0.92) 100%)',
    shadow: '0 0 20px rgba(248, 113, 113, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4)',
  },
} as const;

export function NotificationStack() {
  const notifications = useNotificationStore((s) => s.notifications);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] flex flex-col gap-2 pointer-events-none">
      {notifications.map((n) => {
        const colors = NOTIF_COLORS[n.targetKind ?? 'everyone'];
        return (
          <div
            key={n.id}
            className="animate-notification-enter px-8 py-4 rounded-lg"
            style={{
              border: `1px solid ${colors.border}`,
              background: colors.bg,
              backdropFilter: 'blur(12px)',
              boxShadow: colors.shadow,
            }}
          >
            <div
              className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-1 flex items-center gap-1.5"
              style={{ color: colors.text, opacity: 0.6 }}
            >
              {n.senderRole === 'owner' && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3 7h7l-5.5 4.5 2 7L12 16l-6.5 4.5 2-7L2 9h7z"/></svg>
              )}
              {n.senderRole === 'officer' && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3 7h7l-5.5 4.5 2 7L12 16l-6.5 4.5 2-7L2 9h7z"/></svg>
              )}
              <span>{n.senderName}</span>
              {n.targetLabel && n.targetKind !== 'everyone' && (
                <>
                  <span style={{ opacity: 0.5, fontSize: '14px' }}>{'\u2192'}</span>
                  <span>{n.targetLabel}</span>
                </>
              )}
            </div>
            <div
              className="text-2xl font-bold whitespace-pre-wrap break-words max-w-[500px]"
              style={{ color: colors.text }}
            >
              {n.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
