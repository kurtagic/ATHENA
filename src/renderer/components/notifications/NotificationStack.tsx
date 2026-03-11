import React from 'react';
import { useNotificationStore } from '../../stores/notificationStore';

export function NotificationStack() {
  const notifications = useNotificationStore((s) => s.notifications);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] flex flex-col gap-2 pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="animate-notification-enter px-8 py-4 rounded-lg border border-[var(--color-gold)]/40"
          style={{
            background: 'linear-gradient(180deg, rgba(40, 32, 8, 0.85) 0%, rgba(24, 20, 6, 0.92) 100%)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 0 20px rgba(255, 213, 79, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-gold)]/60 font-semibold mb-1">
            {n.senderName}
          </div>
          <div className="text-2xl font-bold text-[var(--color-gold)] whitespace-pre-wrap break-words max-w-[500px]">
            {n.text}
          </div>
        </div>
      ))}
    </div>
  );
}
